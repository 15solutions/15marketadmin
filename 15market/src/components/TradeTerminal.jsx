import React, { memo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { usePrivy } from '@privy-io/react-auth';

/**
 * AnimatedCents — Smooth odometer-style digit roller.
 * When the value changes, each digit slides up or down into position like a meter reading.
 */
function AnimatedCents({ value, color }) {
    const display = String(value).padStart(2, '0');
    const prevRef = useRef(display);
    const [direction, setDirection] = useState(0); // 1 = up, -1 = down

    useEffect(() => {
        const prev = parseInt(prevRef.current, 10);
        const curr = parseInt(display, 10);
        if (curr > prev) setDirection(1);
        else if (curr < prev) setDirection(-1);
        prevRef.current = display;
    }, [display]);

    return (
        <span style={{ display: 'inline-flex', overflow: 'hidden', height: '1.3em', lineHeight: '1.3em', verticalAlign: 'bottom' }}>
            {display.split('').map((digit, i) => (
                <span key={i} style={{ display: 'inline-block', position: 'relative', width: '0.65em', height: '1.3em', overflow: 'hidden' }}>
                    <AnimatePresence mode="popLayout" initial={false}>
                        <motion.span
                            key={`${i}-${digit}`}
                            initial={{ y: direction >= 0 ? '100%' : '-100%', opacity: 0.3 }}
                            animate={{ y: '0%', opacity: 1 }}
                            exit={{ y: direction >= 0 ? '-100%' : '100%', opacity: 0.3 }}
                            transition={{ type: 'spring', stiffness: 500, damping: 35, mass: 0.6 }}
                            style={{
                                display: 'block',
                                position: 'absolute',
                                inset: 0,
                                textAlign: 'center',
                                color: color,
                                fontWeight: 900,
                                fontFamily: '"Comfortaa", cursive',
                            }}
                        >
                            {digit}
                        </motion.span>
                    </AnimatePresence>
                </span>
            ))}
            <span style={{ color, fontWeight: 900, fontFamily: '"Comfortaa", cursive' }}>¢</span>
        </span>
    );
}

function TradeTerminalComponent({
    mode,
    sessionMode,
    setSessionMode,
    price,
    direction,
    setDirection,
    duration,
    setDuration,
    amount,
    handleAmountChange,
    handleSliderChange,
    sliderValue = 0,
    executeTrade,
    isExecuting,
    wallet,
    theme,
    maintenanceMode = false,
    tradingHalted = false,
    onDeposit,
    onWithdraw,
    transparent = false,
    uiVersion = 'v1',
    activeMarket,
    liveOdds,
    timerActive = false,
}) {
    const [isFocused, setIsFocused] = useState(false);
    const isLight = theme === 'light';
    const { login } = usePrivy();

    const symbol = activeMarket?.symbol?.toLowerCase() || 'eth';
    const currentOdds = liveOdds?.[symbol]?.[duration] || { LONG: 0.50, SHORT: 0.50 };
    
    // Calculate Payout for both directions
    const stakeAmt = parseFloat(amount) || 0;
    const yesPayout = currentOdds.LONG > 0 ? (stakeAmt / currentOdds.LONG) : 0;
    const noPayout = currentOdds.SHORT > 0 ? (stakeAmt / currentOdds.SHORT) : 0;

    const containerClass = transparent
        ? "flex flex-col h-full gap-2 lg:gap-1 overflow-hidden"
        : `w-full min-h-0 h-auto lg:h-full p-2 lg:p-2.5 pb-3 lg:pb-4 rounded-[32px] glass-panel relative transition-all duration-300 flex flex-col gap-1.5 lg:gap-2 !overflow-visible !z-50 ${isLight ? 'static-panel-light' : ''}`;

    const renderHeader = () => null;

    const renderTime = () => (
        <div className="flex flex-col gap-1 pointer-events-auto shrink-0">
            <div className="relative w-full flex items-center p-0.5 rounded-full border border-white/5 bg-white/5 backdrop-blur-3xl overflow-hidden">
                {/* 3-way Sliding Pill Background */}
                <motion.div
                    className="absolute top-0.5 bottom-0.5 w-[calc(33.33%-2px)] rounded-full bg-[#1A6140]"
                    style={{ boxShadow: isLight ? 'none' : '0 0 15px rgba(26, 97, 64,0.3)' }}
                    initial={false}
                    animate={{
                        x: duration === 15 ? 1 : duration === 10 ? 'calc(100% + 1px)' : 'calc(200% + 1px)',
                    }}
                    transition={{ type: "spring", stiffness: 400, damping: 35 }}
                />

                {[15, 10, 5].map(d => (
                    <button
                        key={d}
                        onClick={(e) => { e.stopPropagation(); if (!timerActive) setDuration(d); }}
                        disabled={timerActive}
                        className={`flex-1 relative z-10 py-1.5 lg:py-2 flex flex-col items-center justify-center transition-all duration-300 ${timerActive ? 'opacity-40 cursor-not-allowed' : ''} ${duration === d ? "text-white scale-110" : (isLight ? "text-black/40 hover:text-black/60" : "text-white/20 hover:text-white/40")}`}
                    >
                        <span className="text-[9px] lg:text-[10px] font-black tracking-tighter leading-none">{d}s</span>
                    </button>
                ))}
            </div>
        </div>
    );

    const renderAmountBox = () => (
        <div className="flex flex-col gap-1 pointer-events-auto shrink-0">
              <div className="flex items-center justify-between px-1.5">
                  <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/70' : 'text-white/40'}`}>Amount</span>
              </div>
            <div className={`flex flex-col gap-1 py-1 px-4 rounded-full border transition-all duration-300 ${isFocused ? (isLight ? 'bg-white border-[#1A6140] shadow-[0_0_15px_rgba(26, 97, 64,0.15)]' : 'bg-black/40 border-[#1A6140] shadow-[0_0_20px_rgba(26, 97, 64,0.2)]') : (isLight ? 'bg-white/60 border-[#1A6140]/30 hover:border-[#1A6140]/60' : 'bg-black/20 border-white/10 hover:border-white/20')}`}>
                <div className="flex items-center justify-center relative w-full h-6 lg:h-8">
                    <span className={`absolute left-0 text-[12px] md:text-sm font-black transition-opacity duration-300 ${isFocused ? 'opacity-80 text-[#1A6140]' : (isLight ? 'text-[#0a261a]/40' : 'text-white/40')}`}>$</span>
                    <input
                        type="number"
                        value={amount}
                        onChange={handleAmountChange}
                        onFocus={() => setIsFocused(true)}
                        onBlur={() => setTimeout(() => setIsFocused(false), 200)}
                        placeholder="STAKE"
                        disabled={timerActive}
                        className={`w-full bg-transparent force-transparent-bg text-center text-sm md:text-[15px] font-black uppercase tracking-widest outline-none border-none transition-all focus:!ring-0 focus:!shadow-none focus:!border-none focus:!outline-none ${timerActive ? 'opacity-40 cursor-not-allowed' : ''} ${isLight ? 'text-[#1A6140] placeholder:text-[#1A6140]/60' : 'text-white placeholder:text-white/40'}`}
                    />
                </div>
            </div>
            
            <div className="flex items-center justify-between px-1.5 mt-0.5">
                <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/70' : 'text-white/40'}`} style={{ fontFamily: '"Comfortaa", cursive' }}>Payout</span>
                </div>
                <div className="flex items-center gap-2">
                    <span className={`text-[9px] lg:text-[11px] font-black text-[#1A6140]`} style={{ fontFamily: '"Comfortaa", cursive' }}>
                        YES ${yesPayout.toFixed(2)}
                    </span>
                    <span className={`text-[9px] lg:text-[11px] font-black ${isLight ? 'text-black/20' : 'text-white/15'}`}>|</span>
                    <span className={`text-[9px] lg:text-[11px] font-black text-[#FF7F50]`} style={{ fontFamily: '"Comfortaa", cursive' }}>
                        NO ${noPayout.toFixed(2)}
                    </span>
                </div>
            </div>
        </div>
    );

    const renderAmountSlider = () => (
        <div className="relative pt-2 pb-1 px-2 pointer-events-auto shrink-0">
            <div className="relative h-0.5">
                <div className={`absolute inset-0 rounded-full ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-[#1A6140] transition-all duration-150" style={{ width: `${sliderValue || 0}%` }} />
                <div
                    className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 lg:w-5 lg:h-5 rounded-full ${isLight ? 'bg-white border-[3px] border-[#1A6140]' : 'bg-[#1A6140] border-2 border-black'} pointer-events-none transition-all duration-150 z-20`}
                    style={{ left: `calc(${sliderValue || 0}% - ${(sliderValue || 0) > 50 ? 8 : 6}px)` }}
                />
                <input type="range" min="0" max="100" step="1" value={sliderValue || 0} onChange={handleSliderChange} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30" />
            </div>
        </div>
    );

    const handleAction = (dir) => {
        if (maintenanceMode || tradingHalted) return;
        if (!wallet?.connected) { login(); return; }
        if (timerActive) return;
        setDirection(dir);
        executeTrade({ direction: dir });
    };

    const longCents = Math.round(currentOdds.LONG * 100);
    const shortCents = Math.round(currentOdds.SHORT * 100);

    const renderExecuteButtons = () => (
        <div className="flex w-full mx-auto gap-2 pointer-events-auto mt-2">
            <button
                onClick={(e) => { e.stopPropagation(); handleAction("UP"); }}
                disabled={isExecuting || maintenanceMode || tradingHalted || timerActive}
                className={`flex-1 flex flex-row items-center justify-center gap-1 py-2 lg:py-2.5 rounded-full transition-all relative overflow-hidden group hover:scale-[1.02] active:scale-95 ${isExecuting || maintenanceMode || tradingHalted || timerActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ background: '#1A6140', color: 'white', boxShadow: '0 8px 20px -6px rgba(26, 97, 64,0.4)' }}
            >
                {isExecuting && direction === "UP" ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                    <>
                        <span className="text-[10px] lg:text-[11px] font-black uppercase tracking-widest leading-none" style={{ fontFamily: '"Comfortaa", cursive' }}>YES</span>
                        <span className="text-[9px] lg:text-[10px] font-black opacity-90 leading-none">
                            <AnimatedCents value={longCents} color="rgba(255,255,255,0.9)" />
                        </span>
                    </>
                )}
            </button>
            <button
                onClick={(e) => { e.stopPropagation(); handleAction("DOWN"); }}
                disabled={isExecuting || maintenanceMode || tradingHalted || timerActive}
                className={`flex-1 flex flex-row items-center justify-center gap-1 py-2 lg:py-2.5 rounded-full transition-all relative overflow-hidden group hover:scale-[1.02] active:scale-95 ${isExecuting || maintenanceMode || tradingHalted || timerActive ? 'opacity-50 cursor-not-allowed' : ''}`}
                style={{ background: '#F04C4C', color: 'white', boxShadow: '0 8px 20px -6px rgba(240,76,76,0.4)' }}
            >
                {isExecuting && direction === "DOWN" ? (
                    <div className="w-5 h-5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                ) : (
                    <>
                        <span className="text-[10px] lg:text-[11px] font-black uppercase tracking-widest leading-none" style={{ fontFamily: '"Comfortaa", cursive' }}>NO</span>
                        <span className="text-[9px] lg:text-[10px] font-black opacity-90 leading-none">
                            <AnimatedCents value={shortCents} color="rgba(255,255,255,0.9)" />
                        </span>
                    </>
                )}
            </button>
        </div>
    );

    return (
        <div
            className={
                transparent
                    ? "flex flex-col h-full gap-2 lg:gap-1 overflow-hidden"
                    : `w-full min-h-0 h-auto lg:h-full p-4 lg:p-6 rounded-[32px] bg-white border border-gray-100 shadow-sm relative transition-all duration-300 flex flex-col gap-4 !overflow-visible !z-50`
            }
            style={{ fontFamily: '"Comfortaa", cursive' }}
        >
            {renderTime()}
            {renderAmountBox()}
            {renderAmountSlider()}
            {renderExecuteButtons()}
        </div>
    );
};

export const TradeTerminal = memo(TradeTerminalComponent);
