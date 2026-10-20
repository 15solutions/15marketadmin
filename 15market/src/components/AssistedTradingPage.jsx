import React from 'react';
import { motion } from 'framer-motion';
import { Bot, Users, ArrowLeft } from 'lucide-react';

export default function AssistedTradingPage({ onBack, theme, onSelect, isSmallScreen }) {
    const isLight = theme === 'light';

    return (
        <div className={`h-screen w-full flex flex-col overflow-hidden relative ${isLight ? 'text-black bg-[#CFDCD5]' : 'text-white bg-black'}`} style={{ fontFamily: '"Comfortaa", cursive' }}>
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            {/* Subtle texture overlay for light mode */}
            <div className={`absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] ${isLight ? '' : 'hidden'}`} />

            {/* HEADER — matches Dashboard */}
            <div className="flex items-center justify-between px-4 md:px-10 pb-0 flex-none relative z-10 w-full"
                 style={isSmallScreen ? { paddingTop: 'calc(env(safe-area-inset-top) + 12px)' } : { paddingTop: '1.25rem' }}>
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5' : 'bg-white/5 border-white/5 hover:bg-white/10'} rounded-2xl border flex items-center justify-center hover:-translate-x-1 transition-transform ${isLight ? 'text-black shadow-[0_2px_8px_rgba(0,0,0,0.12)]' : 'text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)]'}`}>
                        <ArrowLeft size={16} />
                    </button>
                    <h1 className={`text-xl font-bold uppercase tracking-widest ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>Assisted Trading</h1>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-12 max-w-5xl mx-auto w-full relative z-10 pb-20 px-4">
                
                {/* Copytrading Block */}
                <motion.div 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSelect('copytrading')}
                    className="flex-1 w-full max-w-sm flex flex-col items-center justify-center gap-3 md:gap-5 cursor-pointer group mt-4 md:mt-0"
                >
                    <div className="flex items-center justify-center transition-transform group-hover:-translate-y-2">
                        <Users className={`w-8 h-8 md:w-10 md:h-10 text-[#1A6140] ${isLight ? 'drop-shadow-[0_2px_6px_rgba(26, 97, 64,0.2)]' : 'drop-shadow-[0_0_15px_rgba(26, 97, 64,0.5)]'}`} />
                    </div>
                    <div className="text-center">
                        <h2 className={`text-[15px] md:text-xl font-black uppercase tracking-widest mb-1 md:mb-2 group-hover:text-[#1A6140] transition-colors ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>Copytrading</h2>
                        <p className={`text-[10px] md:text-xs font-bold leading-relaxed max-w-[240px] md:max-w-[260px] mx-auto ${isLight ? 'text-black/50' : 'text-white/50'}`}>Follow top performing traders and automatically mirror their positions in real-time.</p>
                    </div>
                </motion.div>

                {/* Divider Line (Horizontal on Mobile, Vertical on Desktop) */}
                <div className="w-full h-px md:w-px md:h-48 bg-gradient-to-r md:bg-gradient-to-b from-transparent via-[#1A6140] to-transparent" />

                {/* Agentic Trading Block */}
                <motion.div 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => onSelect('agentic')}
                    className="flex-1 w-full max-w-sm flex flex-col items-center justify-center gap-3 md:gap-5 cursor-pointer group mb-4 md:mb-0"
                >
                    <div className="flex items-center justify-center transition-transform group-hover:-translate-y-2">
                        <Bot className={`w-8 h-8 md:w-10 md:h-10 text-[#1A6140] ${isLight ? 'drop-shadow-[0_2px_6px_rgba(26, 97, 64,0.2)]' : 'drop-shadow-[0_0_15px_rgba(26, 97, 64,0.5)]'}`} />
                    </div>
                    <div className="text-center">
                        <h2 className={`text-[15px] md:text-xl font-black uppercase tracking-widest mb-1 md:mb-2 group-hover:text-[#1A6140] transition-colors ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>Agentic Trading</h2>
                        <p className={`text-[10px] md:text-xs font-bold leading-relaxed max-w-[240px] md:max-w-[260px] mx-auto ${isLight ? 'text-black/50' : 'text-white/50'}`}>Deploy autonomous AI agents to execute advanced strategies 24/7 on your behalf.</p>
                    </div>
                </motion.div>

            </div>
            
            {/* Background Decor */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[20%] left-[20%] w-96 h-96 bg-[#1A6140]/10 rounded-full blur-[120px] mix-blend-screen opacity-30" />
                <div className="absolute bottom-[20%] right-[20%] w-96 h-96 bg-[#1A6140]/5 rounded-full blur-[100px] mix-blend-screen opacity-30" />
            </div>
        </div>
    );
}
