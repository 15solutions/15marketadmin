import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import { ChevronDown, ChevronUp, Check, Search, History, ArrowUp, ArrowDown, X } from 'lucide-react';
import { priceSocketService } from '../utils/priceSocket';
import { KEEPER_URL_ARC } from '../constants';
import { GlobalTradeScroller } from './GlobalTradeScroller';
import { FlipClock, ProgressBeam, ResolvingOutcome, TradeOutcome } from './TradingWidget';
import { isTradeSettled, isTradeInFlight, isTradeOverdue, isWinningTrade } from '../utils/tradeStatus';

const LOGO_MAP = {
  eth: '/ethusdc.png',
  btc: '/btc.png',
  sol: '/sol.png',
  mon: '/monad.png',
  avax: '/avax.png',
};

const ASSET_META = {
  BTC: { glyph: '₿', color: '#f7931a' },
  ETH: { glyph: '◆', color: '#627eea' },
  SOL: { glyph: '≡', color: '#9945ff' },
  AVAX: { glyph: '▲', color: '#e84142' },
  MON: { glyph: 'M', color: '#836ef9' },
};

const getAssetMeta = (token) => {
  const symbol = (token?.symbol || token?.id || '').toUpperCase();
  return ASSET_META[symbol] || {
    glyph: (symbol || '•').charAt(0) || '•',
    color: '#ffffff',
  };
};

const WHEEL_ROW_H = 58;
// Most rows the wheel will show at once. The window is sized from the token
// count at runtime so the whole list fits on a phone without repeating an
// asset on screen.
const WHEEL_MAX_ROWS = 6;

// Modulo that always returns a valid index for arrays shorter than `n`.
const wrapIdx = (n, total) => ((n % total) + total) % total;

/**
 * Nearest position congruent to `idx` in the infinite list.
 *
 * The wheel position is never reset to a small number, so switching assets
 * moves the wheel by the fewest possible rows instead of jumping across the
 * whole list — that is what keeps the loop seamless.
 */
const nearestWrappedIndex = (current, idx, total) => idx + Math.round((current - idx) / total) * total;

function getLogoFilter(isLight) {
  if (isLight) return 'brightness(0)';
  return 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)';
}

/**
 * WheelRow — one row of the continuous asset wheel. Every visual property is
 * derived from a motion value, so the row scales and fades continuously with
 * the drag instead of snapping between discrete states.
 */
function WheelRow({ token, index, wheelPos, boxH, onTap, activeAssetSymbol, isLight }) {
  const distance = useTransform(wheelPos, (v) => Math.abs(v - index));
  const scale = useTransform(distance, [0, 1, 2, 3], [1.6, 1.08, 0.72, 0.28]);
  const opacity = useTransform(distance, [0, 1, 2, 3], [1, 0.82, 0.45, 0.12]);
  const y = useTransform(wheelPos, (v) => (boxH / 2 - 22) - (index - v) * WHEEL_ROW_H);

  const assetMeta = getAssetMeta(token);
  const isActive = (activeAssetSymbol || '').toUpperCase() === (token?.symbol || '').toUpperCase();
  const logoSrc = LOGO_MAP[(token?.id || token?.symbol || '').toLowerCase()];

  return (
    <motion.button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onTap();
      }}
      className="w-full flex items-center justify-center gap-2 bg-transparent border-none outline-none"
      style={{
        height: `${WHEEL_ROW_H}px`,
        position: 'absolute',
        left: '50%',
        width: '140px',
        marginLeft: '-70px',
        y,
        scale,
        opacity,
        background: 'transparent',
        boxShadow: 'none',
        border: 'none',
        outline: 'none',
        pointerEvents: 'auto',
        cursor: 'pointer',
        touchAction: 'none',
        transformOrigin: 'center',
        willChange: 'transform, opacity',
      }}
    >
      {logoSrc ? (
        <img
          src={logoSrc}
          alt={token.symbol}
          style={{
            width: 22,
            height: 22,
            objectFit: 'contain',
            flexShrink: 0,
            filter: getLogoFilter(isLight),
          }}
        />
      ) : (
        <motion.small
          style={{
            fontSize: 15,
            color: assetMeta.color,
            filter: 'brightness(1.4)',
            lineHeight: 1,
            minWidth: 14,
            textAlign: 'center',
          }}
        >
          {assetMeta.glyph}
        </motion.small>
      )}

      <motion.span
        style={{
          fontSize: 15,
          letterSpacing: '0.06em',
          color: isLight ? '#111827' : '#ffffff',
          fontWeight: 800,
          lineHeight: 1,
          position: 'relative',
        }}
      >
        {token.symbol}
      </motion.span>
    </motion.button>
  );
}

/**
 * MobileSteppedChart — High-performance Canvas stepped-line (ladder) chart.
 * Renders the exact stepped line, soft area fill, dashed strike line,
 * hollow current price ring, and green live price badge pill matching the reference design.
 */
