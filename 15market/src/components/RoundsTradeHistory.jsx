import React, { memo, useState, useMemo } from 'react';
import { Lock, Share2, Check, X } from 'lucide-react';
import { isTradeSettled } from '../utils/tradeStatus';

function RoundsTradeHistoryComponent({
    tradeHistory,
    setSelectedPnLTrade,
    setIsPnLOpen,
    theme
}) {
    const isLight = theme === 'light';
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    // Filter for Rounds only
    const filteredTrades = useMemo(() => {
        return tradeHistory.filter(t => t.type === 'rounds');
    }, [tradeHistory]);

    const totalPages = Math.ceil(filteredTrades.length / ITEMS_PER_PAGE);
    const paginatedTrades = filteredTrades.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    return (
        <div className="w-full mt-6 lg:mt-10 mb-20 text-left">
            <div className={`p-4 lg:p-6 rounded-2xl border transition-all duration-300 glass-panel ${isLight ? 'coral-green-gradient-light !shadow-xl' : 'shadow-2xl'}`}
                style={isLight ? {} : { background: 'rgba(10, 10, 10, 0.7)' }}>
                
                <div className="flex items-center justify-between mb-4 px-1">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-[#1A6140] animate-pulse" />
                        <h3 className={`text-xs lg:text-base font-black uppercase tracking-widest ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>Rounds History</h3>
                    </div>
                    <span className="text-[8px] font-black opacity-30 uppercase tracking-[0.2em]">P2P Pooled Model</span>
                </div>

                {filteredTrades.length === 0 ? (
                    <div className={`${isLight ? 'text-[#0a261a]/60' : 'text-white/40'} py-10 text-center uppercase text-[10px] font-black tracking-widest`}>No rounds played yet.</div>
                ) : (
                    <div className="space-y-2">
                        {paginatedTrades.map((t) => {
                            const isUp = t.direction === "UP" || t.direction === 1 || String(t.direction) === "1";
                            const color = isUp ? '#1A6140' : '#FF7F50';
                            const isWon = t.status === "WON";
                            const statusColor = isWon ? '#1A6140' : '#FF7F50';

                            return (
                                <div key={t.id} className={`flex flex-row items-center justify-between p-3 lg:p-4 rounded-xl border transition-all ${isLight
                                    ? 'bg-[#f0f9f4] border-[#1A6140]/10 hover:border-[#1A6140]/30'
                                    : 'bg-black/40 border-white/10 hover:border-[#1A6140]/20'}`}>
                                    
                                    <div className="flex items-center gap-4">
                                        <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-white/5 min-w-[50px]">
                                            {isUp ? <ArrowUp size={14} className="text-[#1A6140]" /> : <ArrowDown size={14} className="text-[#FF7F50]" />}
                                            <span className="text-[8px] font-black uppercase" style={{ color }}>{isUp ? 'LONG' : 'SHORT'}</span>
                                        </div>
                                        <div className="flex flex-col items-end">
                                            <div className={`text-xs lg:text-sm font-black ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                                                {isWon ? `+${Number(t.payout || (t.amount * 1.90)).toFixed(2)}` : `${Number(t.amount).toFixed(2)}`} USDC
                                            </div>
                                            {isWon && (t.payoutSettled || t.status === 'PAID') && (
                                                <span className="text-[9px] font-bold italic text-yellow-400 tracking-wider -mt-1">
                                                    paid
                                                </span>
                                            )}
                                            <div className="text-[8px] uppercase font-black opacity-30 tracking-widest">{t.symbol.replace('USDT', '')} // Round #{t.id.toString().slice(-6)}</div>
                                        </div>
                                    </div>

                                    <div className="hidden md:flex flex-col items-end text-right">
                                        <span className={`text-[9px] font-bold ${isLight ? 'text-[#0a261a]/40' : 'text-white/30'}`}>LOCK: ${Number(t.entryPrice).toFixed(2)}</span>
                                        <span className={`text-[9px] font-bold ${isLight ? 'text-[#0a261a]/40' : 'text-white/30'}`}>SETTLE: ${Number(t.settlementPrice).toFixed(2)}</span>
                                    </div>

                                    <div className="flex items-center gap-4">
                                        <div className={`px-4 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm`}
                                            style={{ backgroundColor: `${statusColor}15`, color: statusColor, border: `1px solid ${statusColor}30` }}>
                                            {isWon ? <Check size={10} /> : <X size={10} />}
                                            {t.status}
                                        </div>
                                        {isTradeSettled(t) && (
                                        <button
                                            onClick={() => { setSelectedPnLTrade(t); setIsPnLOpen(true); }}
                                            className={`p-2 rounded-xl transition-all ${isLight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10'} text-white/40 hover:text-[#1A6140]`}
                                        >
                                            <Share2 size={16} />
                                        </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function ArrowUp({ size, className }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="m5 12 7-7 7 7" /><path d="M12 19V5" /></svg>; }
function ArrowDown({ size, className }) { return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></svg>; }

export const RoundsTradeHistory = memo(RoundsTradeHistoryComponent);
