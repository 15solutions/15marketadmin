import React, { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { tradeShares } from '../utils/tradeStatus';

function PriceMeterTicker({ value }) {
  const prevRef = useRef(value);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    if (value !== prevRef.current) {
      setDirection(value > prevRef.current ? 1 : -1);
      prevRef.current = value;
    }
  }, [value]);

  const prevVal = value - 1;
  const nextVal = value + 1;

  const initialY = direction * 12;
  const exitY = -direction * 12;

  return (
    <div className="inline-flex flex-col items-center justify-center h-[46px] min-w-[20px] overflow-hidden relative mx-0.5 select-none align-middle">
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={value}
          initial={{ y: initialY, opacity: 0, scale: 0.85 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: exitY, opacity: 0, scale: 0.85 }}
          transition={{ type: "spring", stiffness: 350, damping: 22 }}
          className="absolute flex flex-col items-center justify-center leading-none"
        >
          {/* Top faded number */}
          <span className="text-[11px] opacity-40 font-bold select-none mb-0.5">
            {prevVal}
          </span>
          {/* Active middle number */}
          <span className="text-[18px] font-black leading-none">
            {value}
          </span>
          {/* Bottom faded number */}
          <span className="text-[11px] opacity-40 font-bold select-none mt-0.5">
            {nextVal}
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// 1. FLIP CLOCK DIGIT (Realistic 3D mechanical flip animation with split card)
// Brand green face with high-contrast numbers: black in dark mode, white in light mode.
function FlipDigit({ digit, isLight }) {
  return (
    <div className={`relative w-[26px] h-[40px] bg-[#1A6140] rounded-[7px] shadow-[0_2px_10px_rgba(26, 97, 64,0.55)] overflow-hidden flex flex-col items-center justify-center select-none ${isLight ? 'text-white' : 'text-black'}`}>
      <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/10 pointer-events-none" />

      {/* Horizontal split crease seam */}
      <div className="absolute inset-x-0 top-1/2 h-[1px] bg-black/25 z-20" />

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={digit}
          initial={{ rotateX: -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ rotateX: 90, opacity: 0 }}
          transition={{ duration: 0.26, ease: [0.25, 1, 0.5, 1] }}
          style={{ transformOrigin: "center center", transformStyle: "preserve-3d" }}
          className={`absolute inset-0 flex items-center justify-center font-mono font-black text-[24px] tabular-nums tracking-tighter ${isLight ? 'text-white' : 'text-black'}`}
        >
          {digit}
        </motion.div>
      </AnimatePresence>

      {/* Glossy lighting overlay */}
      <div className={`absolute inset-0 ${isLight ? 'bg-gradient-to-b from-white/25 via-transparent to-black/10' : 'bg-gradient-to-b from-white/15 via-transparent to-black/25'} pointer-events-none`} />
    </div>
  );
}

function FlipClock({ seconds, isLight }) {
  const s = Math.max(0, Math.floor(seconds || 0));
  const tens = Math.floor(s / 10);
  const ones = s % 10;

  return (
    <div className="flex items-center gap-[3px] select-none shrink-0">
      <FlipDigit digit={tens} isLight={isLight} />
      <FlipDigit digit={ones} isLight={isLight} />
      <span className={`text-[13px] font-mono font-black ${isLight ? 'text-[#1A6140]' : 'text-[#1A6140]'} ml-1 uppercase tracking-tight`}>s</span>
    </div>
  );
}

// 2. LASER PROGRESS BEAM (Thin radiant laser line beam)
// `progress` is elapsed time 0->100 and ONLY drives the LEFT->RIGHT fill width.
// The un-filled track has slanted ash/grey diagonal stripes.
// The BEAM COLOR is the live outcome tracker: brand green when winning,
// NO-button orange when losing (matches the NO button/labels).
function ProgressBeam({ progress, isWinning }) {
  const clamped = Math.max(0, Math.min(100, progress));

  // Whole-beam color = live win/lose status
  const color = isWinning ? '#1A6140' : '#FF914D';
  const head = isWinning ? '#1A6140' : '#FFB085'; // brighter head shade for the laser
  const glow = color;

  return (
    <div className="flex-1 relative flex items-center justify-center min-w-[120px] h-[24px] px-1 select-none">
      {/* Conduit track — slanted ash/grey diagonal stripes on the UN-FILLED portion */}
      <div
        className="w-full h-[6px] rounded-full relative overflow-hidden"
        style={{
          background: 'repeating-linear-gradient(135deg, rgba(148,150,155,0.30) 0 4px, rgba(148,150,155,0.08) 4px 9px)',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
        }}
      >
        {/* Radiant Laser Line Beam — width only from progress, color from win/lose */}
        <div
          className="h-full rounded-full relative flex items-center justify-end will-change-[width]"
          style={{
            width: `${clamped}%`,
            background: `linear-gradient(90deg, ${color} 0%, ${head} 100%)`,
            boxShadow: `0 0 6px ${color}, 0 0 12px ${glow}, 0 0 20px ${glow}`,
          }}
        >
          {/* Laser Head Flare / Spark on advancing (right) leading edge */}
          {clamped > 1 && (
            <div className="relative flex items-center justify-center">
              {/* Outer halo */}
              <div
                className="absolute w-[9px] h-[9px] rounded-full animate-ping opacity-60 pointer-events-none"
                style={{ backgroundColor: color }}
              />
              {/* Core radiant spark */}
              <div
                className="w-[4px] h-[7px] rounded-full z-10 shadow-[0_0_8px_#ffffff]"
                style={{
                  backgroundColor: '#ffffff',
                  boxShadow: `0 0 6px #ffffff, 0 0 12px ${color}, 0 0 18px ${glow}`,
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// 3.5 RESOLVING OUTCOME (brief handoff shown when the countdown ends but the
// backend hasn't delivered its verdict yet).
// NEUTRAL BY DESIGN: the outcome is still unknown, so this must NOT react to the
// live price or win/lose direction — no green/orange, no price-tracking color.
// Just a steady pending spinner + "RESOLVING" in white (dark) / near-black (light).
function ResolvingOutcome({ isLight }) {
  const color = isLight ? '#111827' : '#ffffff';
  return (
    <div className="w-full flex items-center justify-center gap-2.5 select-none">
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        className="w-3.5 h-3.5 rounded-full border-2 shrink-0"
        style={{ borderColor: color, borderTopColor: 'transparent', opacity: 0.75 }}
      />
      <motion.span
        animate={{ opacity: [0.4, 1, 0.4], letterSpacing: ['0.22em', '0.3em', '0.22em'] }}
        transition={{ duration: 1.4, repeat: Infinity, ease: "easeInOut" }}
        className={`text-[12px] font-black tracking-[0.22em] uppercase ${isLight ? 'text-[#111827]/70' : 'text-white/60'}`}
      >
        Resolving
      </motion.span>
    </div>
  );
}

// 4. TRADE OUTCOME — Clean premium result reveal.
// Desktop: compact horizontal layout with icon orb, staggered letter reveal,
// and counting payout — all sized to fit the ~104px action-area strip.
// Mobile (fit): compact in-flow pill.
function TradeOutcome({ won, isLight, isPending, settled, phase, fit, amount, payout, entryPrice, exitPrice, symbol, shares, sharePrice, onExpire }) {
  if (isPending) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
        animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
        exit={{ opacity: 0, scale: 0.8, filter: 'blur(4px)' }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        className="absolute inset-0 z-30 flex items-center justify-center overflow-hidden rounded-2xl px-2"
      >
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className="w-full max-w-full min-w-0 mx-auto px-3 py-3 sm:px-5 sm:py-3 rounded-[24px] border border-[#FF914D]/40 bg-[#FF914D]/15 flex items-center justify-center gap-2 sm:gap-3 select-none shadow-lg"
        >
          <span className="text-[#FF914D] text-[13px] sm:text-[15px] font-black italic tracking-[0.18em] sm:tracking-widest">
            ⏳ Trade Still Processing — Check Back Later
          </span>
        </motion.div>
      </motion.div>
    );
  }

  const isResultPhase = settled || phase === 'settled';
  const [gone, setGone] = useState(false);
  const onExpireRef = useRef(onExpire);
  useEffect(() => { onExpireRef.current = onExpire; });
  useEffect(() => {
    if (!isResultPhase) return;
    const t = setTimeout(() => {
      setGone(true);
      onExpireRef.current?.();
    }, 5000);
    return () => clearTimeout(t);
  }, [isResultPhase]);

  const [countDisp, setCountDisp] = useState(0);
  useEffect(() => {
    if (!isResultPhase || !won || (Number(payout) || 0) <= 0) return;
    const target = Number(payout) || 0;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / 900);
      setCountDisp(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isResultPhase]);

  const enter = { opacity: 1, scale: 1, filter: 'blur(0px)' };
  const isWin = !!won;
  const cardClass = isWin
    ? 'bg-[#1A6140]/15 border-[#1A6140]/30'
    : 'bg-[#FF7F50]/15 border-[#FF7F50]/40';
  const textClass = isWin ? 'text-[#1A6140]' : 'text-[#FF7F50]';

  const stakeStr = (amount != null && !isNaN(Number(amount))) ? `$${Number(amount).toFixed(2)}` : null;
  const payoutStr = (payout != null && !isNaN(Number(payout)) && Number(payout) > 0) ? `+$${Number(payout).toFixed(2)}` : null;
  const entryStr = (entryPrice != null && !isNaN(Number(entryPrice))) ? Number(entryPrice).toFixed(2) : null;
  const exitStr = (exitPrice != null && !isNaN(Number(exitPrice)) && Number(exitPrice) > 0) ? Number(exitPrice).toFixed(2) : null;

  // Shares bought + the price of a share at entry, mirroring the receipt
  // cards (shares = stake / share-price; a share redeems $1 on a win).
  const sharesInfo = (() => {
    if (shares != null && !isNaN(Number(shares)) && Number(shares) > 0) {
      const sh = Number(shares);
      const pr = (sharePrice != null && !isNaN(Number(sharePrice)) && Number(sharePrice) > 0)
        ? Number(sharePrice) : (Number(amount) > 0 && sh > 0 ? Number(amount) / sh : null);
      return { sh: `${sh.toFixed(2)}sh`, pr: pr ? `@${Math.round(pr * 100)}¢` : null };
    }
    return null;
  })();
  const sharesBits = sharesInfo ? [sharesInfo.sh, sharesInfo.pr].filter(Boolean).join(' ') : null;

  const resultRow = (
    <>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${isWin ? 'bg-[#1A6140] text-white' : 'bg-[#FF7F50] text-white'}`}>
        <motion.svg
          viewBox="0 0 24 24"
          width="13"
          height="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          animate={{ scale: [1, 1.15, 1], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
        >
          {isWin ? <path d="M5 13l4 4L19 7" /> : <path d="M6 6l12 12M18 6L6 18" />}
        </motion.svg>
      </div>
      <motion.span
        animate={{ opacity: [1, 0.7, 1] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        className={`${fit ? 'text-[13px]' : 'text-[15px]'} font-black italic tracking-widest ${textClass}`}
        style={{ filter: `drop-shadow(0 0 10px ${isWin ? 'rgba(26, 97, 64,0.5)' : 'rgba(255,127,80,0.5)'})` }}
      >
        {isWin ? 'WIN' : 'LOSS'}{symbol ? ` · ${String(symbol).toUpperCase()}` : ''}
      </motion.span>
    </>
  );

  // FIT MODE (mobile) — compact in-flow pill, unchanged.
  if (fit) {
    return (
      <motion.div
        initial={enter}
        animate={enter}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        className="w-full max-w-full overflow-visible flex items-center justify-center"
      >
        <motion.div
          initial={{ opacity: 0, y: -8, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 18 }}
          className={`px-4 py-2 rounded-[20px] border flex flex-col items-center justify-center gap-1 select-none shadow-lg w-full max-w-full overflow-visible ${cardClass}`}
        >
          <div className="flex items-center justify-center gap-2 w-full max-w-full">{resultRow}</div>
          {(payoutStr || stakeStr || (entryStr && exitStr) || sharesBits) && (
            <div className={`flex items-center justify-center gap-1.5 text-[9px] font-black tabular-nums max-w-full whitespace-nowrap flex-nowrap overflow-hidden ${isLight ? 'text-[#0a261a]/70' : 'text-white/70'}`}>
              {payoutStr && <span className={textClass}>{payoutStr}</span>}
              {sharesBits && <span className="opacity-85">{sharesBits}</span>}
              {stakeStr && <span className="opacity-70">Stake {stakeStr}</span>}
              {(entryStr && exitStr) && <span className="opacity-50">${entryStr}→${exitStr}</span>}
            </div>
          )}
        </motion.div>
      </motion.div>
    );
  }

  // ─── DESKTOP: ultra-clean modern verdict ───────────────────────────────────
  const resultWon = !!won;
  const word = resultWon ? 'WON' : 'LOST';

  // Colors — theme-aware. Loss is the NO-button red, both themes.
  const accentGlow = resultWon ? 'rgba(26, 97, 64,0.35)' : 'rgba(239,83,80,0.3)';

  const textColor = resultWon
    ? (isLight ? 'text-[#1A6140]' : 'text-[#1A6140]')
    : 'text-[#EF5350]';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: gone ? 0 : 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: gone ? 0.35 : 0.2, ease: 'easeInOut' }}
      className="absolute inset-0 z-30 flex items-center justify-center"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: gone ? 0 : 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative w-full h-full overflow-hidden select-none flex items-center justify-center"
      >
        {/* Subtle accent line on top */}
        <motion.div
          className="absolute top-0 left-0 h-[2px] w-full origin-left"
          style={{
            background: !isResultPhase
              ? 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)'
              : resultWon
                ? 'linear-gradient(90deg, transparent, #1A6140, transparent)'
                : 'linear-gradient(90deg, transparent, #EF5350, transparent)',
            boxShadow: isResultPhase ? `0 0 10px ${accentGlow}` : 'none',
          }}
          initial={false}
          animate={{ scaleX: isResultPhase ? 1 : 0.3, opacity: isResultPhase ? 1 : 0.5 }}
          transition={{ duration: 0.5, ease: 'easeOut' }}
        />

        {!isResultPhase ? (
          /* ── SETTLING state ───────────────────────────────────── */
          <div className="flex flex-col items-center gap-1.5">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center"
              style={isLight ? {
                background: 'radial-gradient(circle at 35% 30%, rgba(0,0,0,0.06), rgba(0,0,0,0.02) 60%, rgba(0,0,0,0.08))',
                boxShadow: '0 4px 10px rgba(0,0,0,0.12), inset 0 1px 2px rgba(255,255,255,0.7)'
              } : {
                background: 'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.35), rgba(255,255,255,0.08) 60%, rgba(0,0,0,0.25))',
                boxShadow: '0 4px 10px rgba(0,0,0,0.40), inset 0 1px 2px rgba(255,255,255,0.40)'
              }}
            >
              <div className={`w-4 h-4 rounded-full border-2 border-t-transparent animate-spin ${isLight ? 'border-black/60' : 'border-white/90'}`} />
            </div>
            <span
              className={`text-[10px] font-black uppercase tracking-[0.25em] ${isLight ? 'text-black/60' : 'text-white/70'}`}
            >
              Settling
            </span>
          </div>
        ) : (
          /* ── VERDICT — Clean, staggered text without extra amounts or black duplicate ─────────────── */
          <div className="flex items-center justify-center gap-3.5">
            {/* Bare animated icons — no disc behind them. Win crackles
                (spring in, electric pulse); loss slams down and smoulders. */}
            {resultWon ? (
              <motion.span
                initial={{ scale: 0, rotate: -25 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 15, delay: 0.05 }}
                className="shrink-0 flex"
              >
                <motion.span
                  className="flex"
                  animate={{ scale: [1, 1.18, 1], rotate: [0, -6, 5, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ filter: `drop-shadow(0 0 10px ${isLight ? 'rgba(26, 97, 64,0.65)' : 'rgba(26, 97, 64,0.65)'})` }}
                >
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={isLight ? 'text-[#1A6140]' : 'text-[#1A6140]'}>
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </motion.span>
              </motion.span>
            ) : (
              <motion.span
                initial={{ scale: 0, y: -16 }}
                animate={{ scale: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 380, damping: 13, delay: 0.05 }}
                className="shrink-0 flex"
              >
                <motion.span
                  className="flex"
                  animate={{ x: [0, -1.5, 1.5, 0], opacity: [1, 0.72, 1] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                  style={{ filter: `drop-shadow(0 0 10px ${isLight ? 'rgba(198,40,40,0.55)' : 'rgba(239,83,80,0.65)'})` }}
                >
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={isLight ? 'text-[#C62828]' : 'text-[#EF5350]'}>
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </motion.span>
              </motion.span>
            )}

            {/* Staggered non-italic letters */}
            <div className="flex items-center gap-[1.5px] select-none">
              {word.split('').map((char, index) => (
                <motion.span
                  key={`${word}-${index}`}
                  initial={{ opacity: 0, y: 10, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{
                    delay: 0.1 + index * 0.08,
                    type: 'spring',
                    stiffness: 380,
                    damping: 20
                  }}
                  className={`text-[24px] font-black tracking-wider ${textColor}`}
                >
                  {char}
                </motion.span>
              ))}
            </div>
          </div>
        )}

        {/* Values line — payout · shares bought + share price · stake · entry→exit,
            all one nowrap row, pinned to the card's bottom edge (desktop card) */}
        <div className={`absolute bottom-1.5 inset-x-0 flex items-center justify-center gap-2 text-[9px] sm:text-[10px] font-black tabular-nums whitespace-nowrap flex-nowrap overflow-hidden px-2 ${isLight ? 'text-[#0a261a]/55' : 'text-white/55'}`}>
          {payoutStr && <span className={isWin ? '!text-[#1A6140] opacity-100' : '!text-[#EF5350] opacity-100'}>{payoutStr}</span>}
          {sharesBits && <span>{sharesBits}</span>}
          {stakeStr && <span>Stake {stakeStr}</span>}
          {(entryStr && exitStr) && <span className="opacity-70">${entryStr}→${exitStr}</span>}
        </div>
      </motion.div>
    </motion.div>
  );
}

export { FlipClock, ProgressBeam, ResolvingOutcome, TradeOutcome };

export default function TradingWidget({
  price,
  activeMarket,
  sessionBalance,
  handleExecuteTrade,
  theme,
  liveOdds,
  activeTrade,
  isExecuting,
  address,
}) {
  const [selectedDuration, setSelectedDuration] = useState(15);
  const [stakeInput, setStakeInput] = useState('');
  const stake = parseFloat(stakeInput) || 0;

  const [progress, setProgress] = useState(0);
  const [remainingSec, setRemainingSec] = useState(0);
  const remainingSecRef = useRef(0);

  useEffect(() => {
    let animationFrameId;

    const updateTimer = () => {
      if (activeTrade && ['PENDING', 'RESOLVING'].includes(activeTrade.status)) {
        const now = Date.now();
        const expiry = activeTrade.expiryMs || (activeTrade.startTime + (activeTrade.duration * 1000));
        const remainingMs = Math.max(0, expiry - now);
        
        const totalMs = activeTrade.duration ? activeTrade.duration * 1000 : 
                        (activeTrade.expiryMs - activeTrade.startTime) || 15000;
        
        // Elapsed time 0 -> 100 so the beam fills LEFT -> RIGHT (smooth per-frame)
        const elapsed = Math.max(0, Math.min(100, ((totalMs - remainingMs) / totalMs) * 100));
        setProgress(elapsed);

        const secs = Math.ceil(remainingMs / 1000);
        if (secs !== remainingSecRef.current) {
          setRemainingSec(secs);
          remainingSecRef.current = secs;
        }
        
        if (remainingMs > 0) {
          animationFrameId = requestAnimationFrame(updateTimer);
        }
      }
    };

    if (activeTrade && ['PENDING', 'RESOLVING'].includes(activeTrade.status)) {
      animationFrameId = requestAnimationFrame(updateTimer);
    } else {
      setProgress(0);
      setRemainingSec(0);
      remainingSecRef.current = 0;
    }

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [activeTrade]);

  const currentPrice = parseFloat(price) || 0;
  const entryPrice = parseFloat(activeTrade?.entryPrice) || 0;
  
  // CRITICAL: Once the backend locks the result (trade_expired sets `won`),
  // use that locked value for the resolving animation. The live price keeps
  // streaming past the countdown and could flip the displayed outcome even
  // though the trade was already settled at the instant the timer hit 0.
  let isWinning = false;
  if (activeTrade) {
    if (typeof activeTrade.won === 'boolean') {
      isWinning = activeTrade.won;
    } else if (activeTrade.direction === 'UP' || activeTrade.direction === 'YES') {
      isWinning = currentPrice > entryPrice;
    } else {
      isWinning = currentPrice < entryPrice;
    }
  }

  const symbol = activeMarket?.symbol?.toLowerCase() || activeMarket?.id?.toLowerCase() || 'eth';
  const backendOdds = liveOdds?.[symbol]?.[selectedDuration];
  const odds = backendOdds || { LONG: 0.50, SHORT: 0.50 };
  
  const yesShare = odds.LONG;
  const noShare = odds.SHORT;
  
  const yesPayoutAmt = (stake / Math.max(0.01, yesShare)).toFixed(2);
  const noPayoutAmt = (stake / Math.max(0.01, noShare)).toFixed(2);

  // When the progress beam has fully elapsed (expired) we hand off to the outcome icon
  // instead of leaving the beam stuck at 100%.
  const isPendingLive = ['PENDING', 'RESOLVING'].includes(activeTrade?.status);
  // Only a REAL backend verdict is a "settled outcome". A TIMEOUT (backend
  // unreachable / no record) or a still-unknown trade must NOT render as
  // WIN/LOSS — it stays on the neutral resolving spinner until it's removed.
  const settledOutcome = activeTrade && !isPendingLive &&
    (['WON', 'LOST', 'PAID'].includes(activeTrade.status) || typeof activeTrade.won === 'boolean');

  // LATCHED RESULT — UserApp removes a settled trade from `activeTrades` after
  // ~1s (the cleanup timer), which would unmount the result card mid-reveal.
  // The card holds 5s. So the moment a real verdict lands, capture a
  // snapshot here and keep showing it even after `activeTrade` goes null. A
  // new PENDING trade (different id) clears the latch immediately so the next
  // countdown is never blocked behind the old result.
  const [latchedTrade, setLatchedTrade] = useState(null);
  useEffect(() => {
    if (settledOutcome && activeTrade) {
      setLatchedTrade({ ...activeTrade });
    }
  }, [settledOutcome, activeTrade?.id]);
  useEffect(() => {
    if (activeTrade && latchedTrade && String(activeTrade.id) !== String(latchedTrade.id) &&
        ['PENDING', 'RESOLVING'].includes(activeTrade.status)) {
      setLatchedTrade(null);
    }
  }, [activeTrade?.id, latchedTrade?.id]);
  useEffect(() => {
    if (!latchedTrade) return;
    // Backup for the card's own 5s timer — must outlive it.
    const t = setTimeout(() => setLatchedTrade(null), 6000);
    return () => clearTimeout(t);
  }, [latchedTrade?.id]);

  // The trade actually on display: live one if present, else the latched result.
  const displayTrade = activeTrade || latchedTrade;
  const displaySettled = settledOutcome || (!activeTrade && !!latchedTrade);
  const displayDidWin = activeTrade
    ? (['WON', 'PAID'].includes(activeTrade?.status) || activeTrade?.won) === true
    : (['WON', 'PAID'].includes(latchedTrade?.status) || latchedTrade?.won) === true;
  const showActionArea = !!activeTrade || isExecuting || !!latchedTrade;

  // Expiry latches per trade id. Without this, the timer effect resets progress
  // to 0 the moment the status flips to WON/LOST (or the trade is cleaned up),
  // which un-fires the expiry and lets the PLACING branch render on top of a
  // resolved trade - or with no trade at all. Once a countdown hits zero it
  // stays hit for that trade. (Ref write during render is idempotent, so it
  // is StrictMode-safe; the guard keeps the map bounded.)
  const expiredIdsRef = useRef({});
  const expiryKey = activeTrade?.id || latchedTrade?.id;
  if (progress >= 99.7 && expiryKey) {
    expiredIdsRef.current[expiryKey] = true;
    if (Object.keys(expiredIdsRef.current).length > 50) expiredIdsRef.current = { [expiryKey]: true };
  }
  // Wall-clock expiry: rAF freezes in background tabs, so progress can sit at
  // 30% forever while the countdown is long past. Timestamps don't freeze.
  // (Backend rows use ms already; seconds are normalised — same rule as
  // tradeStatus.isTradeOverdue.)
  const rawStart = Number(activeTrade?.startTime || 0);
  const startMs = rawStart > 1e12 ? rawStart : (rawStart > 0 ? rawStart * 1000 : 0);
  const wallExpiryMs = Number(activeTrade?.expiryMs || 0) ||
    (startMs && Number(activeTrade?.duration) ? startMs + Number(activeTrade.duration) * 1000 : 0);
  const clockExpired = !!wallExpiryMs && Date.now() >= wallExpiryMs;
  const tradeExpired = progress >= 99.7 || (!!expiryKey && !!expiredIdsRef.current[expiryKey]) ||
    clockExpired || (!activeTrade && !!latchedTrade);

  // The split card is taller than the countdown row, so the strip grows
  // whenever it is on screen - during resolving AND during the settled reveal -
  // and shrinks back for the countdown, placing and button states.
  // (Countdown/placing are the first two branches below; anything else in the
  // action area is the split card.)
  const inLiveOrPlacing = (isPendingLive && !tradeExpired) || (isExecuting && !tradeExpired && !displaySettled && !latchedTrade);
  const showSplit = showActionArea && !inLiveOrPlacing;

  const handleTrade = useCallback(async (direction) => {
    if (stake <= 0) return;
    const amount = Math.min(stake, sessionBalance || 0);
    if (amount <= 0) return;

    await handleExecuteTrade({
      direction: direction === 'YES' ? 'UP' : 'DOWN',
      amount: amount,
      duration: selectedDuration,
    });
  }, [stake, sessionBalance, selectedDuration, handleExecuteTrade]);

  const hasActiveTrade = !!activeTrade || isExecuting;
  const displayBalance = sessionBalance || 0;
  const isLight = theme === 'light';

  return (
    <div className={`w-full h-full rounded-2xl p-5 flex flex-col justify-between overflow-hidden ${isLight ? 'bg-white' : 'bg-[#0a0a0a]'}`} style={{ fontFamily: '"Comfortaa", cursive', boxShadow: isLight ? '0 1px 0 rgba(255,255,255,0.05), 0 12px 32px rgba(0,0,0,0.10)' : '0 1px 0 rgba(255,255,255,0.03), 0 12px 32px rgba(0,0,0,0.35)' }}>
      
      {/* Duration Section */}
      <div className="flex items-center justify-between mb-2">
        <div className={`text-[12px] font-bold ${isLight ? 'text-[#111827]' : 'text-white/90'}`}>DURATION</div>
        <div className={`text-[12px] font-black ${isLight ? 'text-[#1A6140]' : 'text-[#1A6140]'}`}>
          ${parseFloat(price || 0).toFixed(2)}
        </div>
      </div>
      <div className="flex gap-2 mb-4">
        {[15, 10, 5].map((d) => (
          <button
            key={d}
            onClick={() => setSelectedDuration(d)}
            className={`flex-1 py-2 rounded-full text-[14px] font-bold transition-all ${
              selectedDuration === d
                ? 'bg-[#1A6140] text-white shadow-sm'
                : isLight ? 'bg-[#F8F9FA] text-[#111827] border border-[#E5E7EB] hover:bg-gray-50' : 'bg-white/5 text-white/70 border border-white/10 hover:bg-white/10'
            }`}
          >
            {d}s
          </button>
        ))}
      </div>

      {/* Stake Section */}
      <div className="flex items-center justify-between mb-2">
        <div className={`text-[12px] font-bold flex items-center gap-1 ${isLight ? 'text-[#111827]' : 'text-white/90'}`}>
          STAKE 
          <div className={`w-3 h-3 rounded-full border flex items-center justify-center text-[8px] font-bold ${isLight ? 'border-gray-300 text-gray-500' : 'border-white/20 text-white/40'}`}>i</div>
        </div>
        {/* Balance figure — signed-in users only. */}
        {(address || sessionBalance > 0) && (
          <div className={`text-[11px] ${isLight ? 'text-[#6B7280]' : 'text-white/40'}`}>Balance: {displayBalance.toFixed(4)} USDC</div>
        )}
      </div>
      
      <div className="relative mb-4">
        <span className={`absolute left-4 top-1/2 -translate-y-1/2 text-[14px] font-bold ${isLight ? 'text-[#111827]' : 'text-white/80'}`}>$</span>
        <input
          type="number"
          value={stakeInput}
          onChange={(e) => setStakeInput(e.target.value)}
          placeholder="STAKE"
          min="0"
          step="0.01"
          className={`w-full rounded-full py-2 px-8 text-center text-[14px] font-bold text-[#1A6140] placeholder-[#1A6140] outline-none focus:border-[#1A6140] transition-all ${isLight ? 'bg-[#F8F9FA]' : 'bg-white/5'}`}
        />
      </div>

      {/* Custom Slider */}
      <div className="relative px-2 mb-6">
        <div className={`h-1 rounded-full w-full relative ${isLight ? 'bg-[#E5E7EB]' : 'bg-white/10'}`}>
          <div 
            className={`absolute left-0 top-0 h-full rounded-full ${isLight ? 'bg-[#E5E7EB]' : 'bg-white/10'}`}
            style={{ width: `${Math.min((stake / (sessionBalance || 100)) * 100, 100)}%` }}
          />
          <div 
            className={`absolute w-4 h-4 border-[3px] border-[#1A6140] rounded-full top-1/2 -translate-y-1/2 -ml-2 transition-all ${isLight ? 'bg-white' : 'bg-[#0a0a0a]'}`}
            style={{ left: `${Math.min((stake / (sessionBalance || 100)) * 100, 100)}%` }}
          />
        </div>
        <input
          type="range"
          min="0"
          max={sessionBalance || 100}
          step="0.01"
          value={stake}
          onChange={(e) => setStakeInput(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </div>

      {/* Estimated Return (Split above buttons) */}
      <div className={`flex gap-3 mb-2 text-[12px] font-bold ${isLight ? 'text-[#111827]' : 'text-white/80'}`}>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          <span className="text-[#1A6140]">YES ${stake > 0 ? yesPayoutAmt : "0.00"}</span>
        </div>
        <span className={isLight ? 'text-gray-300' : 'text-white/20'}>|</span>
        <div className="flex-1 flex items-center justify-center gap-1.5">
          <span className="text-[#EF5350]">NO ${stake > 0 ? noPayoutAmt : "0.00"}</span>
        </div>
      </div>

      {/* Action Area with Flip Clock, Progress Beam (Green -> Orange), and Realtime Result Tracker */}
      <div
        className={`relative mb-4 transition-all duration-300 ease-out ${
          showSplit ? 'h-[104px] -mx-5' : 'h-[52px]'
        }`}
      >
        <AnimatePresence mode="popLayout">
          {showActionArea ? (
            <motion.div
              key="active-trade"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className={`w-full h-full relative flex items-center justify-between text-[15px] tracking-wide ${isLight ? 'text-gray-900' : 'text-white'}`}
            >
              <div className="absolute inset-0 flex items-center justify-between z-10 w-full">
                {/* If a PENDING trade exists, show the live countdown IMMEDIATELY on click */}
                {isPendingLive && !tradeExpired ? (
                  <div className="flex w-full h-full items-center justify-center gap-2.5">
                    {/* 1. FLIP CLOCK */}
                    <FlipClock seconds={remainingSec} isLight={isLight} />

                    {/* 2. PROGRESS BEAM — width = countdown progress, color = live win/lose tracker */}
                    <ProgressBeam progress={progress} isWinning={isWinning} />
                  </div>
                ) : isExecuting && !tradeExpired && !displaySettled && !latchedTrade ? (
                  // Only while genuinely placing: backend confirming AND countdown
                  // still running AND no verdict on screen. A settled or latched
                  // result always wins — placing must never cover it, however
                  // isExecuting got stuck.
                  <div className="w-full text-center text-[#1A6140] animate-pulse text-[16px] font-black tracking-widest flex items-center justify-center gap-2">
                    <div className="w-3 h-3 rounded-full border-2 border-[#1A6140] border-t-transparent animate-spin" />
                    PLACING TRADE...
                  </div>
                ) : (
                  // Countdown done: the split card sits 50/50 with the spinner
                  // in the middle while settling, then the winning side takes
                  // over the whole card once the verdict lands.
                  <TradeOutcome
                    key={displayTrade?.id || 'result'}
                    won={displayDidWin}
                    isLight={isLight}
                    settled={displaySettled}
                    phase={displaySettled ? 'settled' : 'resolving'}
                    amount={displayTrade?.amount}
                    payout={displayTrade?.payout}
                    entryPrice={displayTrade?.entryPrice}
                    exitPrice={displayTrade?.exitPrice}
                    symbol={displayTrade?.symbol}
                    shares={displayTrade ? tradeShares(displayTrade).shares : null}
                    sharePrice={displayTrade ? tradeShares(displayTrade).price : null}
                    onExpire={() => setLatchedTrade(null)}
                  />
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="trade-buttons"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="flex justify-between gap-3 h-full relative"
            >
              <div className="absolute inset-0 -inset-x-4 -inset-y-2 bg-[#1A6140]/10 rounded-full blur-xl pointer-events-none" />
              <button
                onClick={() => handleTrade('YES')}
                disabled={stake <= 0 || stake > (sessionBalance || 0)}
                className={`flex-1 h-full rounded-full flex flex-col items-center justify-center gap-0.5 transition-all text-white bg-[#1A6140] ${!address ? 'opacity-40' : ''}`}
              >
                <span className="flex items-center gap-2 text-[18px] font-black tracking-wide">
                  YES <span className="text-[17px] inline-flex items-center"><PriceMeterTicker value={Math.round(yesShare * 100)} />¢</span>
                </span>
                {/* Real-time share count the stake buys on this side (a share
                    costs the side's price and redeems $1 at settlement). */}
                <span className="text-[9px] font-bold tabular-nums opacity-80 tracking-wide">
                  ≈ {stake > 0 ? (stake / Math.max(0.01, yesShare)).toFixed(2) : '0.00'} shares
                </span>
              </button>
              <button
                onClick={() => handleTrade('NO')}
                disabled={stake <= 0 || stake > (sessionBalance || 0)}
                className={`flex-1 h-full rounded-full flex flex-col items-center justify-center gap-0.5 transition-all text-white bg-[#EF5350] ${!address ? 'opacity-40' : ''}`}
              >
                <span className="flex items-center gap-2 text-[18px] font-black tracking-wide">
                  NO <span className="text-[17px] inline-flex items-center"><PriceMeterTicker value={Math.round(noShare * 100)} />¢</span>
                </span>
                <span className="text-[9px] font-bold tabular-nums opacity-80 tracking-wide">
                  ≈ {stake > 0 ? (stake / Math.max(0.01, noShare)).toFixed(2) : '0.00'} shares
                </span>
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={`text-center text-[11px] font-medium ${isLight ? 'text-[#6B7280]' : 'text-white/40'}`}>
        By clicking, you agree to the <span className="text-[#1A6140] cursor-pointer hover:underline">Terms of Use</span>.
      </div>
    </div>
  );
}
