import React from 'react';
import { motion } from 'framer-motion';

const GlobalLoader = ({ theme = 'dark', progress = 0 }) => {
    const isLight = theme === 'light';
    const dotThresholds = [0.33, 0.66, 1.0];
    
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 z-[10000] flex items-center justify-center overflow-hidden ${isLight ? 'bg-[#1A6140]' : 'bg-[#050505]'}`}
        >
            {/* Branded Background Texture - DARK MODE ONLY */}
            <div className="absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
            
            <div className="relative flex items-center gap-0">
                {/* 1. Logo */}
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, ease: "easeOut" }}
                    className="flex items-center"
                >
                    <img 
                        src={theme === 'light' ? "/goblogo.png" : "/gowlogo.png"} 
                        alt="15market" 
                        className="h-[72px] md:h-[100px] w-auto" 
                        style={isLight ? { filter: 'brightness(0)' } : {}}
                    />
                </motion.div>

                {/* 2. Divider */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.4, duration: 0.5 }}
                    className="flex items-center -ml-2 z-10 relative"
                >
                    <div className="flex items-center justify-center">
                        <span className={`text-base md:text-lg font-light select-none ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                            |
                        </span>
                    </div>
                </motion.div>

                {/* 3. Loading Text (Typing Effect + Looping Balls) */}
                <div className="flex items-baseline ml-1.5 gap-1">
                    <div className="flex">
                        {"Loading".split("").map((char, index) => (
                            <motion.span
                                key={index}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 0.8 + index * 0.1, duration: 0.1 }}
                                className={`text-[14px] md:text-[16px] font-medium tracking-tight ${isLight ? 'text-black' : 'text-white'}`}
                                style={{ fontFamily: '"Comfortaa", cursive' }}
                            >
                                {char}
                            </motion.span>
                        ))}
                    </div>
                    <div className="flex items-baseline gap-1 ml-0.5">
                        {[0, 1, 2].map((i) => {
                            const lit = progress >= dotThresholds[i];
                            return (
                                <motion.div
                                    key={i}
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: lit ? 1 : 1 }}
                                    transition={{ delay: 1.0 + (i * 0.15), duration: 0.1 }}
                                    className={`w-[4px] h-[4px] rounded-full ${isLight ? 'opacity-60 shadow-[0_0_8px_rgba(0,0,0,0.1)]' : 'shadow-[0_0_12px_rgba(255,255,255,0.3)]'}`}
                                    style={{ backgroundColor: isLight ? '#000000' : '#ffffff' }}
                                />
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* Subtle Progress bar at the bottom */}
            <motion.div 
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: `${Math.min(progress * 100, 100)}%`, opacity: 0.5 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className={`absolute bottom-0 left-0 h-[2px] bg-gradient-to-r from-transparent ${isLight ? 'via-black' : 'via-white'} to-transparent`}
            />
        </motion.div>
    );
};

export default GlobalLoader;
