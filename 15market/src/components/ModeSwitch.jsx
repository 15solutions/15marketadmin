import React from 'react';
import { motion } from 'framer-motion';
import { Zap, Layers } from 'lucide-react';

/**
 * ModeSwitch — two-sided pill switch (Classic / Ladders), built like the
 * light/dark ThemeToggle: a track with both icons and a green thumb that
 * slides under the active side.
 */
export function ModeSwitch({ theme, mode = 'classic', onChange }) {
    const isLight = theme === 'light';
    const isLadders = mode === 'ladders';

    const sides = [
        { key: 'classic', label: 'Classic', Icon: Zap },
        { key: 'ladders', label: 'Ladders', Icon: Layers },
    ];

    return (
        <div
            role="group"
            aria-label="Game mode"
            className={`relative h-10 w-20 rounded-full overflow-hidden border transition-all duration-500 ${
                isLight
                    ? 'bg-[#E6EDE9] border-[#0E4D30]/20'
                    : 'bg-black/40 border-white/10'
            }`}
        >
            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />

            {/* Green pill under the active side */}
            <motion.div
                className="absolute top-1 left-1 bottom-1 w-8 rounded-full bg-[#0E4D30] pointer-events-none"
                animate={{
                    x: isLadders ? 40 : 0,
                    boxShadow: '0 0 12px rgba(14,77,48, 0.45), inset 0 0 10px rgba(255,255,255,0.35)',
                }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />

            <div className="absolute inset-0 flex items-center">
                {sides.map(({ key, label, Icon }) => {
                    const active = mode === key;
                    return (
                        <button
                            key={key}
                            type="button"
                            aria-label={label}
                            aria-pressed={active}
                            onClick={() => { if (!active) onChange?.(key); }}
                            className="relative z-10 flex-1 h-full flex items-center justify-center"
                        >
                            <Icon
                                size={15}
                                className={`transition-colors duration-300 ${
                                    active
                                        ? 'text-white'
                                        : (isLight ? 'text-[#0E4D30]/45' : 'text-white/30')
                                }`}
                            />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default ModeSwitch;
