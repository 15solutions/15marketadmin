import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';

export function OrderBook({ price, theme = 'dark', symbol = 'USDC' }) {
    const [asks, setAsks] = useState([]);
    const [bids, setBids] = useState([]);
    const [visibleRows, setVisibleRows] = useState(12);
    const containerRef = useRef(null);
    const prevPriceRef = useRef(null);

    const isDark = theme !== 'light';
    const RED = "#FF4444";
    const GREEN = "#1A6140";
    const GREEN_BG = "rgba(26, 97, 64, 0.15)";
    const RED_BG = "rgba(255, 68, 68, 0.15)";

    // Responsive Row Calculation
    useEffect(() => {
        if (!containerRef.current) return;

        const obs = new ResizeObserver((entries) => {
            for (let entry of entries) {
                const height = entry.contentRect.height;
                // Subtract header (~32px) and price bar (~44px)
                const availableHeight = height - 80;
                const spacePerSide = availableHeight / 2;
                // Each row is roughly 20-22px (py-0.5 + text-xs + gap)
                const rows = Math.floor(spacePerSide / 21);
                setVisibleRows(Math.max(5, rows));
            }
        });

        obs.observe(containerRef.current);
        return () => obs.disconnect();
    }, []);

    // Regenerate order book levels on every price tick — gives live "beating" effect
    useEffect(() => {
        const p = parseFloat(price);
        if (!p || isNaN(p) || p <= 0) return;

        const generateLevel = (base, spread, count, type) =>
            Array.from({ length: count }).map((_, i) => {
                const px = type === 'ask'
                    ? base * (1 + spread * (i + 1))
                    : base * (1 - spread * (i + 1));
                // Randomise size each tick to simulate real order flow
                const size = (Math.random() * 2000 + 50).toFixed(2);
                return {
                    price: px.toFixed(2),
                    size,
                    depth: Math.random() * 90 + 10,
                };
            });

        const spread = 0.00035; // ~0.035% per level — realistic for liquid pairs
        setAsks(generateLevel(p, spread, visibleRows, 'ask').reverse());
        setBids(generateLevel(p, spread, visibleRows, 'bid'));
        prevPriceRef.current = p;
    }, [price, visibleRows]); // fires on every aggTrade price update or resize

    const priceNum = parseFloat(price) || 0;
    const prevNum = prevPriceRef.current || priceNum;
    const isUp = priceNum >= prevNum;

    return (
        <div ref={containerRef} className={`w-full h-full flex flex-col font-mono text-[10px] lg:text-xs overflow-hidden rounded-xl transition-colors duration-300 ${isDark ? 'text-white/80' : 'text-[#0a261a]'}`}>
            <div className={`flex items-center justify-between px-3 py-2 border-b ${isDark ? 'border-white/5 opacity-60' : 'border-[#1A6140]/10 text-[#0a261a]/40'} text-[9px] uppercase tracking-wider font-bold`}>
                <span>Price (USDC)</span>
                <span>Size</span>
            </div>

            {/* Asks (Sells) */}
            <div className="flex-1 overflow-hidden flex flex-col justify-end gap-[1px]">
                {asks.map((ask, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-0.5 relative ${isDark ? 'hover:bg-white/5' : 'hover:bg-[#1A6140]/5'} transition-colors`}>
                        <div
                            className="absolute right-0 top-0 bottom-0 pointer-events-none transition-all duration-200"
                            style={{ width: `${ask.depth}%`, backgroundColor: RED_BG, opacity: 0.6 }}
                        />
                        <span style={{ color: RED }} className="relative z-10 font-bold">{ask.price}</span>
                        <span className="relative z-10 opacity-70">{ask.size}</span>
                    </div>
                ))}
            </div>

            {/* Current Price */}
            <div className={`my-1 py-1 px-3 flex items-center justify-center border-y backdrop-blur-sm relative z-20 ${isDark ? 'bg-white/5 border-white/5' : 'bg-[#1A6140]/5 border-[#1A6140]/10'}`}>
                <div className="text-sm lg:text-base font-black tracking-tight flex items-center gap-2" style={{ color: isUp ? GREEN : RED }}>
                    {priceNum.toFixed(2)}
                    {isUp ? <ArrowUp size={12} strokeWidth={3} /> : <ArrowDown size={12} strokeWidth={3} />}
                </div>
            </div>

            {/* Bids (Buys) */}
            <div className="flex-1 overflow-hidden flex flex-col justify-start gap-[1px]">
                {bids.map((bid, i) => (
                    <div key={i} className={`flex items-center justify-between px-3 py-0.5 relative ${isDark ? 'hover:bg-white/5' : 'hover:bg-[#1A6140]/5'} transition-colors`}>
                        <div
                            className="absolute right-0 top-0 bottom-0 pointer-events-none transition-all duration-200"
                            style={{ width: `${bid.depth}%`, backgroundColor: GREEN_BG, opacity: 0.6 }}
                        />
                        <span style={{ color: GREEN }} className="relative z-10 font-bold">{bid.price}</span>
                        <span className="relative z-10 opacity-70">{bid.size}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
