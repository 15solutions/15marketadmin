import React, { useEffect, useState, useRef } from 'react';
import { ArrowUp, ArrowDown, Trophy, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const GREEN_COLOR = "#1A6140"; // WON is Green
const RED_COLOR = "#FF7F50";   // LOST is Coral

// 1. FLIP CLOCK DIGIT
function FlipDigitSmall({ digit }) {
    return (
        <div className="relative w-[14px] h-[20px] bg-[#0c0e12] border border-white/15 rounded-[4px] shadow-[0_1px_4px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col items-center justify-center select-none">
            <div className="absolute inset-x-0 top-1/2 h-[1px] bg-black/80 z-20" />
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                    key={digit}
                    initial={{ rotateX: -90, opacity: 0 }}
                    animate={{ rotateX: 0, opacity: 1 }}
                    exit={{ rotateX: 90, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                    style={{ transformOrigin: "center center", transformStyle: "preserve-3d" }}
                    className="absolute inset-0 flex items-center justify-center font-mono font-black text-[11px] text-white tabular-nums tracking-tighter"
                >
                    {digit}
                </motion.div>
            </AnimatePresence>
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.12] via-transparent to-black/30 pointer-events-none z-10" />
        </div>
    );
}

function FlipClockSmall({ seconds }) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const tens = Math.floor(s / 10);
    const ones = s % 10;

    return (
        <div className="flex items-center gap-[2px] select-none shrink-0">
            <FlipDigitSmall digit={tens} />
            <FlipDigitSmall digit={ones} />
            <span className="text-[8px] font-mono font-black text-white/50 ml-0.5">s</span>
        </div>
    );
}

// 2. LASER PROGRESS BEAM (Thin line laser beam)
// Width only from countdown progress. Color = live win/lose tracker
// (green winning, NO-button orange losing). Un-filled track has slanted ash/grey stripes.
function SidebarProgressBeam({ progress, isWinning }) {
    const clamped = Math.max(0, Math.min(100, progress));
    const color = isWinning ? '#1A6140' : '#FF914D';
    const head = isWinning ? '#1A6140' : '#FFB085';
    const glow = color;

    return (
        <div className="flex-1 relative flex items-center justify-center min-w-[50px] h-[16px] px-1 select-none">
            <div
                className="w-full h-[5px] rounded-full relative overflow-hidden"
                style={{
                    background: 'repeating-linear-gradient(135deg, rgba(148,150,155,0.30) 0 4px, rgba(148,150,155,0.08) 4px 9px)',
                    boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
                }}
            >
                <div
                    className="h-full rounded-full relative flex items-center justify-end will-change-[width]"
                    style={{
                        width: `${clamped}%`,
                        background: `linear-gradient(90deg, ${color} 0%, ${head} 100%)`,
                        boxShadow: `0 0 4px ${color}, 0 0 8px ${glow}`,
                    }}
                >
                    {clamped > 1 && (
                        <div
                            className="w-[3px] h-[5px] rounded-full shadow-[0_0_6px_#ffffff]"
                            style={{
                                backgroundColor: '#ffffff',
                                boxShadow: `0 0 4px #ffffff, 0 0 8px ${color}`,
                            }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

// Smooth moving countdown state for each active trade card.
function useElapsedProgress(start, duration, expiryMs) {
    const [state, setState] = useState(() => {
        const now = Date.now();
        return { progress: 0, remainingSec: Math.max(0, Math.ceil((expiryMs - now) / 1000)) };
    });

    useEffect(() => {
        let raf;
        let timer;
        const update = () => {
            const now = Date.now();
            const totalMs = (duration || 15) * 1000;
            const remainingMs = Math.max(0, expiryMs - now);
            const progress = totalMs > 0
                ? Math.max(0, Math.min(100, ((totalMs - remainingMs) / totalMs) * 100))
                : 100;
            const secs = Math.max(0, Math.ceil(remainingMs / 1000));
            setState({ progress, remainingSec: secs });
            if (remainingMs > 0) {
                raf = requestAnimationFrame(update);
            }
        };
        timer = setTimeout(() => { raf = requestAnimationFrame(update); }, 0);
        return () => {
            clearTimeout(timer);
            if (raf) cancelAnimationFrame(raf);
        };
    }, [start, duration, expiryMs]);

    return state;
}

function TradeRow({ trade, price, isDark, setSelectedPnLTrade, setIsPnLOpen }) {
    const isLong = trade.direction === "buy" || trade.direction === "UP" || trade.direction === "YES" || trade.direction === 1 || String(trade.direction) === "1";
    const entryPrice = parseFloat(trade.entryPrice);

    const now = Date.now();
    const isLocked = trade.won !== undefined;
    const isExpired = isLocked || trade.status === "WON" || trade.status === "LOST" || trade.status === "RESOLVING" || (trade.expiryMs && now >= trade.expiryMs);

    const current = (isLocked && trade.livePrice !== undefined)
        ? parseFloat(trade.livePrice)
        : (isExpired ? parseFloat(trade.livePrice || trade.lastTickPrice || trade.entryPrice) : parseFloat(price));

    const isWinning = trade.won !== undefined
        ? trade.won
        : (trade.isWinning !== undefined
            ? trade.isWinning
            : (isLong ? current > entryPrice : current < entryPrice));

    const statusColor = isWinning ? GREEN_COLOR : RED_COLOR;

    const start = trade.startTime || (trade.id > 1e12 ? trade.id : now);
    const duration = trade.duration || 15;
    const expiryMs = trade.expiryMs || trade.expiry || (start + (duration * 1000));
    const { progress, remainingSec } = useElapsedProgress(start, duration, expiryMs);
    const secondsLeft = remainingSec;

    return (
        <motion.div
            layout
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            onClick={() => {
                if (trade.status === "WON" || trade.status === "LOST") {
                    setSelectedPnLTrade(trade);
                    setIsPnLOpen(true);
                }
            }}
            className={`relative p-3 rounded-2xl border transition-all hover:scale-[1.02] active:scale-[0.98] group/item
                ${isDark ? 'bg-white/5 border-white/5 hover:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.3)]' : 'bg-[#f0f9f4] border-[#1A6140]/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)]'}
            `}
        >
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <div className={`p-1.5 rounded-lg ${isLong ? 'bg-[#1A6140]/10' : 'bg-[#FF7F50]/10'}`}>
                        {isLong
                            ? <ArrowUp size={12} color="#1A6140" strokeWidth={3} />
                            : <ArrowDown size={12} color="#FF7F50" strokeWidth={3} />
                        }
                    </div>
                    <div>
                        <div className={`text-[10px] font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-[#05140b]'}`}>
                            {isLong ? "LONG / YES" : "SHORT / NO"}
                        </div>
                        <div className={`text-[7px] font-bold tracking-widest uppercase ${isDark ? 'opacity-30 text-white' : 'text-[#05140b]/30'}`}>
                            ARC
                        </div>
                    </div>
                </div>
                <div className="text-right flex flex-col items-end">
                    <div className={`text-[10px] font-black tracking-tight ${isDark ? 'text-white/50' : 'text-[#05140b]/50'}`}>
                        {Number(trade.amount).toFixed(2)} USDC
                    </div>
                    <div className="text-[9px] font-black flex items-center gap-1" style={{ color: statusColor }}>
                        {isWinning ? '▲' : '▼'}
                        {isWinning
                            ? `+${(Math.floor(parseFloat(trade.amount) * (trade.duration <= 5 ? 2.90 : (trade.duration <= 10 ? 2.40 : 1.90)) * 100) / 100).toFixed(2)}`
                            : `-${Number(trade.amount).toFixed(2)}`
                        }
                    </div>
                </div>
            </div>

            {/* Flip Clock + Progress Beam (beam color = live win/lose tracker) */}
            <div className="flex items-center gap-2 my-2 py-1.5 px-2 rounded-xl">
                {/* 1. Flip Clock */}
                <FlipClockSmall seconds={secondsLeft} />

                {/* 2. Progress Beam (color = win/lose, width = countdown) */}
                <SidebarProgressBeam progress={progress} isWinning={isWinning} />
            </div>

            <div className="flex items-center justify-between mt-1">
                <div className="flex items-center gap-2">
                    <span className={`text-[7px] font-black uppercase tracking-widest opacity-20 ${isDark ? 'text-white' : 'text-[#05140b]'}`}>Entry</span>
                    <span className={`text-[9px] font-mono font-black ${isDark ? 'text-white/40' : 'text-[#05140b]/40'}`}>${Number(trade.entryPrice).toFixed(2)}</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[7px] font-black uppercase tracking-widest opacity-20 ${isDark ? 'text-white' : 'text-[#05140b]'}`}>Now</span>
                    <span className="text-[9px] font-mono font-black tabular-nums" style={{ color: statusColor }}>
                        ${current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                </div>
            </div>

            {(trade.status === 'RESOLVING' || trade.status === 'WON' || trade.status === 'LOST' || trade.status === 'PAID') && (
                <div className={`absolute inset-0 z-10 backdrop-blur-md ${isDark ? 'bg-black/60 border-white/10' : 'bg-white/60 border-[#1A6140]/10'} flex flex-col items-center justify-center rounded-xl border`}>
                    {(trade.status === 'WON' || trade.status === 'PAID') && (
                        <div className="flex flex-col items-center text-[#1A6140] scale-90">
                            <Trophy size={20} />
                            <span className="text-[9px] font-black uppercase tracking-[0.2em] mt-1">Won</span>
                            {trade.status === 'WON' && (
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    <div className="w-2 h-2 rounded-full border border-[#1A6140] border-t-transparent animate-spin" />
                                    <span className="text-[7px] font-bold uppercase opacity-60 animate-pulse">Payout Pending</span>
                                </div>
                            )}
                            {trade.status === 'PAID' && (
                                <span className="text-[7px] font-bold uppercase opacity-80 mt-0.5">Paid</span>
                            )}
                        </div>
                    )}
                    {trade.status === 'LOST' && <div className="flex flex-col items-center text-[#FF7F50] opacity-80 scale-90"><AlertCircle size={20} /><span className="text-[9px] font-black uppercase tracking-[0.2em] mt-1">Lost</span></div>}
                    {trade.status === 'RESOLVING' && (
                        <div className="flex flex-col items-center gap-2">
                            <div className={`w-4 h-4 rounded-full border-2 border-t-transparent animate-spin ${isDark ? 'border-white/60' : 'border-[#111827]/70'}`} />
                            <span className={`text-[8px] font-black uppercase tracking-[0.3em] animate-pulse ${isDark ? 'text-white/60' : 'text-[#111827]/70'}`}>Resolving</span>
                        </div>
                    )}
                </div>
            )}
        </motion.div>
    );
}

export function ActiveTradesSidebar({ activeTrades, price, theme = 'dark', currentPrice, setSelectedPnLTrade, setIsPnLOpen }) {
    if (!activeTrades || activeTrades.length === 0) return null;
    const isDark = theme !== 'light';

    return (
        <div className={`w-full h-full flex flex-col overflow-hidden ${isDark ? 'bg-transparent' : 'coral-green-gradient-light'}`} style={{ fontFamily: '"Comfortaa", cursive' }}
        >
            <div className={`px-4 py-2.5 flex items-center justify-between border-b ${isDark ? 'border-white/5 bg-white/[0.02]' : 'border-[#1A6140]/10 bg-white/20'}`}>
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#1A6140] shadow-[0_0_10px_#1A6140]" />
                    <span className={`text-[9px] uppercase font-black tracking-[0.3em] ${isDark ? 'text-white/40' : 'text-[#0f2618]/40'}`}>
                        Engines
                    </span>
                </div>
                {activeTrades.length > 0 && (
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#1A6140]/10 border border-[#1A6140]/20">
                        <span className="text-[8px] font-black text-[#1A6140]">{activeTrades.length} ACTIVE</span>
                    </div>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2 thin-scrollbar">
                <AnimatePresence>
                    {activeTrades.length === 0 ? (
                        <motion.div
                            key="empty"
                            layout
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                            className="h-full flex flex-col items-center justify-center text-center opacity-20 gap-2"
                        >
                            <AlertCircle size={32} strokeWidth={1} />
                            <span className="text-[10px] font-black uppercase tracking-widest">No Active Streams</span>
                        </motion.div>
                    ) : (
                        activeTrades.map((trade) => {
                            const isLong = trade.direction === "buy" || trade.direction === "UP" || trade.direction === "YES" || trade.direction === 1 || String(trade.direction) === "1";
                            const entryPrice = parseFloat(trade.entryPrice);
                            
                            const now = Date.now();
                            const isLocked = trade.won !== undefined;
                            const isExpired = isLocked || trade.status === "WON" || trade.status === "LOST" || trade.status === "RESOLVING" || (trade.expiryMs && now >= trade.expiryMs);
                            
                            const current = (isLocked && trade.livePrice !== undefined) 
                                ? parseFloat(trade.livePrice) 
                                : (isExpired ? parseFloat(trade.livePrice || trade.lastTickPrice || trade.entryPrice) : parseFloat(price));
                            
                            const isWinning = trade.won !== undefined 
                                ? trade.won 
                                : (trade.isWinning !== undefined 
                                    ? trade.isWinning 
                                    : (isLong ? current > entryPrice : current < entryPrice));

                            const statusColor = isWinning ? GREEN_COLOR : RED_COLOR;

                            const start = trade.startTime || (trade.id > 1e12 ? trade.id : now);
                            const duration = trade.duration || 15;
                            const expiryMs = trade.expiryMs || trade.expiry || (start + (duration * 1000));
                            const remainingMs = Math.max(0, expiryMs - now);
                            const totalMs = duration * 1000;
                            const progress = Math.max(0, Math.min(100, (remainingMs / totalMs) * 100));
                            const secondsLeft = Math.ceil(remainingMs / 1000);

                            return (
                                <motion.div
                                    layout
                                    key={trade.id}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: 20 }}
                                    onClick={() => {
                                        if (trade.status === "WON" || trade.status === "LOST") {
                                            setSelectedPnLTrade(trade);
                                            setIsPnLOpen(true);
                                        }
                                    }}
                                    className={`relative p-3 rounded-2xl border transition-all hover:scale-[1.02] active:scale-[0.98] group/item
                                        ${isDark ? 'bg-white/5 border-white/5 hover:border-white/10 shadow-[0_4px_20px_rgba(0,0,0,0.3)]' : 'bg-[#f0f9f4] border-[#1A6140]/10 shadow-[0_2px_10px_rgba(0,0,0,0.02)]'}
                                    `}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2">
                                            <div className={`p-1.5 rounded-lg ${isLong ? 'bg-[#1A6140]/10' : 'bg-[#FF7F50]/10'}`}>
                                                {isLong
                                                    ? <ArrowUp size={12} color="#1A6140" strokeWidth={3} />
                                                    : <ArrowDown size={12} color="#FF7F50" strokeWidth={3} />
                                                }
                                            </div>
                                            <div>
                                                <div className={`text-[10px] font-black uppercase tracking-tight ${isDark ? 'text-white' : 'text-[#05140b]'}`}>
                                                    {isLong ? "LONG / YES" : "SHORT / NO"}
                                                </div>
                                                <div className={`text-[7px] font-bold tracking-widest uppercase ${isDark ? 'opacity-30 text-white' : 'text-[#05140b]/30'}`}>
                                                    ARC
                                                </div>
                                            </div>
                                        </div>
                                        <div className="text-right flex flex-col items-end">
                                            <div className={`text-[10px] font-black tracking-tight ${isDark ? 'text-white/50' : 'text-[#05140b]/50'}`}>
                                                {Number(trade.amount).toFixed(2)} USDC
                                            </div>
                                            <div className="text-[9px] font-black flex items-center gap-1" style={{ color: statusColor }}>
                                                {isWinning ? '▲' : '▼'}
                                                {isWinning
                                                    ? `+${(Math.floor(parseFloat(trade.amount) * (trade.duration <= 5 ? 2.90 : (trade.duration <= 10 ? 2.40 : 1.90)) * 100) / 100).toFixed(2)}`
                                                    : `-${Number(trade.amount).toFixed(2)}`
                                                }
                                            </div>
                                        </div>
                                    </div>

                                    {/* Flip Clock + Progress Beam (beam color = live win/lose tracker) */}
                                    <div className="flex items-center gap-2 my-2 py-1.5 px-2 rounded-xl">
                                        {/* 1. Flip Clock */}
                                        <FlipClockSmall seconds={secondsLeft} />

                                        {/* 2. Progress Beam (color = win/lose, width = countdown) */}
                                        <SidebarProgressBeam progress={progress} isWinning={isWinning} />
                                    </div>

                                    <div className="flex items-center justify-between mt-1">
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[7px] font-black uppercase tracking-widest opacity-20 ${isDark ? 'text-white' : 'text-[#05140b]'}`}>Entry</span>
                                            <span className={`text-[9px] font-mono font-black ${isDark ? 'text-white/40' : 'text-[#05140b]/40'}`}>${Number(trade.entryPrice).toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-[7px] font-black uppercase tracking-widest opacity-20 ${isDark ? 'text-white' : 'text-[#05140b]'}`}>Now</span>
                                            <span className="text-[9px] font-mono font-black tabular-nums" style={{ color: statusColor }}>
                                                ${current.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </div>

                                    {(trade.status === 'RESOLVING' || trade.status === 'WON' || trade.status === 'LOST' || trade.status === 'PAID') && (
                                        <div className={`absolute inset-0 z-10 backdrop-blur-md ${isDark ? 'bg-black/60 border-white/10' : 'bg-white/60 border-[#1A6140]/10'} flex flex-col items-center justify-center rounded-xl border`}>
                                            {(trade.status === 'WON' || trade.status === 'PAID') && (
                                                <div className="flex flex-col items-center text-[#1A6140] scale-90">
                                                    <Trophy size={20} />
                                                    <span className="text-[9px] font-black uppercase tracking-[0.2em] mt-1">Won</span>
                                                    {trade.status === 'WON' && (
                                                        <div className="flex items-center gap-1.5 mt-0.5">
                                                            <div className="w-2 h-2 rounded-full border border-[#1A6140] border-t-transparent animate-spin" />
                                                            <span className="text-[7px] font-bold uppercase opacity-60 animate-pulse">Payout Pending</span>
                                                        </div>
                                                    )}
                                                    {trade.status === 'PAID' && (
                                                        <span className="text-[7px] font-bold uppercase opacity-80 mt-0.5">Paid</span>
                                                    )}
                                                </div>
                                            )}
                                            {trade.status === 'LOST' && <div className="flex flex-col items-center text-[#FF7F50] opacity-80 scale-90"><AlertCircle size={20} /><span className="text-[9px] font-black uppercase tracking-[0.2em] mt-1">Lost</span></div>}
                                            {trade.status === 'RESOLVING' && (
                                                <div className="flex flex-col items-center gap-2">
                                                    <div className="w-4 h-4 rounded-full border-2 border-[#1A6140] border-t-transparent animate-spin" />
                                                    <span className="text-[8px] font-black uppercase tracking-[0.3em] text-[#1A6140] animate-pulse">Syncing</span>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </motion.div>
                            );
                        })
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}
