import React, { useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ExternalLink,
  ArrowUp,
  ArrowDown,
  Share2,
  ShieldCheck,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import { isTradeSettled } from '../utils/tradeStatus';

const LOGO_MAP = {
  eth: '/ethereum.png',
  btc: '/btc.png',
  sol: '/sol.png',
  mon: '/monad.png',
  avax: '/avax.png',
};

const FALLBACK_LOGOS = {
  eth: '/ethusdc.png',
  sol: '/solusdc.png',
  mon: '/monusdc.png',
  avax: '/avaxusdc.png',
};

const SYMBOL_COLORS = {
  ETH: '#627EEA',
  BTC: '#F7931A',
  SOL: '#9945FF',
  MON: '#00D4AA',
  AVAX: '#E84142',
};

function getSymbolColor(sym) {
  const key = (sym || '').toUpperCase().replace('USDT', '');
  return SYMBOL_COLORS[key] || '#6B7280';
}

function getLogoFilter(isLight) {
  if (isLight) return 'brightness(0)';
  return 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)';
}

function AssetLogo({ symbol, size = 28, isLight = false, className = '' }) {
  const cleanSym = (symbol || '').toUpperCase().replace('USDT', '').trim();
  const key = cleanSym.toLowerCase();
  const [imgSrc, setImgSrc] = useState(LOGO_MAP[key] || FALLBACK_LOGOS[key] || null);
  const [hasError, setHasError] = useState(false);
  const color = getSymbolColor(cleanSym);

  const handleError = () => {
    if (imgSrc === LOGO_MAP[key] && FALLBACK_LOGOS[key]) {
      setImgSrc(FALLBACK_LOGOS[key]);
    } else {
      setHasError(true);
    }
  };

  // Adjust relative size per asset
  // ETH has extra transparent padding so scale up slightly
  // BTC and MON reduced further (scaleFactor = 0.52)
  let scaleFactor = 1;
  if (key === 'eth') scaleFactor = 1.15;
  else if (key === 'btc' || key === 'mon') scaleFactor = 0.52;
  const effectiveSize = Math.round(size * scaleFactor);

  if (hasError || !imgSrc) {
    return (
      <div
        className={`flex items-center justify-center shrink-0 text-[#1A6140] font-black text-[11px] tracking-tight ${className}`}
        style={{ width: size, height: size }}
      >
        {cleanSym.slice(0, 3) || '???'}
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center shrink-0 bg-transparent ${className}`}
      style={{ width: size, height: size }}
    >
      <img
        src={imgSrc}
        alt={cleanSym}
        className="object-contain transition-all"
        style={{
          width: effectiveSize,
          height: effectiveSize,
          filter: getLogoFilter(isLight),
        }}
        onError={handleError}
      />
    </div>
  );
}

function formatTime(ms) {
  if (!ms) return '---';
  const d = new Date(ms);
  if (isNaN(d.getTime())) return String(ms);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

export default function TradeHistoryTable({
  tradeHistory = [],
  activeTrades = [],
  theme,
  onViewReceipt,
  onShare,
  isExpanded,
  onToggleExpand,
}) {
  const hasRealTrades = [...activeTrades, ...tradeHistory].length > 0;
  const [verifyId, setVerifyId] = useState('');
  const [verifyResult, setVerifyResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const [showVerifier, setShowVerifier] = useState(false);

  // Status priority map (higher value = more resolved/final)
  const statusRank = { PAID: 5, WON: 5, LOST: 5, PAYOUT_FAILED: 5, CANCELLED: 4, DISPUTE: 3, RESOLVING: 2, PENDING: 1, TIMEOUT: 0 };
  const getTradeKey = (t) => String(t.id || t.betId || t.tx || t.txHash || t.nonce || '');

  // Merge tradeHistory and activeTrades with highest status rank winning
  const mergedMap = new Map();
  [...tradeHistory, ...activeTrades].forEach((trade) => {
    const key = getTradeKey(trade) || JSON.stringify(trade);
    const existing = mergedMap.get(key);
    if (!existing) {
      mergedMap.set(key, trade);
    } else {
      const curRank = statusRank[String(trade.status || '').toUpperCase()] || 0;
      const exRank = statusRank[String(existing.status || '').toUpperCase()] || 0;
      if (curRank >= exRank) {
        mergedMap.set(key, { ...existing, ...trade });
      } else {
        mergedMap.set(key, { ...trade, ...existing });
      }
    }
  });

  const displayTrades = hasRealTrades
    ? Array.from(mergedMap.values()).sort((a, b) => (b.timestamp || b.startTime || 0) - (a.timestamp || a.startTime || 0))
    : [
        { id: 'mock-1', timestamp: Date.now() - 5000, symbol: 'ETH', direction: 'UP', amount: 10.0, payout: 16.39, status: 'WON' },
        { id: 'mock-2', timestamp: Date.now() - 20000, symbol: 'BTC', direction: 'DOWN', amount: 8.5, payout: 0, status: 'LOST' },
        { id: 'mock-3', timestamp: Date.now() - 35000, symbol: 'SOL', direction: 'UP', amount: 12.0, payout: 19.68, status: 'WON' },
        { id: 'mock-4', timestamp: Date.now() - 50000, symbol: 'ETH', direction: 'DOWN', amount: 6.0, payout: 0, status: 'LOST' },
        { id: 'mock-5', timestamp: Date.now() - 75000, symbol: 'AVAX', direction: 'UP', amount: 15.0, payout: 24.6, status: 'WON' },
      ];

  const scrollRef = useRef(null);
  const isLight = theme === 'light';

  const scroll = (dir) => {
    if (scrollRef.current) {
      scrollRef.current.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' });
    }
  };

  const handleVerify = async () => {
    const q = verifyId.trim();
    if (!q) return;
    setVerifying(true);
    setVerifyResult(null);

    // 1. Check local/display trades first (case-insensitive ID/tx/nonce match)
    const localMatch = displayTrades.find(t =>
      String(t.id || '').toLowerCase() === q.toLowerCase() ||
      String(t.tx || t.txHash || t.stakeTxHash || '').toLowerCase() === q.toLowerCase() ||
      String(t.nonce || '').toLowerCase() === q.toLowerCase()
    );

    if (localMatch) {
      setVerifyResult(localMatch);
      setVerifying(false);
      onShare?.(localMatch);
      return;
    }

    // 2. Query keeper / on-chain API if not in local memory
    try {
      const { KEEPER_URL_ARC } = await import('../constants');
      const res = await fetch(`${KEEPER_URL_ARC}/trade/${q}`);
      if (res.ok) {
        const data = await res.json();
        const tradeData = data.trade || data;
        setVerifyResult(tradeData);
        onShare?.(tradeData);
      } else {
        setVerifyResult({ error: 'Trade not found with this Trade ID' });
      }
    } catch {
      setVerifyResult({ error: 'Failed to verify trade ID' });
    }
    setVerifying(false);
  };

  // ─── EXPANDED VIEW: Seamless on platform background, asset logos before ticker, details spread evenly, share & explorer icons at end, divided with horizontal lines ───
  if (isExpanded) {
    return (
      <div className="w-full h-full flex flex-col font-['Comfortaa',cursive] bg-transparent text-left">
        {/* Top bar header */}
        <div className="flex items-center justify-between py-2 px-1 shrink-0 border-b border-black/[0.08] dark:border-white/[0.08]">
          <div className="flex items-center gap-3">
            <span className={`text-[12px] font-extrabold uppercase tracking-widest ${isLight ? 'text-[#111827]' : 'text-white'}`}>
              TRADE HISTORY
            </span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${isLight ? 'bg-black/5 text-gray-600' : 'bg-white/10 text-white/60'}`}>
              {displayTrades.length}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowVerifier(!showVerifier)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-transparent border-none outline-none transition-colors ${
                showVerifier
                  ? 'text-[#1A6140]'
                  : isLight
                  ? 'text-gray-500 hover:text-[#1A6140]'
                  : 'text-white/40 hover:text-[#1A6140]'
              }`}
            >
              <ShieldCheck size={13} />
              <span>Verify</span>
            </button>

            <button
              onClick={onToggleExpand}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-transparent border-none outline-none transition-colors ${
                isLight ? 'text-gray-500 hover:text-[#1A6140]' : 'text-white/40 hover:text-[#1A6140]'
              }`}
            >
              <span>Collapse</span>
              <ChevronDown size={13} />
            </button>
          </div>
        </div>

        {/* Collapsible minimal verifier bar (no heavy shaded card) */}
        {showVerifier && (
          <div className={`py-3 px-1 border-b ${isLight ? 'border-black/[0.08]' : 'border-white/[0.08]'} shrink-0`}>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={verifyId}
                onChange={(e) => setVerifyId(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                placeholder="Enter Trade ID / Tx Hash to verify & view card..."
                className={`flex-1 px-3 py-2 rounded-xl text-[11px] font-bold outline-none border transition-all ${
                  isLight
                    ? 'bg-transparent border-gray-300 text-[#111827] placeholder-gray-400 focus:border-[#1A6140]'
                    : 'bg-transparent border-white/15 text-white placeholder-white/30 focus:border-[#1A6140]'
                }`}
              />
              <button
                onClick={handleVerify}
                disabled={verifying || !verifyId.trim()}
                className={`px-4 py-2 rounded-xl text-[11px] font-bold text-white transition-all ${
                  verifying ? 'opacity-50' : 'hover:scale-105 active:scale-95'
                }`}
                style={{ backgroundColor: '#1A6140' }}
              >
                {verifying ? 'Verifying...' : 'Verify'}
              </button>
            </div>
            {verifyResult && (
              <div className={`mt-2 px-3 py-2.5 rounded-xl text-[11px] font-bold ${verifyResult.error ? 'bg-red-500/10 text-red-500 border border-red-500/20' : 'bg-[#1A6140]/10 text-[#1A6140] border border-[#1A6140]/20'}`}>
                {verifyResult.error ? (
                  <div className="flex items-center gap-1.5"><XCircle size={13} /> {verifyResult.error}</div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5"><CheckCircle size={13} /> Trade Verified On-Chain</div>
                      <div className="text-[10px] opacity-75">
                        {verifyResult.symbol} | {verifyResult.direction === 'UP' ? 'YES' : 'NO'} | ${Number(verifyResult.amount || 0).toFixed(2)} | {verifyResult.status}
                      </div>
                    </div>
                    <button
                      onClick={() => onShare?.(verifyResult)}
                      className="px-3 py-1.5 rounded-lg bg-[#1A6140] text-white text-[10px] font-bold hover:brightness-110 active:scale-95 transition-all shrink-0"
                    >
                      View Card
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Column Headers */}
        <div className={`flex items-center justify-between px-3 py-2.5 border-b text-[10px] font-bold uppercase tracking-wider shrink-0 select-none ${
          isLight ? 'text-gray-400 border-black/[0.08]' : 'text-white/30 border-white/[0.08]'
        }`}>
          <div className="w-[180px] shrink-0">Asset / Ticker</div>
          <div className="flex-1 grid grid-cols-3 text-center px-4">
            <div>Stake</div>
            <div>Outcome</div>
            <div>Time</div>
          </div>
          <div className="w-[76px] shrink-0 text-right pr-2">Actions</div>
        </div>

        {/* Trade rows list divided by horizontal lines */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {displayTrades.map((trade, idx) => {
            const isSettled = isTradeSettled(trade) || ['WON', 'LOST', 'PAID', 'RESOLVED', 'CANCELLED'].includes(String(trade.status || '').toUpperCase()) || typeof trade.won === 'boolean';
            const isWin = isSettled && (trade.won === true || ['WON', 'PAID'].includes(String(trade.status || '').toUpperCase()) || trade.result === 'WIN' || Number(trade.payout || 0) > 0);
            const isLost = isSettled && !isWin && trade.status !== 'CANCELLED';
            const isActive = !isSettled;
            const isUp = trade.direction === 'UP' || trade.direction === 'YES' || trade.direction === 1 || String(trade.direction) === '1';
            const sym = (trade.symbol || 'ETH').toUpperCase().replace('USDT', '');
            const txHash = trade.tx || trade.txHash || trade.stakeTxHash;
            const hasTx = txHash && String(txHash).startsWith('0x') && String(txHash).length > 10;

            return (
              <div
                key={trade.id || idx}
                onClick={() => onShare?.(trade)}
                className={`group flex items-center justify-between py-3 px-3 cursor-pointer transition-colors border-b ${
                  isLight
                    ? 'border-black/[0.08] hover:bg-black/[0.02]'
                    : 'border-white/[0.08] hover:bg-white/[0.03]'
                }`}
              >
                {/* 1. Asset Logo before Ticker + Direction badge */}
                <div className="flex items-center gap-3 w-[190px] shrink-0">
                  <AssetLogo symbol={sym} size={38} isLight={isLight} />
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[13px] font-black tracking-tight ${isLight ? 'text-[#111827]' : 'text-white'}`}>
                        {sym}
                      </span>
                      <span
                        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                          isUp ? 'bg-[#1A6140]/15 text-[#1A6140]' : 'bg-[#EF5350]/15 text-[#EF5350]'
                        }`}
                      >
                        {isUp ? <ArrowUp size={9} /> : <ArrowDown size={9} />}
                        {isUp ? 'YES' : 'NO'}
                      </span>
                    </div>
                    <span className={`text-[10px] font-bold ${isLight ? 'text-gray-400' : 'text-white/40'}`}>
                      15s Binary
                    </span>
                  </div>
                </div>

                {/* 2. Other details spread evenly towards the right */}
                <div className="flex-1 grid grid-cols-3 items-center text-center px-4">
                  {/* Stake */}
                  <div className="flex flex-col items-center">
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${isLight ? 'text-gray-400' : 'text-white/30'}`}>
                      Stake
                    </span>
                    <span className={`text-[13px] font-black tabular-nums ${isLight ? 'text-[#111827]' : 'text-white'}`}>
                      ${Number(trade.amount || 0).toFixed(2)}
                    </span>
                  </div>

                  {/* Outcome */}
                  <div className="flex flex-col items-center">
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${isLight ? 'text-gray-400' : 'text-white/30'}`}>
                      Outcome
                    </span>
                    {isActive ? (
                      <span className="text-[11px] font-black text-yellow-500 animate-pulse uppercase tracking-wide">
                        PENDING
                      </span>
                    ) : isWin ? (
                      <span className="text-[13px] font-black text-[#1A6140] tabular-nums">
                        +${Number(trade.payout || 0).toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-[13px] font-black text-[#EF5350] tabular-nums">
                        -${Number(trade.amount || 0).toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Time */}
                  <div className="flex flex-col items-center">
                    <span className={`text-[9px] font-bold uppercase tracking-wider ${isLight ? 'text-gray-400' : 'text-white/30'}`}>
                      Time
                    </span>
                    <span className={`text-[11px] font-bold tabular-nums ${isLight ? 'text-gray-600' : 'text-white/60'}`}>
                      {formatTime(trade.timestamp)}
                    </span>
                  </div>
                </div>

                {/* 3. Last things: Share icon & Explorer icon (no background on hover, only icon turns green) */}
                <div className="flex items-center gap-1 shrink-0 justify-end w-[76px]">
                  {isTradeSettled(trade) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onShare?.(trade);
                    }}
                    className={`p-1.5 bg-transparent border-none outline-none transition-colors ${
                      isLight
                        ? 'text-gray-400 hover:text-[#1A6140]'
                        : 'text-white/40 hover:text-[#1A6140]'
                    }`}
                    title="Share Trade Card"
                  >
                    <Share2 size={15} />
                  </button>
                  )}
                  <a
                    href={hasTx ? `https://testnet.arcscan.app/tx/${txHash}` : 'https://testnet.arcscan.app'}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className={`p-1.5 bg-transparent border-none outline-none transition-colors ${
                      isLight
                        ? 'text-gray-400 hover:text-[#1A6140]'
                        : 'text-white/40 hover:text-[#1A6140]'
                    }`}
                    title={hasTx ? 'View on ArcScan Explorer' : 'Open ArcScan Explorer'}
                  >
                    <ExternalLink size={15} />
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ─── COLLAPSED VIEW: Horizontal scroll strip ───
  return (
    <div className="w-full h-full font-['Comfortaa',cursive]">
      <div className="flex items-center justify-between mb-1 px-1">
        <div className={`text-[12px] font-bold uppercase tracking-wide ${isLight ? 'text-[#111827]' : 'text-white'}`}>
          TRADE HISTORY
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={onToggleExpand}
            className={`flex items-center gap-1 text-[10px] font-bold ${isLight ? 'text-gray-400 hover:text-gray-600' : 'text-white/30 hover:text-white/60'}`}
          >
            view all
            <ChevronUp size={12} />
          </button>
          <button onClick={() => scroll('left')} className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-500' : 'bg-white/10 hover:bg-white/20 text-white/50'}`}>
            <ChevronLeft size={14} />
          </button>
          <button onClick={() => scroll('right')} className={`w-6 h-6 rounded-full flex items-center justify-center transition-colors ${isLight ? 'bg-gray-100 hover:bg-gray-200 text-gray-500' : 'bg-white/10 hover:bg-white/20 text-white/50'}`}>
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        className="flex items-center gap-5 px-1 overflow-x-auto scrollbar-none whitespace-nowrap"
      >
        {displayTrades.map((trade, idx) => {
          const isSettled = isTradeSettled(trade) || ['WON', 'LOST', 'PAID', 'RESOLVED', 'CANCELLED'].includes(String(trade.status || '').toUpperCase()) || typeof trade.won === 'boolean';
          const isWin = isSettled && (trade.won === true || ['WON', 'PAID'].includes(String(trade.status || '').toUpperCase()) || trade.result === 'WIN' || Number(trade.payout || 0) > 0);
          const isLost = isSettled && !isWin && trade.status !== 'CANCELLED';
          const isActive = !isSettled;

          return (
            <div 
              key={trade.id || idx}
              onClick={() => onShare?.(trade)}
              className={`inline-flex items-center gap-4 cursor-pointer shrink-0 border-r ${isLight ? 'border-[#E9E9E9]' : 'border-white/10'} pr-6`}
            >
              <span className={`text-[36px] font-black tracking-tighter uppercase ${isLight ? 'text-[#111827]' : 'text-white'}`}>
                {String(trade.symbol || '').toUpperCase()}
              </span>
              <div className="flex flex-col gap-1 justify-center">
                <div className="flex items-center gap-2 min-h-5">
                  <span className="inline-flex items-center gap-1">
                    <span className={`text-[11px] font-bold leading-none ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Pos:</span>
                    <span className={`text-[12px] font-black ${trade.direction === 'UP' ? 'text-[#1A6140]' : 'text-[#EF5350]'}`}>
                      {trade.direction === 'UP' ? 'YES' : 'NO'}
                    </span>
                  </span>
                  <span className="text-white/20 text-[10px]">|</span>
                  <span className="inline-flex items-center gap-1">
                    <span className={`text-[11px] font-bold ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Stake:</span>
                    <span className={`text-[12px] font-bold ${isLight ? 'text-[#111827]' : 'text-white'}`}>
                      ${Number(trade.amount).toFixed(2)}
                    </span>
                  </span>
                  {isTradeSettled(trade) && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onShare?.(trade); }}
                    className={`inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-full ${isLight ? 'text-[#1A6140] hover:bg-[#1A6140]/10' : 'text-[#1A6140] hover:bg-[#1A6140]/10'}`}
                    title="Share Card"
                  >
                    <Share2 size={12} />
                  </button>
                  )}
                </div>
                <div className="flex items-center gap-2 min-h-5">
                  <span className="inline-flex items-center gap-1">
                    <span className={`text-[11px] font-bold leading-none ${isLight ? 'text-gray-500' : 'text-white/40'}`}>Out:</span>
                    {isActive ? (
                      <span className="text-[12px] font-black text-yellow-500 animate-pulse">PENDING</span>
                    ) : (
                      <span className={`text-[12px] font-black ${isWin ? 'text-[#1A6140]' : 'text-[#EF5350]'}`}>
                        {isWin ? `Won $${Number(trade.payout || 0).toFixed(2)}` : `Lost -$${Number(trade.amount || 0).toFixed(2)}`}
                      </span>
                    )}
                  </span>
                  <span className={`text-[11px] font-medium ${isLight ? 'text-gray-400' : 'text-white/30'}`}>
                    {formatTime(trade.timestamp)}
                  </span>
                  {(() => {
                    const txHash = trade.tx || trade.txHash || trade.stakeTxHash;
                    if (txHash && String(txHash).startsWith('0x') && String(txHash).length > 10) {
                      return (
                        <a
                          href={`https://testnet.arcscan.app/tx/${txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className={`inline-flex items-center justify-center w-5 h-5 shrink-0 rounded-full ${isLight ? 'text-[#1A6140] hover:bg-[#1A6140]/10' : 'text-[#1A6140] hover:bg-[#1A6140]/10'}`}
                          title="View on ArcScan"
                        >
                          <ExternalLink size={12} />
                        </a>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

