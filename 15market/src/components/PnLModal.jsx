import React, { useRef } from 'react';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X } from 'lucide-react';
import { Stamp } from './Stamp';

export function PnLModal({ isOpen, onClose, trade, theme }) {
    const cardRef = useRef(null);

    if (!trade || !isOpen) return null;

    const isLight = theme === 'light';

    const handleDownload = async () => {
        if (cardRef.current === null) return;
        try {
            // Hide buttons during download
            const buttons = cardRef.current.querySelectorAll('.receipt-control');
            buttons.forEach(b => b.style.opacity = '0');

            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                quality: 1,
                backgroundColor: '#f8f8f8'
            });

            // Restore buttons
            buttons.forEach(b => b.style.opacity = '1');

            const link = document.createElement('a');
            link.download = `15market-pnl-${trade.id}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Failed to download image:', err);
        }
    };

    // Trust the backend status - it now comes from the authoritative on-chain result
    const isWon = trade.status?.toUpperCase() === "WON" || trade.status?.toUpperCase() === "SUCCESS";
    const isUp = trade.direction === "buy" || trade.direction === "UP" || trade.direction === 1 || String(trade.direction) === "1";

    // Calculate profit based on duration multiplier
    const getMultiplier = (duration) => {
        if (duration === 5) return 2.90;
        if (duration === 10) return 2.40;
        return 1.90;
    };

    const tradeDuration = trade.duration || 15;
    const currency = trade.currency || (trade.network === 'sol' || trade.network === 'SOL' ? 'SOL' : 'USDC');
    const multiplier = getMultiplier(tradeDuration);
    
    const totalPayout = trade.payout ? parseFloat(trade.payout) : (parseFloat(trade.amount) * multiplier);
    
    // Prediction Market Share Logic
    const numShares = totalPayout; 
    const pricePerShare = numShares > 0 ? (parseFloat(trade.amount) / numShares) : 0;
    
    // Profit Calculation: If won -> totalPayout - stake. If lost -> 0.
    const finalProfit = isWon ? (totalPayout - parseFloat(trade.amount)) : 0;

    // MON uses 4 decimal places, others use 2
    const isMon = (trade.symbol || '').toUpperCase() === 'MON';
    const isAvax = (trade.symbol || '').toUpperCase() === 'AVAX';
    const settleDecimals = isMon ? 6 : isAvax ? 4 : 2;
    const settleMultiplier = Math.pow(10, settleDecimals);
    const profitDisplay = isWon ? `+${(Math.floor(totalPayout * settleMultiplier) / settleMultiplier).toFixed(settleDecimals)}` : `-${Number(trade.amount).toFixed(2)}`;

    return (
        <AnimatePresence>
            <div className={`fixed inset-0 z-[200] flex items-center justify-center p-6 backdrop-blur-md ${isLight ? 'bg-black/10' : 'bg-black/30'}`}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="relative max-w-[90vw] sm:max-w-sm w-full"
                >
                    {/* Top Notch */}
                    <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full z-20 border-2 border-[rgba(26, 97, 64,0.5)]"
                        style={{
                            background: 'transparent',
                            boxShadow: 'none',
                        }}
                    >
                        {/* Inner fill to mask the card top border */}
                        <div className="absolute inset-[2px] rounded-full" style={{ background: isLight ? 'rgb(235,245,235)' : 'rgb(10,10,10)' }} />
                    </div>

                    {/* The PnL Card (Receipt Style) */}
                    <div
                        ref={cardRef}
                        className={`p-6 sm:p-8 font-mono shadow-[0_20px_50px_rgba(0,0,0,0.5)] relative rounded-2xl flex flex-col justify-between ${isLight ? 'text-black' : 'text-white'}`}
                        style={{
                            background: isLight ? 'rgba(245, 250, 245, 0.95)' : 'rgba(14, 14, 14, 0.97)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            border: '2px solid rgba(26, 97, 64, 0.45)',
                            clipPath: 'polygon(0% 0%, 44% 0%, 44% 0%, 50% 0%, 56% 0%, 100% 0%, 100% calc(100% - 8px), 96% 100%, 92% calc(100% - 8px), 88% 100%, 84% calc(100% - 8px), 80% 100%, 76% calc(100% - 8px), 72% 100%, 68% calc(100% - 8px), 64% 100%, 60% calc(100% - 8px), 56% 100%, 52% calc(100% - 8px), 48% 100%, 44% calc(100% - 8px), 40% 100%, 36% calc(100% - 8px), 32% 100%, 28% calc(100% - 8px), 24% 100%, 20% calc(100% - 8px), 16% 100%, 12% calc(100% - 8px), 8% 100%, 4% calc(100% - 8px), 0% 100%)',
                            minHeight: '500px',
                        }}
                    >
                        {/* Background Watermark */}
                        <div className="absolute inset-0 z-0 overflow-hidden opacity-[0.03] pointer-events-none flex flex-wrap items-center justify-center gap-4 -rotate-12 scale-150">
                            {Array(60).fill('15market').map((text, i) => (
                                <span key={i} className={`text-4xl font-black ${isLight ? 'text-black' : 'text-white'}`}>{text}</span>
                            ))}
                        </div>

                        {/* Receipt Content */}
                        <div className="relative z-10 flex flex-col items-center text-center w-full h-full">
                            
                            {/* Header Section */}
                            <div className="flex flex-col items-center mb-6 w-full">
                                <div className="flex items-center justify-center mb-4 mt-2">
                                    <img src={isLight ? "/goblogo.png" : "/gowlogo.png"} alt="15market" className="h-16 w-auto drop-shadow-md opacity-80" />
                                </div>
                                
                                <div className={`w-full border-t border-b ${isLight ? 'border-black/20' : 'border-white/20'} py-2 mb-2 flex items-center justify-center gap-3`}>
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#1A6140]"></div>
                                    <h1 className="text-3xl font-black tracking-widest">
                                        15MARKET
                                    </h1>
                                    <div className="w-1.5 h-1.5 rounded-full bg-[#1A6140]"></div>
                                </div>

                                
                                <p className={`text-[10px] font-bold tracking-[0.2em] uppercase ${isLight ? 'text-black/60' : 'text-white/60'}`}>
                                    VERIFIED PREDICTION • ARC_NETWORK
                                </p>
                            </div>

                            {/* Details Section */}
                            <div className="w-full space-y-2 text-xs font-bold mb-4">
                                <div className="flex justify-between items-center">
                                    <span className={`uppercase ${isLight ? 'text-black/50' : 'text-white/50'}`}>TX_REF:</span>
                                    <span className="font-mono">{trade.tx ? `${trade.tx.slice(0, 10)}...${trade.tx.slice(-6)}` : 'OFF_CHAIN'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className={`uppercase ${isLight ? 'text-black/50' : 'text-white/50'}`}>TIMESTAMP:</span>
                                    <span>{new Date(trade.timestamp || Date.now()).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className={`uppercase ${isLight ? 'text-black/50' : 'text-white/50'}`}>DIRECTION:</span>
                                    <span>{isUp ? 'LONG (YES)' : 'SHORT (NO)'}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className={`uppercase ${isLight ? 'text-black/50' : 'text-white/50'}`}>SHARE PRICE @ ENTRY:</span>
                                    <span>{Math.round(pricePerShare * 100)}¢</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className={`uppercase ${isLight ? 'text-black/50' : 'text-white/50'}`}>SHARES BOUGHT:</span>
                                    <span>{numShares.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className={`uppercase ${isLight ? 'text-black/50' : 'text-white/50'}`}>TOTAL:</span>
                                    <span>${Number(trade.amount).toFixed(2)}</span>
                                </div>

                                <div className="flex justify-between items-center">
                                    <span className={`uppercase ${isLight ? 'text-black/50' : 'text-white/50'}`}>TRADE PROFIT:</span>
                                    <span className={isWon ? 'text-[#1A6140]' : 'opacity-60'}>${finalProfit.toFixed(2)}</span>
                                </div>
                            </div>

                            <div className={`w-full border-t border-dashed ${isLight ? 'border-black/20' : 'border-white/20'} my-4`} />

                            {/* Trade Info Section */}
                            <div className="w-full grid grid-cols-2 gap-y-6 relative mb-4">
                                <div className="flex flex-col items-start text-left">
                                    <span className={`text-[10px] font-bold uppercase mb-1 ${isLight ? 'text-black/50' : 'text-white/50'}`}>ASSET PAIR</span>
                                    <span className="text-xl font-black tracking-tight">
                                        {trade.symbol ? `${trade.symbol.toUpperCase()} // USD` : 'ETH // USD'}
                                    </span>
                                </div>
                                <div className="flex flex-col items-end text-right">
                                    <span className={`text-[10px] font-bold uppercase mb-1 ${isLight ? 'text-black/50' : 'text-white/50'}`}>EXECUTION</span>
                                    <span className={`font-black uppercase text-xl ${isUp ? 'text-[#1A6140]' : 'text-[#FF7F50]'}`}>
                                                                            {isUp ? 'LONG' : 'SHORT'}
                                    </span>
                                </div>

                                <div className="flex flex-col items-start text-left">
                                    <span className={`text-[10px] font-bold uppercase mb-1 ${isLight ? 'text-black/50' : 'text-white/50'}`}>ENTRY</span>
                                    <span className="text-lg font-black">${Number(trade.entryPrice || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex flex-col items-end text-right">
                                    <span className={`text-[10px] font-bold uppercase mb-1 ${isLight ? 'text-black/50' : 'text-white/50'}`}>STAKE</span>
                                    <span className="text-lg font-black">{Number(trade.amount || 0).toFixed(2)} {currency}</span>
                                </div>

                                <div className="flex flex-col items-start text-left mt-2">
                                    <span className={`text-[10px] font-bold uppercase mb-1 ${isLight ? 'text-black/50' : 'text-white/50'}`}>SETTLED</span>
                                    <span className={`text-lg font-black ${trade.status === "PENDING" ? 'text-[#1A6140]' : ''}`}>
                                        {trade.status !== "PENDING" && (trade.settlementPrice || trade.exitPrice) ? `$${Number(trade.settlementPrice || trade.exitPrice || 0).toFixed(2)}` : 'PENDING'}
                                    </span>
                                </div>
                                <div className="flex flex-col items-end text-right mt-2">
                                    <span className={`text-[10px] font-bold uppercase mb-1 ${isLight ? 'text-black/50' : 'text-white/50'}`}>PNL</span>
                                    <span className={`text-xl font-black tracking-tight ${isWon ? 'text-[#1A6140]' : 'text-[#FF7F50]'}`}>
                                        {isWon ? '▲' : '▼'}{profitDisplay} <span className="text-xs">{currency}</span>
                                    </span>
                                </div>

                                {/* Stamp Positioned in Center Overlay */}
                                {trade.status !== "PENDING" && (
                                    <div className="absolute top-[65%] left-1/2 transform -translate-x-1/2 -translate-y-1/2 scale-[1.15] pointer-events-none opacity-90 z-30 drop-shadow-sm">
                                        <Stamp status={trade.status} isWon={isWon} size="lg" />
                                    </div>
                                )}
                            </div>

                            <div className={`w-full border-t border-dashed ${isLight ? 'border-black/20' : 'border-white/20'} mb-4`} />

                            {/* FOOTER CONTROLS */}
                            <div className="w-full grid grid-cols-2 gap-4 mt-auto mb-6 receipt-control relative z-20">
                                <button
                                    onClick={handleDownload}
                                    className="py-3 bg-[#1A6140] text-white text-xs font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 hover:bg-[#1A6140] transition-all shadow-lg"
                                >
                                    <Download size={16} />
                                    SAVE IMAGE
                                </button>
                                <button
                                    onClick={onClose}
                                    className={`py-3 bg-transparent ${isLight ? 'text-[#1A6140]' : 'text-[#1A6140]'} border border-[#1A6140]/50 text-xs font-black uppercase tracking-widest rounded-xl flex items-center justify-center gap-2 hover:bg-[#1A6140]/10 transition-all`}
                                >
                                    <X size={16} />
                                    CLOSE VIEW
                                </button>
                            </div>

                            <p className={`text-[9px] font-bold tracking-[0.2em] leading-relaxed uppercase ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                                TRADING_RECEIPT // 15MARKET_PROTOCOL<br />
                                0xDE738...BLOCK_VERIFIED
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
