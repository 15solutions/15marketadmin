import React, { memo, useState, useEffect, useMemo, useRef } from 'react';
import { Share2, X, Zap, TrendingUp, TrendingDown } from 'lucide-react';
import { motion } from 'framer-motion';
import { Stamp } from './Stamp';
import { isTradeSettled, tradeShares } from '../utils/tradeStatus';
import { KEEPER_URL_ARC } from '../constants';

const LCD_COUNTER_STYLE = `
  .lcd-live-dot-dark { background: #1A6140; box-shadow: 0 0 6px #1A6140, 0 0 14px #1A6140; }
  .lcd-live-dot-light { background: #1A6140; box-shadow: 0 0 5px rgba(26, 97, 64,0.55); }
  .lcd-live-blink { animation: lcd-live-blink-kf 1s step-end infinite; }
  @keyframes lcd-live-blink-kf { 0%,100%{opacity:1;} 50%{opacity:0.2;} }
  @keyframes futuristic-sweep { 0%{transform:rotate(0deg);} 100%{transform:rotate(360deg);} }
  @keyframes futuristic-pulse { 0%,100%{opacity:0.15;transform:scale(1);} 50%{opacity:0.4;transform:scale(1.06);} }
  .futuristic-sweep { animation: futuristic-sweep 3s linear infinite; }
  .futuristic-pulse { animation: futuristic-pulse 2s ease-in-out infinite; }
`;

