import React, { useEffect, useRef } from 'react';
import { priceSocketService } from '../utils/priceSocket';

/**
 * LiveStreamingChart — A specialized Canvas-based line chart for 1s timeframe.
 * HIGH PERFORMANCE: Optimized drawing routines to avoid lags and redundant allocations.
 * Now includes trade entry markers with LIVE countdown badges rendered on canvas.
 */
function LiveStreamingChartComponent({ theme, symbol, activeTrades = [], currentPrice, windowMs = 20000 }) {
    const canvasRef = useRef(null);
    const priceHistoryRef = useRef([]);
    const rafRef = useRef(null);
    const targetPriceRef = useRef(null);
    const interpolatedPriceRef = useRef(null);
    const startTimeRef = useRef(null);
    const gradRef = useRef(null);

    const lastFrameRef = useRef(0);
    const FRAME_INTERVAL = 1000 / 30;

    const pad2 = (n) => (n < 10 ? '0' + n : '' + n);
    const formatTimeFast = (ts) => {
        const d = new Date(ts);
        return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
    };

    const yMinRef = useRef(null);
    const yMaxRef = useRef(null);

    const lastHRef = useRef(0);
    const lastThemeRef = useRef(theme);
    const debugProbeRef = useRef({ badPriceTs: 0, emptyDrawTs: 0 });

    const activeTradesRef = useRef(activeTrades);
    useEffect(() => { activeTradesRef.current = activeTrades; }, [activeTrades]);

    const isLight = theme === 'light';
    const GREEN = '#17A364';

    useEffect(() => {
        const handlePrice = (data) => {
            if (data.key === symbol.replace('USDT', '').toLowerCase()) {
                const price = parseFloat(data.price);
                if (!isNaN(price)) {
                    targetPriceRef.current = price;
                    if (interpolatedPriceRef.current === null) {
                        interpolatedPriceRef.current = price;
                    }
                    if (startTimeRef.current === null) {
                        startTimeRef.current = Date.now();
                    }
                }
            }
        };

        const unbind = priceSocketService.on('price', handlePrice);
        return () => unbind();
    }, [symbol]);

    useEffect(() => {
        priceHistoryRef.current = [];
        targetPriceRef.current = null;
        interpolatedPriceRef.current = null;
        startTimeRef.current = null;
        yMinRef.current = null;
        yMaxRef.current = null;
    }, [symbol]);

    useEffect(() => {
        const historyInterval = setInterval(() => {
            if (interpolatedPriceRef.current !== null) {
                const now = Date.now();
                const history = priceHistoryRef.current;

                if (targetPriceRef.current !== null) {
                    const diff = targetPriceRef.current - interpolatedPriceRef.current;
                    interpolatedPriceRef.current += diff * 0.18;
                }

                const lastPt = history[history.length - 1];
                if (!lastPt || now > lastPt.t) {
                    history.push({ t: now, p: interpolatedPriceRef.current });
                }
                if (history.length > 1000) {
                    priceHistoryRef.current = history.slice(-600);
                }
            }
        }, 50);
        return () => clearInterval(historyInterval);
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d', { alpha: true });

        const draw = () => {
            const nowFrame = Date.now();
            if (nowFrame - lastFrameRef.current < FRAME_INTERVAL) {
                rafRef.current = requestAnimationFrame(draw);
                return;
            }
            lastFrameRef.current = nowFrame;

            const W = canvas.offsetWidth;
            const H = canvas.offsetHeight;
            if (!W || !H) {
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            const dpr = window.devicePixelRatio || 1;
            if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
                canvas.width = W * dpr;
                canvas.height = H * dpr;
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }

            ctx.clearRect(0, 0, W, H);

            if (targetPriceRef.current !== null && interpolatedPriceRef.current !== null) {
                const diff = targetPriceRef.current - interpolatedPriceRef.current;
                interpolatedPriceRef.current += diff * 0.12;
            }

            const history = priceHistoryRef.current;
            const latestPriceVal = interpolatedPriceRef.current;
            if (latestPriceVal === null || history.length === 0 || !startTimeRef.current) {
                const now = Date.now();
                if ((now - (debugProbeRef.current.emptyDrawTs || 0)) > 5000) {
                    debugProbeRef.current.emptyDrawTs = now;
                }
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            const nowPx = Date.now();
            const viewStartTime = nowPx - windowMs;
            const oldest = viewStartTime;

            const isMobile = W < 600;
            const isMon = (symbol || '').toLowerCase().includes('mon');
            const isAvax = (symbol || '').toLowerCase().includes('avax');
            const chartDecimals = isMon ? 6 : isAvax ? 4 : 2;
            const latestPriceValStr = latestPriceVal.toFixed(chartDecimals);

            const priceScaleWidth = isMobile ? 65 : 85;
            const liveXBoundary = W - priceScaleWidth;
            const getX = (t) => ((t - viewStartTime) / windowMs) * liveXBoundary;

            let pMin = latestPriceVal;
            let pMax = latestPriceVal;
            let firstIdx = -1;
            let lastIdx = -1;

            for (let i = 0; i < history.length; i++) {
                const pt = history[i];
                if (pt.t < oldest) continue;
                const x = getX(pt.t);
                if (x < 0) continue;
                if (x > liveXBoundary) break;

                if (firstIdx === -1) firstIdx = i;
                lastIdx = i;
                if (pt.p < pMin) pMin = pt.p;
                if (pt.p > pMax) pMax = pt.p;
            }

            if (firstIdx === -1) {
                rafRef.current = requestAnimationFrame(draw);
                return;
            }

            let minVisiblePrice = pMin;
            let maxVisiblePrice = pMax;
            let priceDiff = maxVisiblePrice - minVisiblePrice;
            if (priceDiff === 0) {
                priceDiff = latestPriceVal * 0.0001;
            }

            const targetMin = minVisiblePrice - priceDiff * 0.12;
            const targetMax = maxVisiblePrice + priceDiff * 0.12;

            if (yMinRef.current === null) {
                yMinRef.current = targetMin;
                yMaxRef.current = targetMax;
            } else {
                yMinRef.current += (targetMin - yMinRef.current) * 0.1;
                yMaxRef.current += (targetMax - yMaxRef.current) * 0.1;
            }

            const lo = yMinRef.current;
            const hi = yMaxRef.current;
            const range = hi - lo || 1;
            const vPaddingBottom = isMobile ? 24 : 28;
            const effectiveH = H - vPaddingBottom;
            const toY = (p) => (H - vPaddingBottom) - ((p - lo) / range) * effectiveH;

            const liveX = getX(nowPx);
            const liveY = toY(latestPriceVal);
            const startX = -W;
            const startY = toY(history[firstIdx].p);

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(startX, startY);
            for (let i = firstIdx + 1; i <= lastIdx; i++) {
                ctx.lineTo(getX(history[i].t), toY(history[i].p));
            }
            ctx.lineTo(liveX, liveY);
            ctx.lineTo(W + 180, liveY);
            ctx.lineTo(W + 180, H + 20);
            ctx.lineTo(startX, H + 20);
            ctx.closePath();
            ctx.clip();

            const fillGrad = ctx.createLinearGradient(0, liveY, 0, H);
            fillGrad.addColorStop(0.00, isLight ? 'rgba(23, 163, 100, 0.38)' : `${GREEN}60`);
            fillGrad.addColorStop(0.35, isLight ? 'rgba(23, 163, 100, 0.18)' : `${GREEN}2A`);
            fillGrad.addColorStop(0.70, isLight ? 'rgba(23, 163, 100, 0.06)' : `${GREEN}0F`);
            fillGrad.addColorStop(1.00, isLight ? 'rgba(238, 247, 242, 0)' : 'rgba(13, 30, 21, 0)');
            ctx.fillStyle = fillGrad;
            ctx.fillRect(startX, 0, W + 180 - startX, H + 20);
            ctx.restore();

            ctx.beginPath();
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = isLight ? '#1D7A52' : GREEN;
            ctx.shadowBlur = 15;
            ctx.shadowColor = isLight ? 'rgba(30,90,56,0.5)' : 'rgba(23, 163, 100,0.6)';
            ctx.moveTo(startX, startY);
            for (let i = firstIdx + 1; i <= lastIdx; i++) {
                ctx.lineTo(getX(history[i].t), toY(history[i].p));
            }
            ctx.lineTo(liveX, liveY);
            ctx.stroke();
            ctx.shadowBlur = 0;

            const trades = activeTradesRef.current;
            if (trades && trades.length > 0) {
                trades.forEach(trade => {
                    const entryPrice = parseFloat(trade.entryPrice);
                    if (isNaN(entryPrice)) return;

                    const tid = String(trade.id);
                    const start = trade.startTime || (tid.length > 12 ? parseInt(tid) : nowPx);
                    const duration = trade.duration || 15;
                    const expiry = trade.expiryMs || (start + (duration * 1000));
                    const isSettled = ["WON", "LOST", "PAID"].includes(trade.status);
                    const isWon = trade.status === "WON" || trade.status === "PAID";

                    const entryX = getX(start);
                    if (entryX < -20 || entryX > W + 20) return;

                    const entryY = toY(entryPrice);
                    const remainingMs = Math.max(0, expiry - nowPx);
                    const remainingSec = (remainingMs / 1000).toFixed(1);

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

                    const badgeW = isMobile ? 68 : 78;
                    const badgeH = isMobile ? 30 : 34;
                    const badgeX = entryX - badgeW / 2;
                    const flagGap = 5;
                    let badgeY, lineTop, lineBottom;
                    if (entryY - badgeH - flagGap >= 4) {
                        badgeY = entryY - badgeH - flagGap;
                        lineTop = badgeY + badgeH;
                        lineBottom = entryY;
                    } else {
                        badgeY = Math.min(H - badgeH - 6, entryY + flagGap);
                        lineTop = entryY;
                        lineBottom = badgeY;
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

                    ctx.save();
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = badgeGlow;

                    if (!isSettled) {
                        const pulsePhase = Math.sin(nowPx / 600) * 0.5 + 0.5;
                        ctx.strokeStyle = `rgba(23,163,100,${0.15 + pulsePhase * 0.15})`;
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.roundRect(badgeX - 2, badgeY - 2, badgeW + 4, badgeH + 4, 10);
                        ctx.stroke();
                    }

                    ctx.fillStyle = badgeColor;
                    ctx.beginPath();
                    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
                    ctx.fill();

                    const highlightGrad = ctx.createLinearGradient(badgeX, badgeY, badgeX, badgeY + badgeH);
                    highlightGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
                    highlightGrad.addColorStop(0.4, 'rgba(255,255,255,0.02)');
                    highlightGrad.addColorStop(1, 'rgba(0,0,0,0.05)');
                    ctx.fillStyle = highlightGrad;
                    ctx.beginPath();
                    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
                    ctx.fill();

                    ctx.strokeStyle = isSettled
                        ? (isWon ? 'rgba(23,163,100,0.6)' : 'rgba(240,76,76,0.5)')
                        : 'rgba(23,163,100,0.5)';
                    ctx.lineWidth = 0.5;
                    ctx.beginPath();
                    ctx.roundRect(badgeX, badgeY, badgeW, badgeH, 8);
                    ctx.stroke();
                    ctx.shadowBlur = 0;
                    ctx.restore();

                    const iconCenterX = badgeX + (isMobile ? 12 : 14);
                    const iconCenterY = badgeY + badgeH / 2 - 2;
                    const iconR = isMobile ? 4.5 : 5.5;

                    if (isSettled) {
                        const pulse = Math.sin(nowPx / 200) * 0.15 + 0.85;
                        ctx.save();
                        ctx.globalAlpha = 1;
                        ctx.translate(entryX, badgeY + badgeH / 2);
                        ctx.shadowBlur = 14 * pulse;
                        ctx.shadowColor = isWon ? 'rgba(74,222,128,0.6)' : 'rgba(255,127,80,0.5)';
                        ctx.fillStyle = resultColor;
                        ctx.font = `900 ${isMobile ? 11 : 13}px Inter, system-ui, sans-serif`;
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

                        const textStartX = iconCenterX + iconR + (isMobile ? 3 : 4);
                        ctx.fillStyle = '#4ADE80';
                        ctx.font = `900 ${isMobile ? 7 : 8}px Inter, system-ui, sans-serif`;
                        ctx.textBaseline = 'top';
                        ctx.fillText('LIVE', textStartX, badgeY + (isMobile ? 5 : 6));

                        ctx.fillStyle = '#ffffff';
                        ctx.font = `bold ${isMobile ? 9 : 10}px IBM Plex Mono, monospace`;
                        ctx.textBaseline = 'top';
                        const countdownStr = remainingSec < 10 ? `0${remainingSec}` : remainingSec;
                        ctx.fillText(countdownStr, textStartX, badgeY + (isMobile ? 16 : 18));
                    }
                });
            }

            ctx.save();
            ctx.font = '11px Comfortaa, sans-serif';
            ctx.fillStyle = isLight ? '#4B5563' : '#9CA3AF';
            ctx.lineWidth = 0.5;

            ctx.strokeStyle = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(liveXBoundary, 0);
            ctx.lineTo(liveXBoundary, H);
            ctx.stroke();
            ctx.lineWidth = 0.5;

            const roughStep = range / 5;
            const magnitude = Math.pow(10, Math.floor(Math.log10(roughStep)));
            const normStep = roughStep / magnitude;
            let stepMulti = 1;
            if (normStep < 1.5) stepMulti = 1;
            else if (normStep < 3) stepMulti = 2;
            else if (normStep < 7) stepMulti = 5;
            else stepMulti = 10;
            const tickStep = stepMulti * magnitude;
            const firstTick = Math.ceil(lo / tickStep) * tickStep;

            ctx.textAlign = 'left';
            ctx.font = '10px Comfortaa, sans-serif';

            ctx.save();
            ctx.beginPath();
            ctx.rect(liveXBoundary, 0, W - liveXBoundary, H);
            ctx.clip();

            for (let priceVal = firstTick; priceVal <= hi; priceVal += tickStep) {
                const y = toY(priceVal);

                if (isLight) {
                    ctx.setLineDash([3, 6]);
                    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                    ctx.beginPath();
                    ctx.moveTo(0, y);
                    ctx.lineTo(liveXBoundary, y);
                    ctx.stroke();
                }

                if (Math.abs(y - liveY) < 12) continue;

                ctx.setLineDash([]);
                ctx.fillStyle = isLight ? '#4B5563' : '#9CA3AF';
                const maxF = magnitude < 1 ? -Math.floor(Math.log10(magnitude)) + 1 : 2;
                ctx.fillText(priceVal.toFixed(maxF), liveXBoundary + 8, y + 3.5);
            }
            ctx.restore();

            const tickInterval = windowMs / 4;
            const startTick = Math.ceil(viewStartTime / tickInterval) * tickInterval;
            ctx.textAlign = 'center';
            ctx.font = '10px Comfortaa, sans-serif';

            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, liveXBoundary, H);
            ctx.clip();

            for (let t = startTick; t <= nowPx; t += tickInterval) {
                const x = getX(t);

                if (isLight && x >= 0 && x <= liveXBoundary) {
                    ctx.setLineDash([3, 6]);
                    ctx.strokeStyle = 'rgba(0,0,0,0.06)';
                    ctx.beginPath();
                    ctx.moveTo(x, 0);
                    ctx.lineTo(x, H - vPaddingBottom);
                    ctx.stroke();
                }

                ctx.setLineDash([]);
                ctx.fillStyle = isLight ? '#4B5563' : '#9CA3AF';
                ctx.fillText(formatTimeFast(t), x, H - 6);
            }
            ctx.restore();

            ctx.save();
            ctx.setLineDash([2, 4]);
            ctx.strokeStyle = isLight ? 'rgba(23, 163, 100, 0.25)' : 'rgba(23, 163, 100, 0.35)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, liveY);
            ctx.lineTo(liveXBoundary, liveY);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(liveX, 0);
            ctx.lineTo(liveX, liveY);
            ctx.stroke();
            ctx.restore();

            const labelH = 20;
            ctx.fillStyle = isLight ? '#1D7A52' : GREEN;
            ctx.beginPath();
            ctx.roundRect(liveXBoundary + 6, liveY - labelH/2, priceScaleWidth - 12, labelH, 4);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'left';
            ctx.font = 'bold 11px Comfortaa, sans-serif';
            ctx.fillText(latestPriceValStr, liveXBoundary + 12, liveY);

            const ambientGlow = ctx.createRadialGradient(liveX, liveY, 0, liveX, liveY, isMobile ? 30 : 40);
            ambientGlow.addColorStop(0, isLight ? 'rgba(23, 163, 100, 0.20)' : 'rgba(23, 163, 100, 0.25)');
            ambientGlow.addColorStop(0.6, isLight ? 'rgba(23, 163, 100, 0.06)' : 'rgba(23, 163, 100, 0.10)');
            ambientGlow.addColorStop(1, 'transparent');
            ctx.fillStyle = ambientGlow;
            ctx.globalCompositeOperation = 'screen';
            ctx.fillRect(liveX - 40, liveY - 40, 80, 80);
            ctx.globalCompositeOperation = 'source-over';

            const pulseSize = Math.sin(nowPx / 150) * 2;
            const glowSize = 10 + pulseSize;

            const signalGlow = ctx.createRadialGradient(liveX, liveY, 1, liveX, liveY, glowSize);
            signalGlow.addColorStop(0, isLight ? 'rgba(45, 138, 87, 0.9)' : `${GREEN}bb`);
            signalGlow.addColorStop(0.5, isLight ? 'rgba(45, 138, 87, 0.3)' : `${GREEN}30`);
            signalGlow.addColorStop(1, 'transparent');

            ctx.beginPath();
            ctx.arc(liveX, liveY, glowSize, 0, Math.PI * 2);
            ctx.fillStyle = signalGlow;
            ctx.fill();

            ctx.beginPath();
            ctx.arc(liveX, liveY, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();

            ctx.beginPath();
            ctx.arc(liveX, liveY, 6.5 + (pulseSize * 0.3), 0, Math.PI * 2);
            ctx.strokeStyle = isLight ? 'rgba(45, 138, 87, 0.25)' : `${GREEN}35`;
            ctx.lineWidth = 1;
            ctx.stroke();

            rafRef.current = requestAnimationFrame(draw);
        };

        draw();
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [theme, symbol]);

    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <canvas ref={canvasRef} className="w-full h-full" style={{ touchAction: 'none' }} />
        </div>
    );
}

export const LiveStreamingChart = React.memo(LiveStreamingChartComponent);
export default LiveStreamingChart;
