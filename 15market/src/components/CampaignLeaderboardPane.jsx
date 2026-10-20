import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, ChevronRight, ChevronLeft, ChevronDown, ChevronUp } from 'lucide-react';

const CampaignLeaderboardPane = ({
    isOpen,
    onToggle,
    leaderboard,
    theme,
    address,
    truncate,
    isSmallScreen
}) => {
    const isDark = theme !== 'light';

    if (isSmallScreen) {
        // Mobile layout (slides up from bottom) - Exactly matching MobileBottomHistoryPane
        return (
            <motion.div
                initial={false}
                animate={{
                    y: isOpen ? 0 : 'calc(100% - 32px)',
                }}
                transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className="absolute inset-0 z-[110] flex flex-col pointer-events-none"
                style={{ height: '100%' }}
            >
                <div className={`
                    w-full h-full pointer-events-auto
                    backdrop-blur-xl border-t border-x rounded-t-[32px]
                    flex flex-col overflow-hidden
                    ${isDark
                        ? 'bg-gradient-to-br from-[#123F28]/95 to-[#0D2B1D]/95 shadow-[0_-20px_60px_rgba(0,0,0,0.5)] border-white/10'
                        : 'bg-gradient-to-br from-[#E2EFEA]/98 to-[#D9E9E2]/98 shadow-none border-[1.5px] border-[#1A6140]'}
                `}>
                    {/* Horizontal Toggle Handle Bar - Matching MobileBottomHistoryPane */}
                    <div
                        onClick={onToggle}
                        className={`
                            w-full h-8 flex items-center justify-center cursor-pointer 
                            transition-all duration-300 relative shrink-0
                            ${isDark 
                                ? 'bg-white/5 border-b border-white/5' 
                                : 'bg-black/5 border-b border-black/5'}
                        `}
                    >
                        {/* Branded "Glow Line" at the top edge */}
                        {isDark && <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#1A6140] to-transparent opacity-90" />}
                        
                        <div className="flex items-center justify-center gap-3 w-full">
                            <Trophy size={14} className={isDark ? "text-white" : "text-[#0a261a]"} style={isDark ? { filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.8))' } : {}} />
                            <span className={`text-[11px] font-black uppercase tracking-[0.25em] ${isDark ? "text-white" : "text-[#0a261a]"}`}>
                                LEADERBOARD ({leaderboard.length})
                            </span>
                            {isOpen ? <ChevronDown size={12} className={isDark ? "text-white/80" : "text-black/60"} /> : <ChevronUp size={12} className={isDark ? "text-white/80" : "text-black/60"} />}
                        </div>
                    </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar px-4 pb-12 flex flex-col gap-2">
                    {leaderboard.length === 0 ? (
                        <div className={`h-full flex flex-col items-center justify-center opacity-20 text-center p-8 ${isDark ? 'text-white' : 'text-[#0f2618]'}`}>
                            <Trophy size={48} className="mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-center mt-2 leading-relaxed">
                                NO ACTIVE CAMPAIGN DATA
                            </p>
                        </div>
                    ) : (
                        leaderboard.map((entry, idx) => {
                            const isMe = address && entry.address.toLowerCase() === address.toLowerCase();
                            return (
                                <div 
                                    key={entry.address}
                                    className={`flex items-center justify-between p-4 rounded-[20px] transition-all
                                        ${isMe 
                                            ? 'bg-[#1A6140]/20 border border-[#1A6140]/40 shadow-[0_0_15px_rgba(26, 97, 64,0.15)]' 
                                            : isDark ? 'bg-white/5 border border-white/5 hover:border-white/10' : 'bg-white/40 border border-[#1A6140]/10'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-black
                                            ${idx === 0 ? 'bg-amber-400/20 text-amber-500 border border-amber-400/30' : 
                                              idx === 1 ? 'bg-gray-300/20 text-gray-400 border border-gray-300/30' :
                                              idx === 2 ? 'bg-amber-700/20 text-amber-600 border border-amber-700/30' :
                                              'bg-transparent text-[#1A6140]'}
                                        `}>
                                            #{idx + 1}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={`text-[12px] font-bold font-mono ${isDark ? 'text-white/90' : 'text-[#0f2618]'}`}>{truncate(entry.address)}</span>
                                            {isMe && <span className="text-[8px] font-black text-[#1A6140] uppercase tracking-widest">My Position</span>}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="text-[14px] font-black text-[#1A6140]">{entry.wins}</div>
                                        <div className="text-[8px] font-bold uppercase tracking-widest opacity-40">Wins</div>
                                    </div>
                                </div>
                            )
                        })
                    )}
                </div>
                </div>
            </motion.div>
        );
    }

    // Desktop layout (slides from right)
    return (
        <motion.div
            initial={false}
            animate={{
                width: isOpen ? 230 : 48,
            }}
            transition={{ type: 'spring', damping: 20, stiffness: 100 }}
            className={`absolute right-0 top-0 bottom-0 z-[60] flex flex-row items-center pointer-events-none group`}
        >
            <div className={`
                h-full w-full pointer-events-auto
                backdrop-blur-3xl border-l rounded-l-[40px] shadow-[-20px_0_50px_rgba(0,0,0,0.3)]
                transition-all duration-500 flex flex-row overflow-hidden
                ${isDark
                    ? 'bg-[#0a0a0a]/90 border-white/10'
                    : 'bg-[#d4e6dc]/95 border-[#1A6140]/20'}
            `}>
                {/* Vertical Toggle Bar (Left Side of Pane) */}
                <div
                    onClick={onToggle}
                    className={`
                        w-12 h-full flex flex-col items-center justify-center cursor-pointer 
                        hover:bg-white/5 transition-colors relative shrink-0 border-r border-white/5
                        ${!isOpen && 'group-hover:bg-[#1A6140]/10'}
                    `}
                >
                    <div className="flex flex-col items-center gap-8">
                        <Trophy size={20} className={isOpen ? 'text-[#1A6140]' : (isDark ? 'text-white/40 group-hover:text-white' : 'text-[#0f2618]/40 group-hover:text-[#0f2618]')} />

                        <div className="flex items-center gap-2" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                            <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isOpen ? (isDark ? 'text-white' : 'text-[#0f2618]') : (isDark ? 'text-white/40 group-hover:text-white' : 'text-[#0f2618]/40 group-hover:text-[#0f2618]')}`}>
                                Leaderboard
                            </span>
                        </div>

                        {isOpen ? <ChevronRight size={16} className={isDark ? 'text-white/40' : 'text-[#0f2618]/40'} /> : <ChevronLeft size={16} className={isDark ? 'text-white/40' : 'text-[#0f2618]/40'} />}
                    </div>
                </div>

                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: 20 }}
                            className="flex-1 flex flex-col min-w-[180px] h-full"
                        >
                <div className="flex items-center justify-between p-6 pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                        <h2 className={`text-base font-black uppercase tracking-tighter ${isDark ? 'text-white' : 'text-[#0f2618]'}`}>Live Leaderboard</h2>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 flex flex-col gap-3">
                    {leaderboard.length === 0 ? (
                        <div className={`h-full flex flex-col items-center justify-center opacity-20 text-center p-8 ${isDark ? 'text-white' : 'text-[#0f2618]'}`}>
                            <Trophy size={48} className="mb-4" />
                            <p className="text-[10px] font-black uppercase tracking-widest text-center mt-2 leading-relaxed">
                                You're not in an active campaign.<br/><br/>Subscribe to an active campaign to see the leaderboard.
                            </p>
                        </div>
                    ) : (
                        leaderboard.map((entry, idx) => {
                            const isMe = address && entry.address.toLowerCase() === address.toLowerCase();
                            return (
                                <div 
                                    key={entry.address}
                                    className={`flex items-center justify-between p-3 rounded-[20px] transition-all hover:scale-[1.02]
                                        ${isMe 
                                            ? 'bg-[#1A6140]/20 border border-[#1A6140]/40 shadow-[0_0_15px_rgba(26, 97, 64,0.15)]' 
                                            : isDark ? 'bg-white/5 border border-white/5 hover:border-white/10' : 'bg-white/40 border border-[#1A6140]/10'
                                        }
                                    `}
                                >
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black
                                            ${idx === 0 ? 'bg-amber-400/20 text-amber-500 border border-amber-400/30 shadow-[0_0_10px_rgba(251,191,36,0.3)]' : 
                                              idx === 1 ? 'bg-gray-300/20 text-gray-400 border border-gray-300/30' :
                                              idx === 2 ? 'bg-amber-700/20 text-amber-600 border border-amber-700/30' :
                                              'bg-transparent text-[#1A6140]'}
                                        `}>
                                            #{idx + 1}
                                        </div>
                                        <div className="flex flex-col">
                                            <span className={`text-[11px] font-bold font-mono ${isDark ? 'text-white/90' : 'text-[#0f2618]'}`}>{truncate(entry.address)}</span>
                                            {isMe && <span className="text-[7px] font-black text-[#1A6140] uppercase tracking-widest mt-0.5">My Position</span>}
                                        </div>
                                    </div>
                                    <div className="flex flex-col items-end">
                                        <div className="text-[14px] font-black text-[#1A6140]">{entry.wins}</div>
                                        <div className="text-[7px] font-bold uppercase tracking-widest opacity-40">Wins</div>
                                    </div>
                                </div>
                            )
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

export default CampaignLeaderboardPane;