function LiveExecutionComponent({
    activeTrades = [],
    setActiveTrades,
    price,
    setSelectedPnLTrade,
    setIsPnLOpen,
    theme,
    isTruncated = false,
    isExpanded = false,
    setIsExpanded,
    lockedResults
}) {
    const [tick, setTick] = useState(0);
    const isLight = theme === 'light';

    // 60fps clock via requestAnimationFrame — butter-smooth countdown
    const [now, setNow] = useState(Date.now());
    const rafRef = useRef(null);

    useEffect(() => {
        const tick = () => {
            setNow(Date.now());
            rafRef.current = requestAnimationFrame(tick);
        };
        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, []);

    // --- UI-ONLY MONITORING ---
    const priceRefInternal = useRef(price);
    useEffect(() => { priceRefInternal.current = price; }, [price]);

    const capturedResultsRef = useRef({}); // tradeId -> { won, exitPrice }

    const removeTrade = (id) => {
        setActiveTrades(prev => prev.filter(t => t.id !== id));
        delete capturedResultsRef.current[id];
    };

    // --- CLEANUP ---
    useEffect(() => {
        // Remove captured results for trades no longer in activeTrades
        const activeIds = new Set(activeTrades.map(t => t.id));
        Object.keys(capturedResultsRef.current).forEach(id => {
            if (!activeIds.has(id) && !activeIds.has(Number(id))) {
                delete capturedResultsRef.current[id];
            }
        });
    }, [activeTrades]);

    // Auto-collapse when only 0-1 trades remain
    useEffect(() => {
        if (activeTrades.length <= 1 && isExpanded) {
            setIsExpanded(false);
        }
    }, [activeTrades.length]);

    return (
        <div className="flex flex-col gap-1 relative min-h-0 h-full" style={{ fontFamily: '"Comfortaa", cursive' }}>
            <style>{LCD_COUNTER_STYLE}</style>


            <div className={`flex-1 overflow-y-auto custom-scrollbar min-h-0`}>
                {activeTrades.length > 0 ? (
                    (() => {
                        const sorted = [...activeTrades].sort((a, b) => (b.startTime || b.id) - (a.startTime || a.id));
                        const trade = sorted[0];
                        const start = trade.startTime || (trade.id > 1e14 ? Math.floor(trade.id / 1000) : (trade.id > 1e12 ? trade.id : Math.floor(trade.id / 100) * 1000)) || now;
                        const duration = trade.duration || 30;
                        const expiryMs = trade.expiry || trade.expiryMs || (start + (duration * 1000));

                        // Smooth countdown: use requestAnimationFrame clock + expiryMs for butter-smooth erasure
                        const rawTimeLeft = Math.max(0, (expiryMs - now) / 1000);
                        const displayTimeLeft = (trade.status !== "PENDING") ? "0.0" : (trade.timeLeft !== undefined ? Math.min(trade.timeLeft, rawTimeLeft).toFixed(1) : rawTimeLeft.toFixed(1));

                        const timerExpired = (trade.timeLeft !== undefined ? trade.timeLeft <= 0 : rawTimeLeft <= 0);
                        const isFinal = ["WON", "LOST", "TIMEOUT", "PAYOUT_DELAYED"].includes(trade.status);

                        const entryPriceVal = parseFloat(trade.entryPrice);
                        const amountVal = parseFloat(trade.amount);

                        const isLocked = trade.won !== undefined;
                        const isExpired = isLocked || trade.status === "WON" || trade.status === "LOST" || trade.status === "RESOLVING" || (trade.timeLeft !== undefined && trade.timeLeft <= 0);

                        const currentPriceVal = (isLocked && trade.livePrice !== undefined)
                            ? parseFloat(trade.livePrice)
                            : (capturedResultsRef.current[trade.id] !== undefined
                                ? parseFloat(capturedResultsRef.current[trade.id].exitPrice)
                                : (isExpired ? parseFloat(trade.livePrice || trade.lastTickPrice || trade.entryPrice) : parseFloat(price)));

                        const multiplier = trade.duration <= 5 ? 2.90 : (duration <= 10 ? 2.40 : 1.90);
                        const potentialProfit = !isNaN(amountVal) ? (amountVal * multiplier * 0.99).toFixed(2) : "0.00";

                        const isUpTrade = trade.direction === "buy" || trade.direction === "UP" || trade.direction === 1 || String(trade.direction) === "1";

                        const localWinCalc = (!isNaN(currentPriceVal) && !isNaN(entryPriceVal)
                            ? (isUpTrade ? currentPriceVal > entryPriceVal : currentPriceVal < entryPriceVal)
                            : false);

                        if (timerExpired && !isLocked && capturedResultsRef.current[trade.id] === undefined) {
                            capturedResultsRef.current[trade.id] = {
                                won: undefined,
                                exitPrice: currentPriceVal
                            };
                        }

                        const liveWinning = trade.won !== undefined
                            ? trade.won
                            : (capturedResultsRef.current[trade.id] !== undefined && capturedResultsRef.current[trade.id].won !== undefined
                                ? capturedResultsRef.current[trade.id].won
                                : (trade.isWinning !== undefined
                                    ? trade.isWinning
                                    : localWinCalc));

                        const showInstantResult = timerExpired && !isFinal && trade.won !== undefined;
                        const instantStatus = showInstantResult
                            ? (trade.won ? "WON" : "LOST")
                            : (isFinal ? trade.status : (timerExpired ? "LOCKING..." : trade.status));

                        const displayFinal = isFinal || (timerExpired && trade.won !== undefined);
                        const isPayoutPending = (instantStatus === "WON" || trade.status === "WON") && !trade.chainConfirmed && !trade.payout;

                        const formatTime = (ts) => {
                            if (!ts) return '--';
                            const d = new Date(ts);
                            return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        };

                        const circR = 36;
                        const outerR = circR + 6;
                        const circ = 2 * Math.PI * circR;
                        const outerCirc = 2 * Math.PI * outerR;
                        const progress = Math.max(0, Math.min(1, rawTimeLeft / duration));
                        const offset = circ * (1 - progress);
                        const ringColor = liveWinning ? '#1A6140' : '#FF4D4D';
                        const glowColor = liveWinning ? 'rgba(26, 97, 64,0.4)' : 'rgba(255,77,77,0.4)';
                        const tickCount = 40;

                        return (
                            <motion.div
                                key={trade.id}
                                layout
                                className="h-full"
                            >
                                <div
                                    className="p-2 md:p-3 flex flex-col items-center relative transition-all duration-500 h-full"
                                >
                                    {/* Status Header */}
                                    <div className="flex items-center justify-between w-full mb-1">
                                        <div className="flex items-center gap-1.5">
                                            <div className={`w-1.5 h-1.5 rounded-full ${displayFinal
                                                ? ((instantStatus === "WON") ? 'bg-[#1A6140]' : 'bg-[#FF7F50]')
                                                : (timerExpired ? 'bg-yellow-400 animate-pulse shadow-[0_0_8px_#FBBF24]' : (liveWinning ? 'bg-[#1A6140] animate-pulse shadow-[0_0_8px_#1A6140]' : 'bg-[#FF7F50] animate-pulse shadow-[0_0_8px_#FF7F50]'))}`} />
                                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>
                                                {displayFinal ? instantStatus : (timerExpired ? "LOCKING..." : "")}
                                            </span>
                                        </div>
                                        {activeTrades.length > 0 && (
                                            <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black ${isLight ? 'bg-[#1A6140] text-white shadow-sm' : 'bg-[#1A6140] text-black shadow-[0_0_10px_rgba(26, 97, 64,0.3)]'}`}>
                                                {activeTrades.length}
                                            </div>
                                        )}
                                    </div>

                                    {!displayFinal ? (
                                        <div className="flex flex-col md:flex-row items-center justify-center md:justify-between w-full flex-1 gap-4 md:gap-2">
                                            {/* Trade Details — underneath on mobile, left on desktop */}
                                            <div className="w-full md:w-auto flex-1 order-2 md:order-1">
                                                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-center md:text-left">
                                                    <div className="flex flex-col items-center md:items-start">
                                                        <span className={`text-[6px] font-black uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/25'}`}>Entry</span>
                                                        <p className={`text-[9px] font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>{!isNaN(entryPriceVal) ? `$${entryPriceVal.toFixed(2)}` : "..."}</p>
                                                    </div>
                                                    <div className="flex flex-col items-center md:items-start">
                                                        <span className={`text-[6px] font-black uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/25'}`}>Stake</span>
                                                        <p className={`text-[9px] font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>${Number(trade.amount).toFixed(2)}</p>
                                                    </div>
                                                    <div className="flex flex-col items-center md:items-start">
                                                        <span className={`text-[6px] font-black uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/25'}`}>Duration</span>
                                                        <p className={`text-[9px] font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>{duration}s</p>
                                                    </div>
                                                    <div className="flex flex-col items-center md:items-start">
                                                        <span className={`text-[6px] font-black uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/25'}`}>Started</span>
                                                        <p className={`text-[9px] font-black tabular-nums ${isLight ? 'text-black' : 'text-white'}`}>{formatTime(trade.startTime)}</p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Divider Line (Desktop only) */}
                                            <div className={`hidden md:block w-px h-16 order-2 ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />

                                            <div className="flex flex-col items-center flex-shrink-0 order-1 md:order-3">
                                                {/* Futuristic Countdown Circle — centered */}
                                                <div className="flex items-center justify-center flex-shrink-0 my-1">
                                                    <div className="relative w-[90px] h-[90px] md:w-[90px] md:h-[90px]">
                                                        {/* Ambient glow behind circle */}
                                                        <div className="absolute inset-[-8px] rounded-full futuristic-pulse" style={{ background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)` }} />

                                                        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
                                                            {/* Outer tick marks */}
                                                            {Array.from({ length: tickCount }).map((_, i) => {
                                                                const angle = (i / tickCount) * 360;
                                                                const rad = (angle * Math.PI) / 180;
                                                                const tickProgress = i / tickCount;
                                                                const isActive = tickProgress <= progress;
                                                                const x1 = 60 + Math.cos(rad) * (outerR + 4);
                                                                const y1 = 60 + Math.sin(rad) * (outerR + 4);
                                                                const x2 = 60 + Math.cos(rad) * (outerR + 7);
                                                                const y2 = 60 + Math.sin(rad) * (outerR + 7);
                                                                return (
                                                                    <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                                                                        stroke={isActive ? ringColor : (isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)')}
                                                                        strokeWidth={i % 5 === 0 ? 2 : 1}
                                                                        opacity={isActive ? 0.9 : 0.3}
                                                                    />
                                                                );
                                                            })}

                                                            {/* Background track */}
                                                            <circle cx="60" cy="60" r={circR} fill="none" stroke={isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)'} strokeWidth="5" />

                                                            {/* Outer dashed ring */}
                                                            <circle cx="60" cy="60" r={outerR} fill="none" stroke={ringColor} strokeWidth="1" opacity="0.15" strokeDasharray="3 5" />

                                                            {/* Main progress ring */}
                                                            <circle cx="60" cy="60" r={circR} fill="none" stroke={ringColor} strokeWidth="5" strokeLinecap="round"
                                                                strokeDasharray={circ} strokeDashoffset={offset}
                                                                style={{
                                                                    filter: `drop-shadow(0 0 10px ${ringColor}88)`,
                                                                }}
                                                            />

                                                            {/* Scanning sweep arc */}
                                                            <circle cx="60" cy="60" r={circR - 5} fill="none" stroke={ringColor} strokeWidth="1.5" opacity="0.2"
                                                                strokeDasharray={`${circ * 0.08} ${circ * 0.92}`}
                                                                className="futuristic-sweep" style={{ transformOrigin: '60px 60px' }}
                                                            />
                                                        </svg>

                                                        {/* Center content */}
                                                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                            <span className={`text-lg md:text-xl font-black tabular-nums tracking-tight leading-none ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                                                                {displayTimeLeft}
                                                            </span>
                                                            <span className={`text-[5px] font-black uppercase tracking-[0.25em] mt-0.5 ${isLight ? 'text-[#0a261a]/40' : 'text-white/30'}`}>sec</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Win/Loss status label */}
                                                <span className={`text-[7px] font-black uppercase tracking-[0.25em] mb-1 md:mb-0 ${timerExpired ? 'text-yellow-400' : (liveWinning ? "text-[#1A6140]" : "text-[#FF7F50]")}`}>
                                                    {timerExpired ? "LOCKING..." : (liveWinning ? "WINNING" : "LOSING")}
                                                </span>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Final Result View */
                                        <div className="flex flex-col items-center justify-center flex-1 gap-1 py-2">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${(instantStatus === "WON") ? 'text-[#1A6140]' : 'text-[#FF7F50]'}`}>
                                                {(instantStatus === "WON") ? "Trade Won" : "Trade Lost"}
                                            </span>
                                            <span className={`text-base font-matrix tracking-widest ${(instantStatus === "WON" || trade.status === "WON") ? 'text-[#1A6140]' : 'text-[#FF7F50]'}`}>
                                                {(instantStatus === "WON" || trade.status === "WON") ? `+$${Number(trade.payout || potentialProfit).toFixed(2)}` : "$0.00"}
                                            </span>
                                            {/* Shares bought + the price of a share, same convention
                                                as the receipt cards (share count = credited payout). */}
                                            {(() => {
                                                const info = tradeShares(trade);
                                                return (info.shares && (!trade.status || trade.status === "WON" || trade.status === "PAID")) ? (
                                                    <span className={`text-[9px] font-black tabular-nums tracking-wide ${isLight ? 'text-[#0a261a]/50' : 'text-white/45'}`}>
                                                        {Number(info.shares).toFixed(2)}sh @ {Math.round(Number(info.price || 0) * 100)}¢
                                                    </span>
                                                ) : null;
                                            })()}
                                            {isPayoutPending && (
                                                <div className="flex items-center gap-1">
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[#1A6140] animate-ping" />
                                                    <span className="text-[6px] font-black uppercase tracking-widest text-[#1A6140]/60">Payout Pending</span>
                                                </div>
                                            )}
                                            <div className="flex items-center gap-2 mt-1">
                                                {/* Share appears only once the trade has settled and the
                                                    win/lose card is ready. isFinal still admits TIMEOUT,
                                                    which is not a real verdict, so use isTradeSettled. */}
                                                {isTradeSettled(trade) && (
                                                <button
                                                    onClick={() => { setSelectedPnLTrade(trade); setIsPnLOpen(true); }}
                                                    className={`p-2 rounded-full transition-all hover:scale-110 active:scale-95 border ${isLight ? 'bg-black/5 border-black/10 text-black hover:bg-black/10' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}
                                                >
                                                    <Share2 size={14} />
                                                </button>
                                                )}
                                                {isFinal && (
                                                    <button
                                                        onClick={() => removeTrade(trade.id)}
                                                        className={`p-1 rounded-full transition-colors ${isLight ? 'bg-[#1A6140]/10 hover:bg-[#1A6140]/20 text-[#0a261a]/40' : 'bg-white/5 hover:bg-white/10 text-white/40'}`}
                                                    >
                                                        <X size={10} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                                </div>
                            </motion.div>
                        );
                    })()
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center opacity-20 h-full">
                        <div className="text-[10px] uppercase font-bold tracking-[0.2em] mb-2"
                            style={{ fontFamily: '"Comfortaa", cursive' }}>
                            Awaiting Signal
                        </div>
                        <div className="w-16 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                    </div>
                )}
            </div>
        </div>
    );
};

export const LiveExecution = memo(LiveExecutionComponent);
