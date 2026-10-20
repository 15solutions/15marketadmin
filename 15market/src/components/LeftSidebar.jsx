import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Eye, EyeOff, ChevronUp, ChevronDown, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const LOGO_MAP = {
  eth: '/ethusdc.png',
  btc: '/btc.png',
  sol: '/sol.png',
  mon: '/monad.png',
  avax: '/avax.png',
};

const SLOW_SPEED = 1;
const FAST_SPEED = 4;

function getLogoFilter(isLight) {
  if (isLight) return 'brightness(0)';
  return 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)';
}

export default function LeftSidebar({
  sessionBalance,
  isLoggedIn = false,
  activeMarket,
  setActiveMarket,
  defaultTokens,
  listedTokens = [],
  oraclePrices = {},
  changes24h = {},
  theme,
  isSmallScreen,
}) {
  const [marketTab, setMarketTab] = useState('all');
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Crypto');
  const [showComingSoon, setShowComingSoon] = useState(false);

  const listRef = useRef(null);
  const scrollIntervalRef = useRef(null);

  const isLight = theme === 'light';

  if (isSmallScreen) return null;

  const updateScrollState = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 2);
    setCanScrollDown(el.scrollTop < el.scrollHeight - el.clientHeight - 2);
  }, []);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    updateScrollState();
    el.addEventListener('scroll', updateScrollState);
    return () => el.removeEventListener('scroll', updateScrollState);
  }, [updateScrollState]);

  const startScrolling = (direction, speed) => {
    stopScrolling();
    scrollIntervalRef.current = setInterval(() => {
      const el = listRef.current;
      if (!el) return;
      el.scrollTop += direction === 'up' ? -speed : speed;
    }, 16);
  };

  const stopScrolling = () => {
    if (scrollIntervalRef.current) {
      clearInterval(scrollIntervalRef.current);
      scrollIntervalRef.current = null;
    }
  };

  const displayBalance = sessionBalance || 0;

  // Use listedTokens if available, otherwise fall back to defaultTokens
  const allTokens = listedTokens.length > 0 ? listedTokens : (defaultTokens || []);
  const tokensToDisplay = searchQuery
    ? allTokens.filter(t => {
        const symbol = (t.symbol || t.id || '').toLowerCase();
        return symbol.includes(searchQuery.toLowerCase());
      })
    : allTokens;

  return (
    <div 
      className="w-full h-full bg-transparent flex flex-col overflow-hidden"
      style={{ fontFamily: '"Comfortaa", cursive' }}
    >
      {/* Balance Section — only for signed-in users. Guests get no balance UI at
          all, so there is nothing on screen hinting at a figure they can't see. */}
      {(isLoggedIn || sessionBalance > 0) && (
        <div className="pt-0 pb-3">
          <div className={`text-[10px] font-bold tracking-widest uppercase mb-0.5 ${isLight ? 'text-[#6B7280]' : 'text-white/40'}`}>
            BALANCE
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[32px] font-black tracking-tight leading-none ${isLight ? 'text-[#111827]' : 'text-white/90'}`}>
              {displayBalance.toFixed(4)}
            </span>
            <span className={`text-[11px] font-medium ${isLight ? 'text-[#6B7280]' : 'text-white/40'}`}>USDC</span>
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative mb-3">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#6B7280]" />
        <input
          type="text"
          placeholder="Search assets..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={`w-full h-[36px] pl-9 pr-3 rounded-full text-[12px] font-medium border outline-none transition-colors ${
            isLight
              ? 'bg-[#F5F5F5] border-[#E9E9E9] text-[#111827] placeholder:text-[#9CA3AF] focus:border-[#1A6140]'
              : 'bg-white/5 border-white/10 text-white/80 placeholder:text-white/30 focus:border-[#1A6140]'
          }`}
        />
      </div>

      {/* Coming Soon Disclaimer */}
      {/* Category Pills */}
      <div className="relative flex gap-1 mb-3">
        {['Crypto', 'Forex', 'Stocks'].map((tab) => (
          <button
            key={tab}
            onClick={() => {
              if (tab === 'Crypto') {
                setActiveCategory('Crypto');
                setShowComingSoon(false);
              } else {
                setActiveCategory(tab);
                setShowComingSoon(true);
                setTimeout(() => setShowComingSoon(false), 2000);
              }
            }}
            className={`flex-1 py-1 rounded-full text-[8px] font-bold uppercase tracking-wider border transition-all ${
              activeCategory === tab
                ? 'bg-[#1A6140] border-[#1A6140] text-white'
                : isLight
                  ? 'bg-white border-[#E9E9E9] text-[#6B7280] hover:border-[#1A6140] hover:text-[#1A6140]'
                  : 'bg-white/5 border-white/10 text-white/40 hover:border-[#1A6140] hover:text-[#1A6140]'
            }`}
          >
            {tab}
          </button>
        ))}

        {/* Floating Orange Callout (Coming Soon) */}
        <AnimatePresence>
          {showComingSoon && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              className={`absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-lg text-[10px] font-bold text-center shadow-lg z-20 whitespace-nowrap ${
                isLight ? 'bg-orange-100 text-orange-600 border border-orange-200' : 'bg-orange-900/80 text-orange-400 border border-orange-500/30 backdrop-blur-sm'
              }`}
            >
              Coming Soon
              {/* Little downward pointing triangle for callout effect */}
              <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-r border-b ${
                isLight ? 'bg-orange-100 border-orange-200' : 'bg-orange-900/80 border-orange-500/30'
              }`} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className={`w-full h-[1px] mb-1 ${isLight ? 'bg-[#E9E9E9]' : 'bg-white/10'}`}></div>

      {/* Market List */}
      <div ref={listRef} className="flex-1 overflow-y-auto py-0 scrollbar-none" style={{ scrollbarWidth: 'none' }}>
        {tokensToDisplay.map((m, idx) => {
          const isActive = activeMarket?.id === m.id;
          const isUnavailable = m.id?.toLowerCase() === 'mon' || m.id?.toLowerCase() === 'avax';
          const livePriceRaw = oraclePrices[m.id?.toLowerCase()];
          const hasPrice = livePriceRaw && livePriceRaw > 0;
          
          // Formatted price string
          const isMon = m.id?.toLowerCase() === 'mon';
          const isAvax = m.id?.toLowerCase() === 'avax';
          const maxDecimals = isMon ? 6 : isAvax ? 4 : 2;
          let priceStr = '0.00';
          if (hasPrice) {
            priceStr = livePriceRaw.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: maxDecimals });
          }

          // Calculate24h percentage change from Binance
          let changeStr = '+0.00%';
          let isUp = true;
          const assetKey = m.id?.toLowerCase();
          const change24 = changes24h[assetKey];

          if (change24 !== undefined && change24 !== null) {
            const changeVal = typeof change24 === 'object' ? change24.change : change24;
            isUp = changeVal >= 0;
            changeStr = (isUp ? '+' : '') + parseFloat(changeVal).toFixed(2) + '%';
          }

          const logo = LOGO_MAP[m.id?.toLowerCase()];

          return (
            <div key={m.id}>
              <button
                disabled={isUnavailable}
                onClick={() => {
                  if (isUnavailable) return;
                  const token = defaultTokens?.find(t => t.id === m.id) || m;
                  setActiveMarket?.(token);
                }}
                className={`w-full py-2.5 text-left transition-all flex items-center gap-3 ${
                  isUnavailable ? 'opacity-30 cursor-not-allowed' : isActive ? 'opacity-100' : 'opacity-60 hover:opacity-100'
                }`}
              >
                {logo ? (
                  <img
                    src={logo}
                    alt={m.symbol}
                    className={`${(m.id === 'sol' || m.symbol === 'SOL') ? 'w-5 h-5' : 'w-4 h-4'} object-contain shrink-0`}
                    style={{ filter: getLogoFilter(isLight) }}
                  />
                ) : (
                  <div className="w-4 h-4 rounded-full bg-[#1A6140] flex items-center justify-center shrink-0">
                    <span className="text-white text-[9px] font-black">{(m.symbol || 'E').slice(0, 1)}</span>
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`text-[13px] font-bold ${isLight ? 'text-[#111827]' : 'text-white/90'}`}>{m.symbol}</span>
                    {isUnavailable && (
                      <span className="text-[7px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 leading-none">COMING SOON</span>
                    )}
                  </div>
                  <div className="flex items-center justify-between">
                    {isUnavailable ? (
                      <span className={`text-[11px] font-medium italic ${isLight ? 'text-[#9CA3AF]' : 'text-white/30'}`}>Not yet available</span>
                    ) : (
                      <>
                        <span className={`text-[12px] font-medium ${isLight ? 'text-[#111827]' : 'text-white/80'}`}>${priceStr}</span>
                        <span className="text-[11px] font-bold" style={{ color: isUp ? '#1A6140' : '#E13E27' }}>{changeStr}</span>
                      </>
                    )}
                  </div>
                </div>
              </button>
              {idx < tokensToDisplay.length - 1 && (
                <div className={`w-full h-[1px] ${isLight ? 'bg-[#E9E9E9]' : 'bg-white/10'}`}></div>
              )}
            </div>
          );
        })}
      </div>

      {/* Selection Help Note */}
      <div className={`mt-auto pt-3 border-t text-[10px] italic leading-tight select-none ${isLight ? 'border-[#E9E9E9] text-[#6B7280]' : 'border-white/10 text-white/30'}`}>
        Click on any asset here to select for trading.
      </div>
    </div>
  );
}
