import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronUp, Zap, Loader2, Globe } from 'lucide-react';
import LiveStreamingChart from './LiveStreamingChart';

const LOGO_MAP = {
    eth: '/logos/eth.png',
    btc: '/logos/btc.png',
    sol: '/logos/sol.png',
    mon: '/logos/mon.png',
    avax: '/logos/avax.png',
};

const FALLBACK_LOGOS = {
    eth: '/ethusdc.png',
    sol: '/solusdc.png',
    mon: '/monusdc.png',
    avax: '/avaxusdc.png',
};

const getLogoFilter = (isLight) => (isLight ? 'brightness(0)' : 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)');

export default function CustomChart({ symbol = 'SOLUSDT', theme = 'dark', currentPrice, activeMarket, setActiveMarket, activeTrades = [], uiVersion = 'v1', priceHistory = [], windowMs = 20000 }) {
    const isDark = theme !== 'light';
    const controlBgAlt = isDark ? 'bg-[#0a0a0a]/95' : 'bg-[#8CB09D]/95';
    const controlBorder = isDark ? 'border-white/10' : 'border-[#1A6140]/25';
    const controlText = isDark ? 'text-white' : 'text-[#0a261a]';
    const controlTextDim = isDark ? 'text-white/40' : 'text-[#0a261a]/60';

    const [isSelectorOpen, setIsSelectorOpen] = useState(false);
    const isSmallScreen = typeof window !== 'undefined' && window.innerWidth < 1024;
    const [isInternalLoading, setIsInternalLoading] = useState(false);
    const [hasReceivedPrice, setHasReceivedPrice] = useState(false);

    const listRef = useRef(null);
    const scrollInterval = useRef(null);

    const handleScroll = (direction, speed) => {
        if (scrollInterval.current) clearInterval(scrollInterval.current);
        scrollInterval.current = setInterval(() => {
            if (listRef.current) {
                listRef.current.scrollTop += direction === 'down' ? speed : -speed;
            }
        }, 16);
    };

    const stopScroll = () => {
        if (scrollInterval.current) {
            clearInterval(scrollInterval.current);
            scrollInterval.current = null;
        }
    };

    const scrollByAmount = (direction) => {
        if (listRef.current) {
            listRef.current.scrollBy({ top: direction === 'down' ? 100 : -100, behavior: 'smooth' });
        }
    };

    // Track first price tick
    useEffect(() => {
        if (!hasReceivedPrice && currentPrice && currentPrice !== "0" && currentPrice !== "0.00") {
            setHasReceivedPrice(true);
        }
    }, [currentPrice, hasReceivedPrice]);

    // Asset switch transition handler
    const onAssetSwitch = (t) => {
        setIsInternalLoading(true);
        setHasReceivedPrice(false); // Reset for new asset
        setActiveMarket(t);
        setIsSelectorOpen(false);
        // The chart now seeds its full window from backend history instantly, so
        // only a brief blur is needed for the transition — not a long wait.
        setTimeout(() => setIsInternalLoading(false), 400);
    };
    const tokens = useMemo(() => {
        const saved = JSON.parse(localStorage.getItem('15market_listed_tokens') || '[]');
        return saved.length > 0 ? saved : [
            { id: 'eth', symbol: 'ETH', name: 'Ethereum' },
            { id: 'btc', symbol: 'BTC', name: 'Bitcoin' },
            { id: 'sol', symbol: 'SOL', name: 'Solana' },
            { id: 'mon', symbol: 'MON', name: 'Monad' },
            { id: 'avax', symbol: 'AVAX', name: 'Avalanche' },
        ];
    }, [activeMarket?.id]);

    // Active trades are now rendered as entry markers directly on the canvas


    return (
        <div
            className={`relative w-full h-full flex flex-col flex-1`}
            style={{
                backgroundColor: 'transparent',
                borderRadius: 'inherit',
                minHeight: '0'
            }}
        >
            {/* Branded Background Watermark */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0 pr-[85px] lg:pr-[85px] max-lg:pr-[65px]">
                <img src={isDark ? '/gowlogo.png' : '/goblogo.png'} alt="15market" style={{
                    width: isSmallScreen ? '180px' : '320px',
                    opacity: isDark ? 0.08 : 0.05,
                    filter: isDark ? 'grayscale(1) brightness(0.7)' : 'grayscale(1) brightness(0.1)',
                    mixBlendMode: isDark ? 'screen' : 'multiply'
                }} />
            </div>

            {/* Chart Area — blurs during asset transition */}
            <div 
                className="absolute inset-0 z-10 w-full h-full"
                style={{
                    filter: (isInternalLoading || !hasReceivedPrice) ? 'blur(6px)' : 'blur(0px)',
                    transition: 'filter 0.5s ease-in-out',
                }}
            >
{/* Asset Label — FIXED logo box + FIXED gap so the ticker text sits at the
    exact same position and size for every asset. Logos are pre-normalised
    (uniform content height) so no per-asset sizing is needed. */}
                <div className="absolute top-4 left-6 z-[20] pointer-events-none flex items-center">
                    {(() => {
                        const marketKey = (activeMarket?.id || activeMarket?.symbol || symbol.replace('USDT', '')).toLowerCase();
                        const logoSrc = LOGO_MAP[marketKey] || FALLBACK_LOGOS[marketKey];
                        const cleanSym = activeMarket?.symbol || symbol.replace('USDT', '');
                        if (!logoSrc) return null;
                        return (
                            <span className="w-10 h-10 flex items-center justify-center shrink-0">
                                <img
                                    src={logoSrc}
                                    alt={cleanSym}
                                    className="w-full h-full object-contain"
                                    style={{ filter: getLogoFilter(!isDark) }}
                                />
                            </span>
                        );
                    })()}
                    <span className={`ml-2.5 text-[20px] leading-none font-bold tracking-widest ${isDark ? 'text-white' : 'text-[#0a261a]'}`} style={{ fontFamily: '"Comfortaa", cursive' }}>
                        {activeMarket?.symbol || symbol.replace('USDT', '')}
                    </span>
                </div>

                <LiveStreamingChart
                    theme={theme}
                    symbol={symbol}
                    priceHistory={priceHistory}
                    activeTrades={activeTrades}
                    currentPrice={currentPrice}
                    windowMs={windowMs}
                />
            </div>

            {/* Asset Switch Loading — spinner only, chart is blurred behind */}
            <AnimatePresence>
                {(isInternalLoading || !hasReceivedPrice) && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.3 }}
                        className="absolute inset-0 z-[60] flex items-center justify-center pointer-events-none"
                    >
                        <div className="relative">
                            <Loader2 size={36} className="text-[#1A6140] animate-spin opacity-70" />
                            <div className="absolute inset-0 blur-2xl bg-[#1A6140]/10 animate-pulse" />
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>


        </div>
    );
}
