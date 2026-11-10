// NotifyFlash — THE platform confirmation surface. One and the same result
// page everywhere on the platform (user app mobile, user app desktop, admin
// console): a wordless full-screen takeover with a single animated verdict
// icon and the 15market logo in the footer.
//   dark  → solid black page (carbon weave), green ring (success) / red ring (fail), white glyph
//   light → brand-green page (carbon weave), white glyph
// Nobody gets a different page anywhere. Trading verdicts (won/lost/paid) are
// deliberately NOT covered by this component.
// Tap anywhere to dismiss; auto-dissolves after a beat.
import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { Check, X, Info } from 'lucide-react';

const KINDS = {
    success: {
        icon: Check,
        ink: '#0E4D30',
        ring: 'rgb(14,77,48,0.55)',
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
        ink: '#0E4D30',
        ring: 'rgb(14,77,48,0.55)',
        hue: '26,97,64',
        label: 'In progress'
    },
    info: {
        icon: Info,
        ink: '#0E4D30',
        ring: 'rgb(14,77,48,0.55)',
        hue: '26,97,64',
        label: 'Notice'
    }
};

// Animated verdict mark for the takeover: a ring that draws itself, then the
// glyph (check / cross / info) drawn stroke by stroke, with a soft breathing
// halo behind it.
const GLYPHS = {
    success: ['M30 52 L45 66 L72 36'],
    error: ['M36 36 L64 64', 'M64 36 L36 64'],
    info: ['M50 44 L50 70', 'M50 29 L50 31'],
};

function VerdictMark({ kind, color }) {
    const paths = GLYPHS[kind === 'pending' ? 'info' : kind] || GLYPHS.success;
    return (
        <div className="relative w-[100px] h-[100px] flex items-center justify-center">
            <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: `radial-gradient(circle, ${color}33 0%, transparent 68%)` }}
                animate={{ scale: [1, 1.25, 1], opacity: [0.7, 0.2, 0.7] }}
                transition={{ duration: 2.2, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.svg viewBox="0 0 100 100" className="relative w-full h-full" fill="none"
                initial={{ scale: 0.7, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 260, damping: 18 }}>
                <motion.circle cx="50" cy="50" r="42" stroke={color} strokeWidth="4" strokeLinecap="round"
                    initial={{ pathLength: 0, rotate: -90 }} animate={{ pathLength: 1, rotate: -90 }}
                    style={{ transformOrigin: '50% 50%' }}
                    transition={{ duration: 0.55, ease: 'easeOut' }} />
                {paths.map((d, i) => (
                    <motion.path key={d} d={d} stroke={color} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"
                        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                        transition={{ duration: 0.4, ease: 'easeOut', delay: 0.45 + i * 0.18 }} />
                ))}
            </motion.svg>
        </div>
    );
}

export default function NotifyFlash({ message, kind = 'success', onClick, onClose }) {
    // Auto-dissolve — the verdict holds for a moment, then clears.
    useEffect(() => {
        const t = setTimeout(() => onClose?.(), 2600);
        return () => clearTimeout(t);
    }, [onClose]);

    // Pending never takes the page: in-progress feedback lives in the action
    // BUTTON the user pressed. Only the finished verdict (success / failed /
    // notice) earns the confirmation page.
    if (kind === 'pending') return null;

    const isLight = typeof window !== 'undefined' && localStorage.getItem('15market_theme') === 'light';
    const cfg = KINDS[kind] || KINDS.success;

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
            role="status"
            aria-live="polite"
        >
            {/* The one and only result page: solid canvas + verdict mark +
                15market logo in the safe-area footer. Identical on every
                viewport and on both platforms. */}
            <div
                onClick={dismiss}
                className="absolute inset-0 flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: isLight ? '#0E4D30' : '#050505' }}
            >
                {/* Branded background texture — the same carbon-fibre weave
                    the loading modal wears, same opacity, both modes. */}
                <div className="absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                <VerdictMark kind={kind} color={isLight ? '#FFFFFF' : cfg.ink} />
                <span className="sr-only">{message}</span>
                <img
                    src={isLight ? '/goblogo.png' : '/gowlogo.png'}
                    alt="15market"
                    className="absolute left-1/2 -translate-x-1/2 h-[104px] w-auto pointer-events-none select-none"
                    style={{ bottom: 'calc(env(safe-area-inset-bottom) + 28px)', filter: isLight ? 'brightness(0)' : 'brightness(0) invert(1)' }}
                />
            </div>
        </motion.div>
    );
}
