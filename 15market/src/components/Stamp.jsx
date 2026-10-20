import React from 'react';

export function Stamp({ status, size = 'md', isWon: forcedIsWon }) {
    // Priority: forcedIsWon prop > status check (case-insensitive)
    const isWon = forcedIsWon !== undefined 
        ? forcedIsWon 
        : (status?.toUpperCase() === 'WON' || status?.toUpperCase() === 'SUCCESS');
        
    const imgSrc = isWon ? '/won_stamp.png' : '/lost_stamp.png';

    const sizes = {
        sm: {
            container: 'w-16 h-16',
            rotate: '-rotate-[15deg]',
        },
        md: {
            container: 'w-24 h-24',
            rotate: '-rotate-[15deg]',
        },
        lg: {
            container: 'w-48 h-48',
            rotate: '-rotate-[15deg]',
        }
    };

    const s = sizes[size] || sizes.md;

    return (
        <div 
            className={`relative flex items-center justify-center ${s.container} ${s.rotate} select-none pointer-events-none`}
        >
            <img 
                src={imgSrc} 
                alt={isWon ? "WON" : "LOST"} 
                className="w-full h-full object-contain opacity-95 drop-shadow-sm"
                style={{
                    filter: isWon
                        ? "invert(50%) sepia(85%) saturate(300%) hue-rotate(100deg) brightness(80%) contrast(90%) drop-shadow(0 4px 15px rgba(26, 97, 64, 0.4))"
                        : "invert(20%) sepia(90%) saturate(400%) hue-rotate(340deg) brightness(60%) contrast(150%) drop-shadow(0 4px 15px rgba(139, 0, 0, 0.4))"
                }}
            />
        </div>
    );
};
