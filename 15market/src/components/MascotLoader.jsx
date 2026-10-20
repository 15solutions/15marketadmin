import React from 'react';
import { motion } from 'framer-motion';

const LineArtPlane = ({ isTakingOff = false, progress = 0 }) => {
    const color = '#1A6140';

    // Lift up as takeoff approaches (roughly after 70% progress)
    // We'll lift it up more and pitch it up
    const lift = progress > 70 ? (progress - 70) * 1.8 : 0;
    const pitch = progress > 70 ? (progress - 70) * 1.5 : 0;

    return (
        <motion.div
            className="relative w-20 h-10"
            animate={{
                y: -lift,
                rotate: -pitch,
                x: progress > 70 ? (progress - 70) * 1 : 0 // Drift forward slightly during liftoff
            }}
            transition={{ type: "tween", ease: "linear", duration: 0.1 }}
        >
            <svg viewBox="0 0 100 50" className="w-full h-full overflow-visible">
                {/* Main Fuselage */}
                <path
                    d="M10 25 L 80 25 C 90 25, 95 20, 95 15 L 85 25 L 10 25 Z"
                    fill="none"
                    stroke={color}
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />
                {/* Upper Wing */}
                <path
                    d="M45 25 L 30 5 L 55 25 Z"
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinecap="round"
                />
                {/* Tail Fin */}
                <path
                    d="M20 25 L 10 10 L 25 25"
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinecap="round"
                />
                {/* Lower Wing / Engine */}
                <path
                    d="M50 25 L 40 42 L 60 25"
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinecap="round"
                />

                {/* Jet Blast VFX */}
                {(isTakingOff || progress > 40) && (
                    <motion.g
                        animate={{ opacity: [0, 0.8, 0] }}
                        transition={{ repeat: Infinity, duration: 0.1 }}
                    >
                        <path d="M5 25 L -15 20" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
                        <path d="M5 25 L -18 25" stroke={color} strokeWidth="1" strokeDasharray="3 3" />
                        <path d="M5 25 L -15 30" stroke={color} strokeWidth="1" strokeDasharray="2 2" />
                    </motion.g>
                )}
            </svg>
        </motion.div>
    );
};

export const MascotLoader = ({ progress = 0, status = 'walking', label = "Loading...", theme = 'dark' }) => {
    const isTakingOff = status === 'running' || progress > 70;
    const isLight = theme === 'light';

    return (
        <div className="flex flex-col items-center gap-10 w-full max-w-[240px] md:max-w-[340px] scale-75 transform-gpu origin-center">
            {/* Runway Progress Container */}
            <div className={`w-full h-1 ${isLight ? 'bg-[#0f2618]/10' : 'bg-white/5'} rounded-full relative border ${isLight ? 'border-[#0f2618]/10' : 'border-white/5'} overflow-visible`}>
                {/* Runway Dashed Markings */}
                <div className={`absolute inset-x-0 -bottom-3 flex justify-around px-8 ${isLight ? 'opacity-30' : 'opacity-20'}`}>
                    {[...Array(8)].map((_, i) => (
                        <div key={i} className="w-4 h-[1px] bg-[#1A6140]" />
                    ))}
                </div>

                {/* Moving Plane Wrapper */}
                <motion.div
                    className="absolute -top-10 z-20"
                    animate={{ left: `${progress}%` }}
                    transition={{
                        type: "tween",
                        ease: "linear",
                        duration: 0.1
                    }}
                    style={{ x: "-70%" }}
                >
                    <LineArtPlane isTakingOff={isTakingOff} progress={progress} />
                </motion.div>

                {/* Ground Heat Blur VFX */}
                <motion.div
                    className="absolute -bottom-6 w-16 h-4 blur-xl bg-[#1A6140]/20 rounded-full"
                    animate={{
                        left: `${progress}%`,
                        opacity: isTakingOff ? [0.3, 0.6, 0.3] : 0,
                        scale: isTakingOff ? [1, 1.2, 1] : 0.5
                    }}
                    style={{ x: "-70%" }}
                />

                {/* Progress Fill (Fuel/Thrust Path) */}
                <motion.div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-transparent via-[#1A6140]/40 to-[#1A6140] rounded-full shadow-[0_0_20px_rgba(26, 97, 64,0.4)]"
                    animate={{ width: `${progress}%` }}
                    transition={{
                        type: "tween",
                        ease: "linear",
                        duration: 0.1
                    }}
                />
            </div>
        </div>
    );
};
