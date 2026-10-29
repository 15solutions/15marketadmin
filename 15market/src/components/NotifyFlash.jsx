// NotifyFlash — the one-and-only confirmation surface. Every success, failure
// or notice takes over the screen instead of a corner toast:
//   · mobile → full-screen platform backdrop (carbon canvas + green radiance)
//   · desktop → centered glass card over a blurred dim page
// Tap anywhere to dismiss; auto-dissolves after a beat.
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Info } from 'lucide-react';

const KINDS = {
    success: {
        icon: Check,
        ink: '#6EF2B0',
        ring: 'rgba(110,242,176,0.55)',
        hue: '26,97,64',
        label: 'Confirmed'
    },
    error: {
        icon: X,
        ink: '#FF8484',
        ring: 'rgba(255,77,77,0.55)',
        hue: '255,77,77',
        label: 'Failed'
    },
    pending: {
        icon: Info,
        ink: '#6EF2B0',
        ring: 'rgba(110,242,176,0.55)',
        hue: '26,97,64',
        label: 'In progress'
    },
    info: {
        icon: Info,
        ink: '#6EF2B0',
        ring: 'rgba(110,242,176,0.55)',
        hue: '26,97,64',
        label: 'Notice'
    }
};

export default function NotifyFlash({ message, kind = 'success', onClick, onClose }) {
    // Auto-dissolve — the message holds for a moment, then clears.
    useEffect(() => {
        const t = setTimeout(() => onClose?.(), 2600);
        return () => clearTimeout(t);
    }, [onClose]);

    const isLight = typeof window !== 'undefined' && localStorage.getItem("15market_theme") === 'light';
    const cfg = KINDS[kind] || KINDS.success;
    const Icon = cfg.icon;

    const dismiss = () => {
        onClick?.();
        onClose?.();
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            style={{ fontFamily: '"Comfortaa", cursive' }}
        >
            {/* Backdrop — opaque platform canvas on mobile, blurred dim glass
                on desktop so the page ghost-shows through behind the card. */}
            <div
                onClick={dismiss}
                className={`absolute inset-0 ${isLight ? 'bg-[#F4F7F5] md:bg-black/40' : 'bg-[#050505] md:bg-black/60'} md:backdrop-blur-xl`}
            >
                {/* Platform dressing — mobile only: green radiance + carbon weave */}
                <div
                    className="absolute inset-0 md:opacity-0"
                    style={{
                        background: `radial-gradient(circle at 50% 40%, rgba(${cfg.hue},0.45) 0%, rgba(5,5,5,0) 58%), radial-gradient(circle at 50% 112%, rgba(${cfg.hue},0.3) 0%, rgba(5,5,5,0) 62%)`,
                        backgroundColor: isLight ? '#F4F7F5' : '#050505'
                    }}
                />
                <div className="absolute inset-0 md:opacity-0 opacity-[0.14] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
            </div>

            {/* Content — stacked straight on the canvas full-screen on mobile;
                a rounded glass card centered on desktop. */}
            <motion.div
                onClick={dismiss}
                initial={{ scale: 0.85, y: 26, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.92, y: -14, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 320, damping: 24 }}
                className={`relative flex flex-col items-center text-center gap-6 px-10 py-16 md:py-12 md:px-16 md:rounded-[36px] md:border ${isLight ? 'md:bg-white/80 md:border-black/10' : 'md:bg-black/70 md:border-white/10'} md:backdrop-blur-2xl md:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.8)]`}
                style={{ cursor: onClick ? 'pointer' : 'default' }}
            >
                {/* Stamp — pop-in seal with a breathing shockwave ring */}
                <motion.div
                    initial={{ scale: 0.2, rotate: -35, opacity: 0 }}
                    animate={{ scale: 1, rotate: 0, opacity: 1 }}
                    transition={{ type: 'spring', stiffness: 380, damping: 16, delay: 0.06 }}
                    className="relative flex items-center justify-center w-24 h-24 rounded-full border"
                    style={{
                        borderColor: `rgba(${cfg.hue},0.45)`,
                        background: `radial-gradient(circle at 50% 30%, rgba(${cfg.hue},0.5) 0%, rgba(${cfg.hue},0.12) 70%, rgba(5,5,5,0) 100%)`,
                        boxShadow: `0 0 70px -8px rgba(${cfg.hue},0.65)`,
                        backgroundColor: isLight ? '#ffffff' : 'transparent'
                    }}
                >
                    <Icon size={42} strokeWidth={3} style={{ color: cfg.ink }} />
                    <motion.span
                        className="absolute inset-0 rounded-full border-2"
                        style={{ borderColor: cfg.ring }}
                        animate={{ scale: [1, 1.5], opacity: [0.8, 0] }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                    />
                </motion.div>

                {/* Message */}
                <motion.p
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.16, duration: 0.25 }}
                    className={`max-w-[300px] md:max-w-md text-lg md:text-2xl font-black leading-snug break-words ${isLight ? 'text-[#0a261a]' : 'text-white'}`}
                >
                    {message}
                </motion.p>

                {/* Verdict stamp label */}
                <motion.span
                    initial={{ opacity: 0, letterSpacing: '0.6em' }}
                    animate={{ opacity: 1, letterSpacing: '0.4em' }}
                    transition={{ delay: 0.3, duration: 0.3 }}
                    className="text-[9px] font-black uppercase"
                    style={{ color: cfg.ink }}
                >
                    {cfg.label}
                </motion.span>
            </motion.div>
        </motion.div>
    );
}
