import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { History, ChevronRight, ChevronLeft, Share2, ExternalLink } from 'lucide-react';
import { isTradeSettled } from '../utils/tradeStatus';

const SideHistoryPane = ({
    isOpen,
    onToggle,
    tradeHistory,
    theme,
    onViewReceipt
}) => {
    const isDark = theme !== 'light';

    return (
        <motion.div
            initial={false}
            animate={{
                width: isOpen ? 230 : 48,
            }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className={`absolute left-[-8px] md:left-[-24px] lg:left-[-32px] top-0 bottom-0 z-[60] flex flex-row items-center pointer-events-none group`}
        >
            {/* The Actual Pane */}
            <div className={`
                h-full w-full pointer-events-auto
                backdrop-blur-3xl border-r border-y rounded-r-[40px] shadow-[20px_0_50px_rgba(0,0,0,0.3)]
                transition-all duration-500 flex flex-row overflow-hidden
                ${isDark
                    ? 'bg-[#0a0a0a]/90 border-white/10'
                    : 'bg-transparent border-[#1A6140]/30 shadow-[30px_0_70px_rgba(0,0,0,0.25)]'}
            `}>
                {/* Vertical Toggle Bar */}
                <div
                    onClick={onToggle}
                    className={`
                        w-12 h-full flex flex-col items-center justify-center cursor-pointer 
                        transition-all relative shrink-0 z-10
                        ${isDark ? 'hover:bg-white/5' : 'bg-[#1A6140] shadow-[2px_0_15px_rgba(0,0,0,0.1)]'}
                    `}
                >
                    <div className="flex flex-col items-center gap-8">
                        <History size={20} className={isOpen ? 'text-white' : (isDark ? 'text-white/40 group-hover:text-white' : 'text-white/60 group-hover:text-white')} />

                        <div className="flex items-center gap-2" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                            <span className={`text-[10px] font-bold uppercase tracking-[0.2em] ${isOpen ? 'text-white' : (isDark ? 'text-white/40 group-hover:text-white' : 'text-white/60 group-hover:text-white')}`}
                                style={{ fontFamily: '"Comfortaa", cursive' }}>
                                History
                            </span>
                        </div>

                        {isOpen ? <ChevronLeft size={16} className={isDark ? 'text-white/40' : 'text-white/60'} /> : <ChevronRight size={16} className={isDark ? 'text-white/40' : 'text-white/60'} />}
                    </div>
                </div>

                {/* Content Area */}
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            transition={{ delay: 0.1 }}
                            className={`flex-1 flex flex-col overflow-hidden py-6 pr-4 pl-2 ${!isDark ? 'bg-[#8CB09D]' : ''}`}
                        >
                            <div className="flex items-center justify-between mb-6 px-2">
                                <div className="flex items-center gap-2">
                                    <h2 className={`text-lg font-bold uppercase tracking-tighter ${isDark ? 'text-white' : 'text-[#0a261a]'}`}
                                        style={{ fontFamily: '"Comfortaa", cursive' }}>
                                        Trade History
                                    </h2>
                                    <span className="flex items-center justify-center w-6 h-6 text-[10px] font-bold rounded-full bg-[#1A6140]/10 text-[#1A6140] border border-[#1A6140]/20">
                                        {tradeHistory.length}
                                    </span>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 pt-1 pb-4 flex flex-col gap-2">
                                {tradeHistory.length === 0 ? (
                                    <div className={`h-full flex flex-col items-center justify-center opacity-20 text-center p-8 ${isDark ? 'text-white' : 'text-[#0f2618]'}`}>
                                        <History size={48} className="mb-4" />
                                        <p className="text-[10px] font-black uppercase tracking-widest">No history yet</p>
                                    </div>
                                ) : (
                                    tradeHistory.map((trade) => {
                                        const isWin = trade.status === 'WON' || trade.status === 'PAID';
                                        const isLoss = trade.status === 'LOST';

                                        return (
                                            <div
                                                key={trade.id}
                                                className={`
                                                    p-3 rounded-[22px] border transition-all hover:-translate-y-0.5 active:scale-[0.98] group/item
                                                    ${isDark ? 'bg-white/5 border-white/5 hover:border-white/10' : 'bg-white/40 border-[#1A6140]/20 shadow-[0_4px_15px_rgba(0,0,0,0.02)]'}
                                                `}
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <div className={`
                                                            text-[8px] font-black px-1.5 py-0.5 rounded-full uppercase tracking-tighter
                                                            ${trade.direction === 'UP' ? 'bg-[#1A6140]/20 text-[#1A6140]' : 'bg-[#FF7F50]/20 text-[#FF7F50]'}
                                                        `}>
                                                            {trade.direction}
                                                        </div>
                                                        <span className={`text-[11px] font-bold uppercase tracking-widest ${isDark ? 'text-white/90' : 'text-[#0a261a]'}`}>{trade.symbol?.toUpperCase() || 'BTC'}</span>
                                                    </div>
                                                    <div className="flex items-center gap-1.5">
                                                        {isWin && !trade.payoutSettled && (
                                                            <div className="w-2 h-2 rounded-full border border-[#1A6140] border-t-transparent animate-spin" />
                                                        )}
                                                    <div className="flex flex-col items-end">
                                                        <span className={`text-[11px] font-black uppercase ${isWin ? 'text-[#1A6140]' : isLoss ? 'text-[#FF7F50]' : (isDark ? 'text-white/40' : 'text-[#0a261a]/40')}`}>
                                                            {isWin ? `+${Number(trade.payout || 0).toFixed(2)}` : trade.status}
                                                        </span>
                                                        {isWin && (trade.payoutSettled || trade.status === 'PAID') && (
                                                            <span className="text-[9px] font-bold italic text-yellow-400 tracking-wider -mt-0.5">
                                                                paid
                                                            </span>
                                                        )}
                                                    </div>
                                                    </div>
                                                </div>

                                                <div className="flex items-center justify-between mt-1">
                                                    <div className="flex flex-col">
                                                        <span className={`text-[10px] font-medium ${isDark ? 'text-white/40' : 'text-[#0a261a]/60'}`}>Entry: ${Number(trade.entryPrice || 0).toFixed(2)}</span>
                                                        <span className={`text-[9px] font-mono ${isDark ? 'text-white/20' : 'text-[#0a261a]/40'}`}>
                                                            {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>

                                                    <div className="flex items-center gap-1.5 opacity-0 group-hover/item:opacity-100 transition-opacity">
                                                            {isTradeSettled(trade) && (
                                                            <button
                                                                onClick={() => onViewReceipt(trade)}
                                                                className={`p-1.5 rounded-full border transition-all ${isDark ? 'bg-white/5 border-transparent hover:bg-white/10 text-white/40 hover:text-white' : 'bg-transparent border-[#1A6140]/20 hover:bg-[#1A6140]/5 text-[#0a261a]/40 hover:text-[#0a261a]/60'}`}
                                                            >
                                                                <Share2 size={12} />
                                                            </button>
                                                            )}
                                                        {trade.tx && trade.tx.startsWith('0x') && trade.tx.length > 10 && (
                                                            <a
                                                                href={`https://testnet.arcscan.app/tx/${trade.tx}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className={`p-1.5 rounded-full border transition-all ${isDark ? 'bg-white/5 border-transparent hover:bg-white/10 text-white/40 hover:text-white' : 'bg-transparent border-[#1A6140]/20 hover:bg-[#1A6140]/5 text-[#0a261a]/40 hover:text-[#0a261a]/60'}`}
                                                            >
                                                                <ExternalLink size={12} />
                                                            </a>
                                                        )}
                                                    </div>
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
        </motion.div>
    );
};

export default SideHistoryPane;