function MobileSteppedChart({
  symbol = 'ETHUSDT',
  theme = 'light',
  currentPrice,
  activeTrades = [],
  windowMs = 25000,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const priceHistoryRef = useRef([]);
  const rafRef = useRef(null);
  const targetPriceRef = useRef(null);
  const interpolatedPriceRef = useRef(null);
  const yMinRef = useRef(null);
  const yMaxRef = useRef(null);
  const activeTradesRef = useRef(activeTrades);
  const isLight = theme === 'light';
  const GREEN = '#17A364';

  useEffect(() => { activeTradesRef.current = activeTrades; }, [activeTrades]);

  const numericPrice = parseFloat(currentPrice) || 0;

  // Live-only: no stored history anywhere. Every mount starts from an
  // empty buffer that fills with real streamed ticks — never seeded,
  // shifted or synthesised.

  // Initialize: start empty on every mount/symbol. Live streamed ticks fill
  // the buffer within a second — nothing stored, nothing seeded.
  useEffect(() => {
    priceHistoryRef.current = [];
    interpolatedPriceRef.current = null;
    targetPriceRef.current = null;
  }, [symbol]);

  // Listen to the BACKEND price relay only. The backend engine (cache.prices) is
  // the single source of truth for settlement, so the chart must NEVER stream a
  // different client-side feed (Binance/MEXC) or the drawn line can disagree with
  // the settled verdict.
  useEffect(() => {
    const symKey = (symbol || 'ETHUSDT').replace('USDT', '').toLowerCase();

    const handlePrice = (data) => {
      if (data && data.source === 'backend' && data.key === symKey) {
        const p = parseFloat(data.price);
        if (!isNaN(p) && p > 0) {
          targetPriceRef.current = p;
          if (interpolatedPriceRef.current === null) {
            interpolatedPriceRef.current = p;
          }
        }
      }
    };

    const unbind = priceSocketService.on('price', handlePrice);
    return () => unbind();
  }, [symbol]);

  // Prefer the backend engine's per-trade tick price when this symbol has an
  // in-flight trade — that is the EXACT price the settlement compares against,
  // so chart line, countdown and outcome can never disagree.
  useEffect(() => {
    const symKey = (symbol || 'ETHUSDT').replace('USDT', '').toLowerCase();
    const active = (activeTradesRef.current || []).find(t =>
      ['PENDING', 'RESOLVING'].includes(t.status) &&
      (t.symbol || '').toLowerCase() === symKey
    );
    const p = active ? parseFloat(active.livePrice || active.lastTickPrice) : NaN;
    if (!isNaN(p) && p > 0) {
      targetPriceRef.current = p;
      if (interpolatedPriceRef.current === null) {
        interpolatedPriceRef.current = p;
      }
    }
  }, [activeTrades, symbol]);

  // Sync with prop currentPrice if provided
  useEffect(() => {
    if (numericPrice > 0) {
      targetPriceRef.current = numericPrice;
      if (interpolatedPriceRef.current === null) {
        interpolatedPriceRef.current = numericPrice;
      }
    }
  }, [numericPrice]);

  // Append live points to the rolling history every 50ms (memory only,
  // never persisted).
  useEffect(() => {
    const iv = setInterval(() => {
      if (interpolatedPriceRef.current !== null) {
        const now = Date.now();
        const history = priceHistoryRef.current;
        const last = history[history.length - 1];

        // Step toward target — 0.45 tracks backend relay ticks (1Hz) without lag
        if (targetPriceRef.current !== null) {
          const diff = targetPriceRef.current - interpolatedPriceRef.current;
          interpolatedPriceRef.current += diff * 0.45;
        }

        if (!last || now > last.t) {
          history.push({ t: now, p: interpolatedPriceRef.current });
        }
        if (history.length > 500) {
          priceHistoryRef.current = history.slice(-300);
        }
      }
    }, 50);

    return () => clearInterval(iv);
  }, [symbol]);

  // Main Canvas Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });

    const draw = () => {
      const container = containerRef.current;
      const W = container ? container.offsetWidth : canvas.offsetWidth;
      const H = container ? container.offsetHeight : canvas.offsetHeight;

      if (!W || !H) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        ctx.scale(dpr, dpr);
      }

      ctx.clearRect(0, 0, W, H);

      const history = priceHistoryRef.current;
      const latestPrice = interpolatedPriceRef.current || (history.length > 0 ? history[history.length - 1].p : NaN);
      // No live price yet (fresh login, stream not arrived): draw nothing
      // rather than a hardcoded fallback value.
      if (!isFinite(latestPrice) || latestPrice <= 0) {
        rafRef.current = requestAnimationFrame(draw);
        return;
      }

      const now = Date.now();
      const startTime = now - windowMs;

      // Layout boundaries
      const SCREEN_SHIFT = 40;
      const priceScaleWidth = 84;
      const liveXBoundary = W - priceScaleWidth - SCREEN_SHIFT;
      // Allow negative X so the line extends past the left edge of the screen
      const getX = (t) => Math.min(liveXBoundary, ((t - startTime) / windowMs) * liveXBoundary);

      // Calculate visible price range — include points slightly before the window for the offscreen lead-in
      let pMin = latestPrice;
      let pMax = latestPrice;
      let visiblePoints = [];

      for (let i = 0; i < history.length; i++) {
        const pt = history[i];
        // Include points from 20% before the window start for offscreen lead-in
        if (pt.t >= startTime - windowMs * 0.2) {
          visiblePoints.push(pt);
          if (pt.p < pMin) pMin = pt.p;
          if (pt.p > pMax) pMax = pt.p;
        }
      }

      if (visiblePoints.length === 0) {
        visiblePoints = [{ t: startTime, p: latestPrice }, { t: now, p: latestPrice }];
      }

      let diff = pMax - pMin;
      if (diff === 0) diff = latestPrice * 0.001;

      // 18% top and bottom padding for balanced breathing room
      const targetMin = pMin - diff * 0.18;
      const targetMax = pMax + diff * 0.18;

      if (yMinRef.current === null) {
        yMinRef.current = targetMin;
        yMaxRef.current = targetMax;
      } else {
        yMinRef.current += (targetMin - yMinRef.current) * 0.12;
        yMaxRef.current += (targetMax - yMaxRef.current) * 0.12;
      }

      const lo = yMinRef.current;
      const hi = yMaxRef.current;
      const range = (hi - lo) || 1;
      const toY = (p) => H - ((p - lo) / range) * H;

      const liveX = liveXBoundary;
      const liveY = toY(latestPrice);

      // 1. Horizontal Dashed Strike/Reference Line across the canvas
      const strikePrice = visiblePoints[0]?.p || latestPrice;
      const strikeY = Math.max(15, Math.min(H - 15, toY(strikePrice)));

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.14)' : 'rgba(255, 255, 255, 0.18)';
      ctx.lineWidth = 1.2;
      ctx.moveTo(0, strikeY);
      ctx.lineTo(W, strikeY);
      ctx.stroke();
      ctx.restore();

      // 2. Build the Smooth Line Path (round joins, flowing from offscreen left)
      // Start from offscreen left so the line appears to stream in from outside the screen
      const firstX = getX(visiblePoints[0].t);
      const leadInX = Math.min(firstX, -40); // Ensure we start well offscreen
      const firstY = toY(visiblePoints[0].p);

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(leadInX, firstY);
      ctx.lineTo(firstX, firstY);

      for (let i = 1; i < visiblePoints.length; i++) {
        const px = getX(visiblePoints[i].t);
        const py = toY(visiblePoints[i].p);
        ctx.lineTo(px, py);
      }

      // Connect to live point
      ctx.lineTo(liveX, liveY);

      // 3. Gradient Area Fill under the smooth path
      ctx.save();
      const fillPath = new Path2D();
      fillPath.moveTo(leadInX, firstY);
      fillPath.lineTo(firstX, firstY);
      for (let i = 1; i < visiblePoints.length; i++) {
        const px = getX(visiblePoints[i].t);
        const py = toY(visiblePoints[i].p);
        fillPath.lineTo(px, py);
      }
      fillPath.lineTo(liveX, liveY);
      fillPath.lineTo(W, liveY);
      fillPath.lineTo(W, H);
      fillPath.lineTo(leadInX, H);
      fillPath.closePath();

      const fillGrad = ctx.createLinearGradient(0, liveY, 0, H);
      fillGrad.addColorStop(0, isLight ? 'rgba(23, 163, 100, 0.22)' : 'rgba(23, 163, 100, 0.28)');
      fillGrad.addColorStop(0.55, isLight ? 'rgba(23, 163, 100, 0.08)' : 'rgba(23, 163, 100, 0.10)');
      fillGrad.addColorStop(1, 'rgba(23, 163, 100, 0.0)');
      ctx.fillStyle = fillGrad;
      ctx.fill(fillPath);
      ctx.restore();

      // 4. Stroke the Smooth Line (round joins for anti-aliased rendering)
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 2.4;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
      ctx.restore();

      // 5. Current Price Marker (Hollow Ring with White Center & Green Border)
      ctx.beginPath();
      ctx.arc(liveX, liveY, 5, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // 6. Connected Live Price Pill Badge on the Right
      const priceText = latestPrice.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: latestPrice < 10 ? 4 : 2,
      });

      const badgeH = 24;
      const badgeW = priceScaleWidth - 6;
      const badgeX = liveX + 4;
      const badgeY = Math.max(4, Math.min(H - badgeH - 4, liveY - badgeH / 2));

      ctx.fillStyle = GREEN;
      ctx.beginPath();
      ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 6);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px "Comfortaa", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(priceText, badgeX + badgeW / 2, badgeY + badgeH / 2 + 1);

      // 7. Horizontal line after the price badge extending offscreen right
      const lineY = badgeY + badgeH / 2;
      ctx.save();
      ctx.beginPath();
      ctx.strokeStyle = GREEN;
      ctx.lineWidth = 1.8;
      ctx.moveTo(badgeX + badgeW, lineY);
      ctx.lineTo(W + 40, lineY);
      ctx.stroke();
      ctx.restore();

      // 7b. PRICE + TIME AXES — same recipe as the desktop chart, sized down:
      // static price grid labels in the right scale, time ticks along the
      // bottom. Drawn after the line so labels sit on top, before markers.
      {
        const roughStep = range / 5;
        const mag = Math.pow(10, Math.floor(Math.log10(roughStep)));
        const normStep = roughStep / mag;
        let stepMulti = 1;
        if (normStep < 1.5) stepMulti = 1;
        else if (normStep < 3) stepMulti = 2;
        else if (normStep < 7) stepMulti = 5;
        else stepMulti = 10;
        const tickStep = stepMulti * mag;
        const firstTick = Math.ceil(lo / tickStep) * tickStep;
        const maxF = mag < 1 ? -Math.floor(Math.log10(mag)) + 1 : 2;

        ctx.save();
        ctx.textAlign = 'left';
        ctx.font = '9px Comfortaa, sans-serif';
        ctx.beginPath();
        ctx.rect(liveXBoundary, 0, W - liveXBoundary, H);
        ctx.clip();
        for (let priceVal = firstTick; priceVal <= hi; priceVal += tickStep) {
          const y = toY(priceVal);
          if (isLight) {
            ctx.setLineDash([3, 6]);
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(liveXBoundary, y);
            ctx.stroke();
          }
          if (Math.abs(y - liveY) < 12) continue;
          ctx.setLineDash([]);
          ctx.fillStyle = isLight ? '#4B5563' : '#9CA3AF';
          ctx.fillText(priceVal.toLocaleString(undefined, { minimumFractionDigits: maxF, maximumFractionDigits: maxF }), liveXBoundary + 8, y + 3);
        }
        ctx.restore();

        const tickInterval = windowMs / 4;
        const startTick = Math.ceil(startTime / tickInterval) * tickInterval;
        ctx.save();
        ctx.textAlign = 'center';
        ctx.font = '9px Comfortaa, sans-serif';
        ctx.beginPath();
        ctx.rect(0, 0, liveXBoundary, H);
        ctx.clip();
        for (let t = startTick; t <= now; t += tickInterval) {
          const x = getX(t);
          if (isLight && x >= 0 && x <= liveXBoundary) {
            ctx.setLineDash([3, 6]);
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
          }
          const date = new Date(t);
          const timeStr = date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
          ctx.setLineDash([]);
          ctx.fillStyle = isLight ? '#4B5563' : '#9CA3AF';
          ctx.fillText(timeStr, x, H - 6);
        }
        ctx.restore();
        ctx.setLineDash([]);
      }

      // 8. ACTIVE TRADE ENTRY MARKERS — Dotted vertical lines + LIVE badge
      const trades = activeTradesRef.current;
      if (trades && trades.length > 0) {
        trades.forEach(trade => {
          const entryPrice = parseFloat(trade.entryPrice);
          if (isNaN(entryPrice)) return;

          const tid = String(trade.id);
          const start = trade.startTime || (tid.length > 12 ? parseInt(tid) : now);
          const duration = trade.duration || 15;
          const expiry = trade.expiryMs || (start + (duration * 1000));
          const isSettled = ['WON', 'LOST', 'PAID'].includes(trade.status);
          const isExpired = now >= expiry || isSettled;
          const isWon = trade.status === 'WON' || trade.status === 'PAID';

          const entryX = getX(start);
          if (entryX < -20 || entryX > W + 20) return;

          const entryY = toY(entryPrice);
          const remainingMs = Math.max(0, expiry - now);
          const remainingSec = (remainingMs / 1000).toFixed(1);

          const currentLivePrice = latestPrice;
          const isInProfit = typeof trade.won === 'boolean'
            ? trade.won
            : (trade.direction === 'UP' || trade.direction === 1 || String(trade.direction) === '1'
                ? currentLivePrice >= entryPrice
                : currentLivePrice <= entryPrice);

          // TARGET PRICE LINE — thick grey dashed line at the entry (target) price
          ctx.save();
          ctx.setLineDash([6, 5]);
          ctx.strokeStyle = isLight ? 'rgba(120,120,120,0.55)' : 'rgba(150,150,150,0.55)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(0, entryY);
          ctx.lineTo(W, entryY);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();

          // Target label — italic, small, on the right (just before the price scale)
          ctx.save();
          ctx.font = 'italic 600 7px Inter, system-ui, sans-serif';
          const entryDecimals = entryPrice < 10 ? 4 : 2;
          const tgtLabel = `TGT ${entryPrice.toFixed(entryDecimals)}`;
          const tgtLabelW = ctx.measureText(tgtLabel).width + 10;
          const tgtX = (W - priceScaleWidth) - tgtLabelW - 8;
          const tgtYTop = Math.max(4, Math.min(entryY - 12, H - 16));
          ctx.fillStyle = isLight ? 'rgba(255,255,255,0.85)' : 'rgba(30,34,32,0.85)';
          ctx.beginPath();
          ctx.roundRect(tgtX, tgtYTop, tgtLabelW, 11, 3);
          ctx.fill();
          ctx.fillStyle = isLight ? '#6b6b6b' : '#c9c9c9';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(tgtLabel, tgtX + 5, tgtYTop + 5.5);
          ctx.restore();

          // Badge — pinned to the entry point ON the price streaming line:
          // hover just above it when there is room, otherwise just below it.
          const badgeW2 = 68;
          const badgeH2 = 30;
          const badgeX2 = entryX - badgeW2 / 2;
          const flagGap2 = 5;
          let badgeY2, lineTop, lineBottom;
          if (entryY - badgeH2 - flagGap2 >= 4) {
            badgeY2 = entryY - badgeH2 - flagGap2;   // badge above the line point
            lineTop = badgeY2 + badgeH2;
            lineBottom = entryY;
          } else {
            badgeY2 = Math.min(H - badgeH2 - 6, entryY + flagGap2); // badge below
            lineTop = entryY;
            lineBottom = badgeY2;
          }

          let badgeColor, badgeGlow, resultText, resultColor;
          if (isSettled) {
            badgeColor = isWon ? 'rgba(23,163,100,0.95)' : 'rgba(240,76,76,0.95)';
            badgeGlow = isWon ? 'rgba(23,163,100,0.5)' : 'rgba(240,76,76,0.5)';
            resultText = isWon ? 'WON' : 'LOST';
            resultColor = isWon ? '#4ADE80' : '#FF7F50';
          } else {
            badgeColor = isLight ? 'rgba(23,163,100,0.92)' : 'rgba(20,71,44,0.92)';
            badgeGlow = 'rgba(23,163,100,0.35)';
          }

          // Soft glow behind vertical line
          if (lineBottom > lineTop) {
            const lineGlow = ctx.createLinearGradient(entryX - 10, 0, entryX + 10, 0);
            lineGlow.addColorStop(0, 'transparent');
            lineGlow.addColorStop(0.5, isSettled
              ? (isWon ? 'rgba(23,163,100,0.08)' : 'rgba(240,76,76,0.06)')
              : (isLight ? 'rgba(23,163,100,0.06)' : 'rgba(23,163,100,0.04)'));
            lineGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = lineGlow;
            ctx.fillRect(entryX - 10, lineTop, 20, lineBottom - lineTop);
          }

          // Dotted vertical line
          if (lineBottom > lineTop) {
            ctx.save();
            ctx.setLineDash([3, 4]);
            ctx.strokeStyle = isSettled
              ? (isWon ? 'rgba(23,163,100,0.5)' : 'rgba(240,76,76,0.4)')
              : (isLight ? 'rgba(23,163,100,0.45)' : 'rgba(23,163,100,0.35)');
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(entryX, lineTop);
            ctx.lineTo(entryX, lineBottom);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
          }

          // Entry price dot
          ctx.save();
          ctx.fillStyle = 'rgba(0,0,0,0.5)';
          ctx.beginPath();
          ctx.arc(entryX, entryY, 5, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(entryX, entryY, 4.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = isSettled ? (isWon ? GREEN : '#F04C4C') : GREEN;
          ctx.shadowBlur = 8;
          ctx.shadowColor = isSettled
            ? (isWon ? 'rgba(23,163,100,0.6)' : 'rgba(240,76,76,0.6)')
            : 'rgba(23,163,100,0.5)';
          ctx.beginPath();
          ctx.arc(entryX, entryY, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(entryX, entryY, 1.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();

          // Badge background
          ctx.save();
          ctx.shadowBlur = 20;
          ctx.shadowColor = badgeGlow;

          if (!isSettled) {
            const pulsePhase = Math.sin(now / 600) * 0.5 + 0.5;
            ctx.strokeStyle = `rgba(23,163,100,${0.15 + pulsePhase * 0.15})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.roundRect(badgeX2 - 2, badgeY2 - 2, badgeW2 + 4, badgeH2 + 4, 10);
            ctx.stroke();
          }

          ctx.fillStyle = badgeColor;
          ctx.beginPath();
          ctx.roundRect(badgeX2, badgeY2, badgeW2, badgeH2, 8);
          ctx.fill();

          const highlightGrad = ctx.createLinearGradient(badgeX2, badgeY2, badgeX2, badgeY2 + badgeH2);
          highlightGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
          highlightGrad.addColorStop(0.4, 'rgba(255,255,255,0.02)');
          highlightGrad.addColorStop(1, 'rgba(0,0,0,0.05)');
          ctx.fillStyle = highlightGrad;
          ctx.beginPath();
          ctx.roundRect(badgeX2, badgeY2, badgeW2, badgeH2, 8);
          ctx.fill();

          ctx.strokeStyle = isSettled
            ? (isWon ? 'rgba(23,163,100,0.6)' : 'rgba(240,76,76,0.5)')
            : 'rgba(23,163,100,0.5)';
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          ctx.roundRect(badgeX2, badgeY2, badgeW2, badgeH2, 8);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.restore();

          const iconCenterX = badgeX2 + 12;
          const iconCenterY = badgeY2 + badgeH2 / 2 - 2;
          const iconR = 4.5;

          if (isSettled) {
            const pulse = Math.sin(now / 200) * 0.15 + 0.85;
            ctx.save();
            ctx.globalAlpha = 1;
            ctx.translate(entryX, badgeY2 + badgeH2 / 2);
            ctx.shadowBlur = 14 * pulse;
            ctx.shadowColor = isWon ? 'rgba(74,222,128,0.6)' : 'rgba(255,127,80,0.5)';
            ctx.fillStyle = resultColor;
            ctx.font = '900 11px Inter, system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 2;
            ctx.strokeText(resultText, 0, 0);
            ctx.fillText(resultText, 0, 0);
            ctx.shadowBlur = 0;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';
            ctx.restore();
          } else {
            // Stopwatch icon
            ctx.save();
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.arc(iconCenterX, iconCenterY, iconR, 0, Math.PI * 2);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(iconCenterX, iconCenterY - iconR - 1);
            ctx.lineTo(iconCenterX, iconCenterY - iconR - 3);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(iconCenterX + iconR * 0.6, iconCenterY - iconR - 0.5);
            ctx.lineTo(iconCenterX + iconR * 0.85, iconCenterY - iconR - 2.5);
            ctx.stroke();

            const progress = 1 - (remainingMs / (duration * 1000));
            const handAngle = -Math.PI / 2 + (progress * Math.PI * 2);
            ctx.strokeStyle = '#4ADE80';
            ctx.lineWidth = 1.4;
            ctx.beginPath();
            ctx.moveTo(iconCenterX, iconCenterY);
            ctx.lineTo(
              iconCenterX + Math.cos(handAngle) * (iconR * 0.65),
              iconCenterY + Math.sin(handAngle) * (iconR * 0.65)
            );
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(iconCenterX, iconCenterY, 1, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.restore();

            // LIVE text
            const textStartX = iconCenterX + iconR + 3;
            ctx.fillStyle = '#4ADE80';
            ctx.font = '900 7px Inter, system-ui, sans-serif';
            ctx.textBaseline = 'top';
            ctx.fillText('LIVE', textStartX, badgeY2 + 5);

            // Countdown
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 9px IBM Plex Mono, monospace';
            ctx.textBaseline = 'top';
            const countdownStr = remainingSec < 10 ? `0${remainingSec}` : remainingSec;
            ctx.fillText(countdownStr, textStartX, badgeY2 + 16);
          }
        });
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [theme, symbol, windowMs]);

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-visible select-none">
      {/* Centered faint 15market watermark — theme aware like CustomChart */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <img
          src={isLight ? '/goblogo.png' : '/gowlogo.png'}
          alt="15market"
          className="w-[180px] object-contain select-none"
          style={{
            opacity: isLight ? 0.05 : 0.08,
            filter: isLight ? 'grayscale(1) brightness(0.1)' : 'grayscale(1) brightness(0.7)',
            mixBlendMode: isLight ? 'multiply' : 'screen',
          }}
        />
      </div>

      <canvas ref={canvasRef} className="w-full h-full block relative z-20" />
    </div>
  );
}

/**
 * MobileTradeView — The exact mobile layout matching the reference screenshot.
 */
export default function MobileTradeView({
  theme = 'light',
  activeMarket,
  handleMarketChange,
  defaultTokens = [],
  oraclePrices = {},
  changes24h = {},
  price,
  executeTrade,
  isExecuting,
  sessionBalance = 0,
  liveOdds,
  minStake = 1,
  tradeHistory = [],
  showFullHistory,
  setShowFullHistory,
  onViewReceipt,
  activeTrades = [],
  onCountdownEnd,
}) {
  const isLight = theme === 'light';
  const [assetOpen, setAssetOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const assetWheelRef = useRef(null);
  const [selectedDuration, setSelectedDuration] = useState(15);
  const [stakeInput, setStakeInput] = useState('');
  const [sliderPct, setSliderPct] = useState(0);
  const wheelTouchStart = useRef(null);
  // Timestamp of the last real drag, so the click that follows a swipe is
  // swallowed instead of selecting a row or dismissing the sheet.
  const wheelSwipedAt = useRef(0);
  const wheelScrollAt = useRef(0);

  // Continuous wheel position in row units. Deliberately unbounded: the list
  // loops forever, so the position keeps counting up (or down) and the asset
  // under the center is derived with a modulo rather than clamped to the ends.
  const wheelPos = useMotionValue(0);
  const wheelSettle = useRef(null);
  // Integer row currently in the center slot. Tracked in state because the
  // rendered window of rows is built from it, while the smooth pixel movement
  // stays on the motion value.
  const [wheelCenter, setWheelCenter] = useState(0);
  const wheelCenterRef = useRef(0);

  const [activeAssetSymbol, setActiveAssetSymbol] = useState(() => (activeMarket?.symbol || activeMarket?.id || 'ETH').toUpperCase());

  // Global / settled trades for the live market scroller
  const [tickerHistory, setTickerHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_global_history_v2");
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  useEffect(() => {
    setActiveAssetSymbol((activeMarket?.symbol || activeMarket?.id || 'ETH').toUpperCase());
  }, [activeMarket]);

  useEffect(() => {
    let active = true;
    const fetchTicker = async () => {
      try {
        const res = await fetch(`${KEEPER_URL_ARC}/history`);
        if (res.ok) {
          const data = await res.json();
          if (active && Array.isArray(data)) {
            data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            setTickerHistory(data.slice(0, 40));
          }
        }
      } catch (e) {}
    };
    fetchTicker();
    const iv = setInterval(fetchTicker, 12000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  const repeatedTicker = useMemo(() => {
    const list = tickerHistory.length > 0 ? tickerHistory : [
      { id: '1', symbol: 'ETH', direction: 'UP', status: 'WON', payout: '4.16' },
      { id: '2', symbol: 'BTC', direction: 'DOWN', status: 'WON', payout: '8.32' },
      { id: '3', symbol: 'SOL', direction: 'UP', status: 'WON', payout: '5.20' },
      { id: '4', symbol: 'ETH', direction: 'UP', status: 'WON', payout: '4.27' },
      { id: '5', symbol: 'BTC', direction: 'UP', status: 'WON', payout: '9.10' },
    ];
    let full = [...list];
    while (full.length < 24) full = [...full, ...list];
    return [...full, ...full];
  }, [tickerHistory]);

  const currentSymbol = (activeMarket?.symbol || activeMarket?.id || 'ETH').toUpperCase();
  const binanceSymbol = activeMarket?.binance || `${currentSymbol}USDT`;
  const livePriceNum = oraclePrices[(activeMarket?.id || 'eth').toLowerCase()] || parseFloat(price) || 0;

  const currentStake = parseFloat(stakeInput) || 0;

  // Safety: a trade the backend has failed to settle must never hold the widget
  // hostage.
  //
  // This used to try to self-heal by writing TIMEOUT back into the parent's
  // trade list via setActiveTrades - a prop this component is never given (it
  // only receives the `activeTrades` array). The timer callback therefore threw
  // a ReferenceError, the safety net never fired, and the trade stayed PENDING
  // forever. Because isTradeActive keys off currentActiveTrade, the trading
  // controls were never restored: the widget was simply unusable, with nothing
  // on screen to say why.
  //
  // A child must not mutate the parent's list, so instead the decision is made
  // here: once the grace window passes, the trade stops driving the countdown
  // and the controls come back. The trade itself is untouched and stays PENDING
  // in the history - an unsettled trade is never turned into a win or a loss
  // here, it waits for a real verdict or for an admin to clear it in disputes.
  //
  // Declared ahead of `currentActiveTrade` below because that memo reads it:
  // a `const` referenced above its own declaration is a TDZ ReferenceError,
  // which took down the whole component on first render.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Find the current active trade (PENDING or RESOLVING), EXCLUDING one the
  // backend has already failed to settle. An overdue trade stops driving the
  // countdown so the controls return, but it is still in `activeTrades` and
  // still renders as PENDING in the history - it is never given a verdict here.
  const currentActiveTrade = useMemo(() => {
    if (!activeTrades || activeTrades.length === 0) return null;
    const live = activeTrades.find(t => ['PENDING', 'RESOLVING'].includes(t.status)) || null;
    if (!live) return null;
    return isTradeOverdue(live, nowTick) ? null : live;
  }, [activeTrades, nowTick]);

  // Track settled trade for outcome display
  const [settledTrade, setSettledTrade] = useState(null);
  const [showOutcome, setShowOutcome] = useState(false);
  const settledTradeIdRef = useRef(null);
  const outcomeTimerRef = useRef(null);
  const [countdownEnded, setCountdownEnded] = useState(false);

  // Timer state for active trade countdown - MUST be declared before any useEffect
  // that references remainingSec or tradeProgress in dependency arrays
  const [remainingSec, setRemainingSec] = useState(0);
  const [tradeProgress, setTradeProgress] = useState(0);

  // Display each authoritative settlement once.
  // Uses refs for timer to avoid cleanup issues from changing deps.
  useEffect(() => {
    const settled = activeTrades?.find(t => ['WON', 'LOST', 'PAID'].includes(t.status));
    if (!settled) return;
    if (currentActiveTrade && (remainingSec > 0 || !countdownEnded)) return;

    const settlementId = String(settled.id ?? `${settled.timestamp ?? settled.settledAt ?? ''}-${settled.status}`);
    if (settledTradeIdRef.current === settlementId) return;
    settledTradeIdRef.current = settlementId;

    setSettledTrade(settled);
    setShowOutcome(true);

    if (outcomeTimerRef.current) clearTimeout(outcomeTimerRef.current);
    outcomeTimerRef.current = setTimeout(() => {
      setShowOutcome(false);
      setSettledTrade(null);
      settledTradeIdRef.current = null;
      outcomeTimerRef.current = null;
    }, 3000);
  }, [activeTrades, currentActiveTrade, remainingSec, countdownEnded]);

  // Auto-detect countdown end: when remainingSec hits 0 and trade is still PENDING,
  // wait a moment then mark countdown as ended so the trade can resolve.
  // Also capture the live price as the exit price immediately.
  useEffect(() => {
    if (remainingSec === 0 && currentActiveTrade && currentActiveTrade.status === 'PENDING') {
      const timer = setTimeout(() => {
        setCountdownEnded(true);
        if (onCountdownEnd) {
          onCountdownEnd(livePriceNum);
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
    if (currentActiveTrade && currentActiveTrade.status !== 'PENDING') {
      setCountdownEnded(false);
    }
  }, [remainingSec, currentActiveTrade, livePriceNum, onCountdownEnd]);

  const isTradeActive = !!currentActiveTrade || isExecuting || showOutcome;

  useEffect(() => {
    if (!currentActiveTrade) {
      setRemainingSec(0);
      setTradeProgress(0);
      setCountdownEnded(false);
      return;
    }
    setCountdownEnded(false);
    const duration = currentActiveTrade.duration || 15;
    const totalMs = duration * 1000;
    let rafId;

    const tick = () => {
      const now = Date.now();
      const startTime = currentActiveTrade.startTime || currentActiveTrade.createdAt || currentActiveTrade.timestamp || Date.now();
      const expiry = currentActiveTrade.expiryMs || (startTime + totalMs);
      const remaining = Math.max(0, expiry - now);
      const secs = Math.ceil(remaining / 1000);
      const prog = Math.min(100, ((totalMs - remaining) / totalMs) * 100);
      setRemainingSec(secs);
      setTradeProgress(prog);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [currentActiveTrade]);

  // Odds calculation (defaults to 61¢ / 39¢ like in screenshot)
  const symLower = (activeMarket?.id || 'eth').toLowerCase();
  const backendOdds = liveOdds?.[symLower]?.[selectedDuration];
  const yesShare = backendOdds?.LONG ?? 0.61;
  const noShare = backendOdds?.SHORT ?? 0.39;
  const yesCents = Math.round(yesShare * 100);
  const noCents = Math.round(noShare * 100);

  const tokens = useMemo(() => {
    const list = defaultTokens.length > 0 ? defaultTokens : [
      { id: 'eth', symbol: 'ETH', binance: 'ETHUSDT', name: 'Ethereum' },
      { id: 'btc', symbol: 'BTC', binance: 'BTCUSDT', name: 'Bitcoin' },
      { id: 'sol', symbol: 'SOL', binance: 'SOLUSDT', name: 'Solana' },
      { id: 'mon', symbol: 'MON', binance: 'MONUSDT', name: 'Monad' },
      { id: 'avax', symbol: 'AVAX', binance: 'AVAXUSDT', name: 'Avalanche' },
    ];
    if (!searchQuery) return list;
    return list.filter(t => (t.symbol || t.id || '').toLowerCase().includes(searchQuery.toLowerCase()));
  }, [defaultTokens, searchQuery]);

  // The wheel window is sized from the token count: half the visible rows
  // either side of the centre, never wide enough to wrap an asset back on
  // screen twice. With 5 tokens that is exactly 5 rows, so the whole list is
  // on the phone with no duplicates and no clipping.
  const wheelSpan = Math.max(1, Math.floor((Math.min(tokens.length, WHEEL_MAX_ROWS) - 1) / 2));
  const wheelBoxH = (wheelSpan * 2 + 1) * WHEEL_ROW_H;

  const pickAsset = (t) => {
    handleMarketChange?.(t);
    setAssetOpen(false);
  };

  const activeAssetIdx = useMemo(() => {
    if (!tokens.length) return 0;
    const idx = tokens.findIndex(t => t.id.toLowerCase() === (activeMarket?.id || 'eth').toLowerCase());
    return idx >= 0 ? idx : 0;
  }, [tokens, activeMarket]);

  // Index of the asset sitting in the center slot right now. Derived with a
  // modulo so it stays valid no matter how far the wheel has scrolled.
  const centerAssetIdx = tokens.length ? wrapIdx(wheelCenter, tokens.length) : 0;

  const setWheelCenterSafe = useCallback((n) => {
    if (wheelCenterRef.current === n) return;
    wheelCenterRef.current = n;
    setWheelCenter(n);
  }, []);

  // Center the wheel on the committed asset whenever the sheet opens, when the
  // asset is changed from the ticker, and when the sheet closes (which discards
  // any uncommitted scrolling). Moves the fewest rows possible so the loop
  // never visibly rewinds.
  useEffect(() => {
    const total = tokens.length;
    if (!total || wheelTouchStart.current) return;
    if (wheelSettle.current) { wheelSettle.current.stop(); wheelSettle.current = null; }
    const current = Math.round(wheelPos.get());
    const target = nearestWrappedIndex(current, activeAssetIdx, total);
    wheelPos.jump(target);
    setWheelCenterSafe(target);
  }, [assetOpen, activeAssetIdx, tokens.length, wheelPos, setWheelCenterSafe]);

  // ─── WHEEL NAVIGATION (continuous drag, infinite loop) ───
  // Targets are absolute positions in the unbounded list, never clamped, so
  // the wheel can keep scrolling in either direction forever.
  const settleWheelTo = useCallback((target, velocity = 0) => {
    if (!tokens.length) return;
    if (wheelSettle.current) wheelSettle.current.stop();
    // Spring to the row, carrying the flick velocity so fast swipes coast
    // naturally instead of stopping dead.
    wheelSettle.current = animate(wheelPos, target, {
      type: 'spring',
      stiffness: 260,
      damping: 30,
      mass: 0.9,
      velocity,
      restDelta: 0.01,
      restSpeed: 0.01,
    });
    setWheelCenterSafe(target);
  }, [tokens.length, wheelPos, setWheelCenterSafe]);

  const onWheelTouchStart = useCallback((e) => {
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    if (wheelSettle.current) wheelSettle.current.stop();
    wheelTouchStart.current = {
      y: touch.clientY,
      startPos: wheelPos.get(),
      lastY: touch.clientY,
      lastT: Date.now(),
      velocity: 0,
    };
  }, [wheelPos]);

  const onWheelTouchMove = useCallback((e) => {
    const start = wheelTouchStart.current;
    if (!start) return;
    const touch = e.touches && e.touches[0];
    if (!touch) return;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaY) > 4) wheelSwipedAt.current = Date.now();
    // Claim the gesture so the page behind never scrolls with the wheel.
    if (e.cancelable) e.preventDefault();

    // No rubber band and no clamp: the list loops, so there are no ends to
    // resist against.
    const next = start.startPos - deltaY / WHEEL_ROW_H;
    wheelPos.set(next);
    setWheelCenterSafe(Math.round(next));

    // Track velocity in rows/second for momentum on release.
    const now = Date.now();
    const dt = now - start.lastT;
    if (dt > 0) {
      const instant = -((touch.clientY - start.lastY) / WHEEL_ROW_H) / (dt / 1000);
      start.velocity = start.velocity * 0.7 + instant * 0.3;
      start.lastY = touch.clientY;
      start.lastT = now;
    }
  }, [wheelPos, setWheelCenterSafe]);

  const onWheelTouchEnd = useCallback(() => {
    const start = wheelTouchStart.current;
    wheelTouchStart.current = null;
    if (!start) return;
    if (!tokens.length) return;

    // Project the flick forward so a fast swipe travels several rows.
    const projected = wheelPos.get() + start.velocity * 0.12;
    let target = Math.round(projected);
    // A short flick with no real velocity still counts as one row.
    if (target === Math.round(start.startPos) && Math.abs(start.velocity) > 0.5) {
      target = Math.round(start.startPos) + (start.velocity > 0 ? 1 : -1);
    }
    settleWheelTo(target, start.velocity);
  }, [tokens.length, settleWheelTo, wheelPos]);

  const onWheelMouseWheel = useCallback((e) => {
    if (!e.deltaY) return;
    // Throttle so one trackpad flick advances a single row.
    const now = Date.now();
    if (now - wheelScrollAt.current < 120) return;
    wheelScrollAt.current = now;
    settleWheelTo(Math.round(wheelPos.get()) + (e.deltaY > 0 ? 1 : -1), 0);
  }, [settleWheelTo, wheelPos]);

  // The selected asset. Tapping the row in the middle picks it; tapping any
  // other row just brings that asset to the middle. This is the original
  // design — scrolling only chooses the candidate, the center row commits it.
  const onWheelRowTap = useCallback((virtualIdx) => {
    // Ignore the click that browsers synthesise at the end of a drag.
    if (Date.now() - wheelSwipedAt.current < 350) return;
    const total = tokens.length;
    if (!total) return;

    const rowToken = tokens[wrapIdx(virtualIdx, total)];
    if (!rowToken) return;

    // non-middle row: just scroll it to centre and do not activate it
    if (Math.abs(virtualIdx - wheelPos.get()) > 0.5) {
      settleWheelTo(virtualIdx, 0);
      return;
    }

    const nextSymbol = (rowToken.symbol || '').toUpperCase();
    setActiveAssetSymbol(nextSymbol);
    pickAsset(rowToken);
  }, [tokens, settleWheelTo, wheelPos, pickAsset]);

  const onWheelBackdropClick = useCallback(() => {
    if (Date.now() - wheelSwipedAt.current < 350) return;
    setAssetOpen(false);
  }, []);

  // The rows to render, built by looking `wheelSpan` either side of the center
  // and wrapping each index back into the token list. Because the indices are
  // virtual, the same asset reappears on the other end of the list and the
  // wheel can be scrolled forever with no visible end or seam.
  const wheelRows = useMemo(() => {
    const total = tokens.length;
    if (!total) return [];
    const rows = [];
    for (let offset = -wheelSpan; offset <= wheelSpan; offset++) {
      const virtualIdx = wheelCenter + offset;
      const token = tokens[wrapIdx(virtualIdx, total)];
      if (!token) continue;
      rows.push({ token, virtualIdx });
    }
    return rows;
  }, [tokens, wheelCenter, wheelSpan]);

  // Slider change handler
  const handleSliderChange = (e) => {
    const pct = parseFloat(e.target.value);
    setSliderPct(pct);
    const maxVal = sessionBalance > 0 ? sessionBalance : 100;
    const range = maxVal - minStake;
    const computed = (minStake + (pct / 100) * range).toFixed(2);
    setStakeInput(computed);
  };

  // Stake input change handler
  const handleStakeChange = (e) => {
    const val = e.target.value;
    const num = parseFloat(val) || 0;
    const effective = num < minStake && val !== '' ? minStake : num;
    setStakeInput(val === '' ? '' : String(effective));
    const maxVal = sessionBalance > 0 ? sessionBalance : 100;
    const range = maxVal - minStake;
    setSliderPct(range > 0 ? Math.min(100, Math.max(0, ((effective - minStake) / range) * 100)) : 0);
  };

  // Trade execution
  const handleTrade = (direction) => {
    const stakeAmt = parseFloat(stakeInput) || 0;
    if (stakeAmt < minStake) return;
    executeTrade?.({
      direction,
      amount: stakeAmt,
      duration: selectedDuration,
    });
  };

  return (
    <div
      className={`w-full h-full flex flex-col min-h-0 overflow-hidden relative ${
        isLight ? 'bg-white' : 'bg-[#060907]'
      }`}
      style={{ fontFamily: '"Comfortaa", cursive' }}
    >
      {/* ─── 1. TOP LIVE MARKET SCROLLER (Darker Shade of Green with Zigzag Pattern Up & Down) ─── */}
      <div className="w-full relative z-30 shrink-0 select-none overflow-hidden">
        <GlobalTradeScroller theme={theme} />
      </div>

      {/* ─── ASSET SELECTOR WHEEL PICKER ─── */}
      <AnimatePresence>
        {assetOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-x-0 top-[44px] bottom-0 z-50 flex flex-col items-center justify-start"
            style={{
              paddingTop: '10%',
              backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(6, 9, 7, 0.95)',
              WebkitBackdropFilter: 'blur(20px)',
              backdropFilter: 'blur(20px)',
            }}
            onClick={onWheelBackdropClick}
          >
            <div
              ref={assetWheelRef}
              className="relative w-full flex flex-col items-center justify-center select-none"
              style={{
                height: `${wheelBoxH}px`,
                overflow: 'hidden',
                position: 'relative',
                touchAction: 'none',
                WebkitUserSelect: 'none',
                userSelect: 'none',
                paddingBottom: 'env(safe-area-inset-bottom, 12px)',
              }}
              onTouchStart={onWheelTouchStart}
              onTouchMove={onWheelTouchMove}
              onTouchEnd={onWheelTouchEnd}
              onTouchCancel={onWheelTouchEnd}
              onWheel={onWheelMouseWheel}
            >
              <motion.div className="absolute inset-x-0 top-0">
                {wheelRows.map(({ token, virtualIdx }, slot) => {
                  const isUnavailable = token.id?.toLowerCase() === 'mon' || token.id?.toLowerCase() === 'avax';
                  return (
                    <WheelRow
                      key={`wheel-slot-${slot}`}
                      token={token}
                      index={virtualIdx}
                      wheelPos={wheelPos}
                      boxH={wheelBoxH}
                      onTap={() => onWheelRowTap(virtualIdx)}
                      activeAssetSymbol={activeAssetSymbol}
                      isLight={isLight}
                    />
                  );
                })}
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 2. CHART AREA WITH SELECTED ASSET TICKER ON TOP LEFT ─── */}
      {/* Height: flexible both ways. On tall screens the chart grows (no 52% cap)
          so the trading controls + history stay anchored to the bottom with no
          dead gap; on short screens it shrinks to fit the UI. */}
      <div className="flex-1 min-h-[140px] w-full relative pt-1 pb-1" style={{ overflow: 'visible' }}>
        {/* Selected Asset Ticker on Top Left of Chart Widget */}
        <button
          onClick={() => setAssetOpen(o => !o)}
          className="absolute top-3.5 left-5 z-30 flex items-center gap-2 bg-transparent border-none p-1 outline-none cursor-pointer active:scale-95 transition-transform"
        >
          {LOGO_MAP[(activeMarket?.id || 'eth').toLowerCase()] && (
            <img
              src={LOGO_MAP[(activeMarket?.id || 'eth').toLowerCase()]}
              alt={currentSymbol}
              className={`${(activeMarket?.id || 'eth').toLowerCase() === 'eth' ? 'w-14 h-14' : (activeMarket?.id || 'eth').toLowerCase() === 'sol' ? 'w-[36.4px] h-[36.4px]' : 'w-7 h-7'} object-contain shrink-0`}
              style={{ filter: getLogoFilter(isLight) }}
              crossOrigin="anonymous"
            />
          )}
          <span
            className={`text-[16px] font-bold tracking-wider leading-none ${
              isLight ? 'text-[#0a261a]' : 'text-white'
            }`}
            style={{ fontFamily: '"Comfortaa", cursive' }}
          >
            {currentSymbol}
          </span>
          <ChevronDown
            size={14}
            className={`transition-transform duration-200 ${
              isLight ? 'text-[#0a261a]/60' : 'text-white/60'
            } ${assetOpen ? 'rotate-180' : ''}`}
          />
        </button>

        <div className="h-full pointer-events-none" style={{ width: 'calc(100% + 80px)', marginLeft: '-40px', overflow: 'visible' }}>
          <MobileSteppedChart
            symbol={binanceSymbol}
            theme={theme}
            currentPrice={livePriceNum}
            activeTrades={activeTrades}
            windowMs={25000}
          />
        </div>
      </div>

      {/* ─── 3-6. TRADING CONTROLS or ACTIVE TRADE ANIMATION ─── */}
      <AnimatePresence mode="wait">
        {isTradeActive ? (
          <motion.div
            key="active-trade"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="shrink-0 relative flex flex-col items-center justify-center gap-2 px-4 py-3 min-h-[56px] w-full overflow-visible"
          >
            {isExecuting && !currentActiveTrade && !(showOutcome && settledTrade) ? (
              <div className="flex items-center gap-2 text-[#17A364] animate-pulse text-[14px] font-black tracking-widest">
                <div className="w-4 h-4 rounded-full border-2 border-[#17A364] border-t-transparent animate-spin" />
                PLACING TRADE...
              </div>
            ) : currentActiveTrade && currentActiveTrade.status === 'PENDING' && remainingSec > 0 ? (
              <div className="flex items-center justify-center gap-3 w-full">
                <FlipClock seconds={remainingSec} isLight={isLight} />
                <ProgressBeam progress={tradeProgress} isWinning={
                  typeof currentActiveTrade.won === 'boolean'
                    ? currentActiveTrade.won
                    : (currentActiveTrade.direction === 'UP' || currentActiveTrade.direction === 'YES'
                        ? livePriceNum >= (parseFloat(currentActiveTrade.entryPrice) || 0)
                        : livePriceNum <= (parseFloat(currentActiveTrade.entryPrice) || 0))
                } />
              </div>
            ) : currentActiveTrade && currentActiveTrade.status === 'PENDING' ? (
              <ResolvingOutcome isLight={isLight} />
            ) : currentActiveTrade && currentActiveTrade.status === 'RESOLVING' ? (
              // Countdown over, verdict pending — neutral spinner, never price-colored
              <ResolvingOutcome isLight={isLight} />
            ) : showOutcome && settledTrade ? (
              <TradeOutcome
                won={settledTrade.status === 'WON' || settledTrade.status === 'PAID'}
                isLight={isLight}
                // Must describe the trade being revealed, not some other row. The
                // disclaimer is for a trade that has no verdict yet; asking about
                // `currentActiveTrade` here meant the card for a settled result
                // could be overridden by the state of an unrelated live one.
                isPending={isTradeInFlight(settledTrade)}
                fit
                amount={settledTrade.amount}
                payout={settledTrade.payout}
                entryPrice={settledTrade.entryPrice}
                exitPrice={settledTrade.settlementPrice || settledTrade.exitPrice}
                symbol={settledTrade.symbol}
              />
            ) : null}
          </motion.div>
        ) : (
          <motion.div
            key="trading-controls"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.25 }}
          >
            {/* ─── 3. TIMEFRAME SELECTOR (15s | 10s | 5s) ─── */}
            <div className="shrink-0 flex items-center justify-center gap-3 py-1 px-4 select-none">
              {[15, 10, 5].map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDuration(d)}
                  className={`py-1 px-5 rounded-full text-[14px] font-black transition-all active:scale-95 ${
                    selectedDuration === d
                      ? 'bg-[#17A364] text-white shadow-sm'
                      : isLight
                      ? 'text-[#0a261a]/60 hover:text-[#0a261a]'
                      : 'text-white/60 hover:text-white'
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>

            {/* ─── 4. STAKE INPUT PILL ─── */}
            <div className="shrink-0 px-4 py-1 select-none">
              <div
                className={`w-full rounded-full border-2 border-[#17A364] px-4 py-1.5 flex items-center shadow-sm ${
                  isLight ? 'bg-white/80' : 'bg-black/30'
                }`}
              >
                <span className="text-[#17A364] font-black text-[15px] select-none pl-1 mr-2">
                  $
                </span>
                <input
                  type="number"
                  value={stakeInput}
                  onChange={handleStakeChange}
                  placeholder="STAKE"
                  min={minStake}
                  step="0.01"
                  className={`w-full text-center font-black text-[14px] uppercase tracking-wider outline-none bg-transparent ${
                    isLight
                      ? 'text-[#17A364] placeholder:text-[#17A364]'
                      : 'text-[#17A364] placeholder:text-[#17A364]'
                  }`}
                />
                <span className={`text-[11px] font-bold whitespace-nowrap ml-1 ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'}`}>
                  ${parseFloat(sessionBalance || 0).toFixed(2)}
                </span>
              </div>
            </div>

            {/* ─── 5. STAKE SLIDER ─── */}
            <div className="shrink-0 px-6 py-2 select-none relative">
              <div className="relative w-full flex items-center h-5">
                <div
                  className={`w-full h-[3px] rounded-full relative ${
                    isLight ? 'bg-gray-300' : 'bg-white/20'
                  }`}
                >
                  {[0, 20, 40, 60, 80, 100].map((tick) => (
                    <div
                      key={tick}
                      className={`absolute top-1/2 -translate-y-1/2 w-[1.5px] h-[7px] ${
                        isLight ? 'bg-gray-400' : 'bg-white/40'
                      }`}
                      style={{ left: `${tick}%` }}
                    />
                  ))}
                  <div
                    className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-[3px] border-[#17A364] transition-all -ml-2 pointer-events-none ${
                      isLight ? 'bg-white' : 'bg-black'
                    }`}
                    style={{ left: `${sliderPct}%` }}
                  />
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={sliderPct}
                  onChange={handleSliderChange}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
              </div>
            </div>

            {/* ─── 6. EXECUTION BUTTONS (YES | NO) ─── */}
            <div className="shrink-0 px-4 pt-1 pb-3 flex items-center gap-3 select-none">
              <button
                onClick={() => handleTrade('UP')}
                disabled={currentStake <= 0 || isExecuting}
                className={`flex-1 h-[52px] rounded-full bg-[#17A364] text-white flex items-center justify-center gap-3 font-black text-[18px] tracking-wide active:scale-[0.98] transition-all shadow-lg ${
                  currentStake <= 0 || isExecuting ? 'opacity-85' : 'hover:brightness-105'
                }`}
              >
                {isExecuting ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    <span>YES</span>
                    <span className="text-[17px] font-black opacity-95">{yesCents}¢</span>
                  </>
                )}
              </button>

              <button
                onClick={() => handleTrade('DOWN')}
                disabled={currentStake <= 0 || isExecuting}
                className={`flex-1 h-[52px] rounded-full bg-[#EF5350] text-white flex items-center justify-center gap-3 font-black text-[18px] tracking-wide active:scale-[0.98] transition-all shadow-lg ${
                  currentStake <= 0 || isExecuting ? 'opacity-85' : 'hover:brightness-105'
                }`}
              >
                {isExecuting ? (
                  <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                  <>
                    <span>NO</span>
                    <span className="text-[17px] font-black opacity-95">{noCents}¢</span>
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── 7. BOTTOM HISTORY SHEET DRAWER (NO COUNTER) ─── */}
      <div className="shrink-0 mt-auto select-none">
        <button
          onClick={() => setShowFullHistory?.(!showFullHistory)}
          className="w-full bg-[#17A364] text-white rounded-t-[28px] pt-2 pb-3.5 px-4 flex flex-col items-center justify-center shadow-lg active:brightness-95 transition-all"
        >
          {/* Horizontal Grab Bar */}
          <div className="w-12 h-1 bg-white/40 rounded-full mb-2" />

          {/* History bar text — Only carry TRADE HISTORY label, no counter */}
          <div className="flex items-center justify-center gap-2 text-[12px] font-black tracking-widest uppercase">
            <History size={14} className="text-white" />
            <span>TRADE HISTORY</span>
            <ChevronUp
              size={14}
              className={`transition-transform duration-300 ${showFullHistory ? 'rotate-180' : ''}`}
            />
          </div>
        </button>
      </div>

      {/* ─── EXPANDABLE TRADE HISTORY MODAL / BOTTOM SHEET ─── */}
      <AnimatePresence>
        {showFullHistory && (
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-[32px] overflow-hidden shadow-2xl border-t border-black/10 dark:border-white/10 flex flex-col"
            style={{
              height: '40vh',
              backgroundColor: isLight ? 'rgba(255, 255, 255, 0.98)' : 'rgba(10, 16, 12, 0.98)',
            }}
          >
            {/* Header bar of drawer — Only carry TRADE HISTORY label, no counter */}
            <div
              onClick={() => setShowFullHistory(false)}
              className="w-full bg-[#17A364] text-white pt-2.5 pb-2 px-4 flex flex-col items-center justify-center cursor-pointer"
            >
              <div className="w-12 h-1 bg-white/40 rounded-full mb-1.5" />
              <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-widest">
                <History size={14} />
                <span>TRADE HISTORY</span>
                <ChevronDown size={14} />
              </div>
            </div>

            {/* List of Trades */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {(!tradeHistory || tradeHistory.length === 0) ? (
                <div className="h-full flex flex-col items-center justify-center py-10 opacity-30 text-center">
                  <History size={36} className="mb-2" />
                  <p className="text-[11px] font-black uppercase tracking-wider">No trades executed yet</p>
                </div>
              ) : (
                tradeHistory.map((trade, idx) => {
                  // The verdict has to come from the trade's real state, not from
                  // "is it a win?". Treating anything that is not a win as a loss
                  // printed LOST over every still-running trade, so a PENDING bet
                  // looked settled in this list and then opened the "still
                  // processing" disclaimer when tapped - the row and the tap gate
                  // disagreed about the same trade. Settled means settled: win,
                  // loss, or an explicit in-flight status, never a fabricated one.
                  const settled = isTradeSettled(trade);
                  const isWin = settled && isWinningTrade(trade);
                  const isUp = trade.direction === 'UP' || trade.direction === 'YES' || trade.direction === 1;
                  const statusLabel = String(trade.status || '').toUpperCase() || (settled ? 'SETTLED' : 'PENDING');
                  return (
                    <div
                      key={trade.id || idx}
                      onClick={() => onViewReceipt?.(trade)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer active:scale-[0.99] transition-transform ${
                        isLight ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center font-black text-[11px] text-white ${
                            isUp ? 'bg-[#17A364]' : 'bg-[#EF5350]'
                          }`}
                        >
                          {isUp ? <ArrowUp size={14} /> : <ArrowDown size={14} />}
                        </div>
                        <div>
                          <div className={`text-[12px] font-black ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                            {trade.symbol || currentSymbol} {isUp ? 'YES' : 'NO'}
                          </div>
                          <div className={`text-[10px] font-bold ${isLight ? 'text-gray-400' : 'text-white/40'}`}>
                            Stake: ${parseFloat(trade.amount || 0).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        {trade.status === 'PENDING' || trade.status === 'RESOLVING' ? (
                          // Neutral in-motion state — NO win/lose verdict for active trades
                          <div className="flex items-center gap-1.5 justify-end">
                            <div
                              className={`w-3 h-3 rounded-full border-2 border-t-transparent animate-spin ${
                                isLight ? 'border-[#111827]/60' : 'border-white/60'
                              }`}
                            />
                            <div className={`text-[10px] font-black uppercase tracking-wider ${isLight ? 'text-[#111827]/70' : 'text-white/60'}`}>
                              {trade.status === 'RESOLVING' ? 'Resolving' : 'Pending'}
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              className={`text-[12px] font-black ${
                                isWin ? 'text-[#17A364]' : 'text-[#EF5350]'
                              }`}
                            >
                              {isWin ? `+$${parseFloat(trade.payout || 0).toFixed(2)}` : 'LOST'}
                            </div>
                            <div className={`text-[9px] font-bold ${isLight ? 'text-gray-400' : 'text-white/40'}`}>
                              {trade.status || 'SETTLED'}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
