import React, { useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Menu,
  Bell,
  Settings,
  User,
  X,
  Download,
  Shield,
  Zap,
  Target,
  TrendingUp,
  BarChart2,
  Smile,
  Coins,
  RefreshCcw,
  DollarSign,
} from 'lucide-react';
import { useAccount } from 'wagmi';
import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth';

function useCountUp(target, duration = 1400) {
  const [value, setValue] = useState(0);

  React.useEffect(() => {
    if (target === 0 || target == null) {
      setValue(0);
      return;
    }

    let start = null;
    let rafId = null;

    const tick = (time) => {
      if (!start) start = time;
      const progress = Math.min((time - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(target * eased);
      if (progress < 1) rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [target, duration]);

  return value;
}

export function DashboardPage({
  onBack,
  sessionBalance = 0,
  evmBalance = 0,
  onDeposit,
  onWithdraw,
  userProfile,
  theme = 'dark',
  isSmallScreen = false,
  evmSessionWallet,
  isSignerInitializing = false,
  transactionHistory = [],
  onDocs,
  onCampaign,
  onAssistedTrading,
  onTransferHub,
  onOpenCircleWallet,
}) {
  const isLight = theme === 'light';
  const { address } = useAccount();
  const { wallets } = useWallets();
  const { createWallet } = useCreateWallet();
  const { user } = usePrivy();

  const [walletCardSide, setWalletCardSide] = useState('trading');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [promptConfig, setPromptConfig] = useState(null);
  const [promptValue, setPromptValue] = useState('');
  const touchStartXRef = useRef(null);

  const walletCardWidth = isSmallScreen ? 360 : 448;
  const walletCardHeight = isSmallScreen ? 220 : 260;

  const hasExternalWallet = (wallets || []).some((w) => w?.walletClientType && w.walletClientType !== 'privy') || !!address;

  const volume = useCountUp(124.32);
  const winRate = useCountUp(68.4);
  const sentiment = useCountUp(58);
  const avgStake = useCountUp(20.5);
  const pnl = useCountUp(146.75);

  const truncate = (str) => (str ? `${str.slice(0, 6)}...${str.slice(-4)}` : '');

  const renderWalletCard = (kind) => {
    const isTrading = kind === 'trading';
    const cardAddress = isTrading ? evmSessionWallet?.address : address;
    const cardBalance = isTrading ? Number(sessionBalance || 0) : Number(evmBalance || 0);

    return (
      <div
        className={`${isSmallScreen ? 'w-full max-w-[360px]' : 'w-[448px]'} ${isSmallScreen ? 'h-[220px]' : 'h-[260px]'} flex-none relative overflow-hidden group text-white`}
        style={{
          fontFamily: '"Comfortaa", cursive',
          background: 'linear-gradient(145deg, #1a6140 0%, #123f28 55%, #0b3220 100%)',
          border: '1.5px solid rgba(99,194,141,0.45)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 46px rgba(0,0,0,0.28)',
          borderRadius: '40px',
        }}
      >
        <img src="/worldmap.svg" alt="" aria-hidden="true" className="absolute inset-0 w-full h-full object-cover brightness-0 invert opacity-[0.14] pointer-events-none" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/15 pointer-events-none" />

        <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 448 260" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id={`aurora-stroke-${kind}`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(126,255,199,0)" />
              <stop offset="50%" stopColor="rgba(145,255,210,0.9)" />
              <stop offset="100%" stopColor="rgba(255,255,255,0.95)" />
            </linearGradient>
            <filter id={`aurora-glow-${kind}`} x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <path
            d="M 18 18 H 430 A 18 18 0 0 1 448 36 V 224 A 18 18 0 0 1 430 242 H 18 A 18 18 0 0 1 0 224 V 36 A 18 18 0 0 1 18 18 Z"
            stroke={`url(#aurora-stroke-${kind})`}
            strokeWidth="1.6"
            strokeDasharray="26 20"
            fill="none"
            opacity="0.95"
          />
          <circle cx="442" cy="30" r="6" fill="#d8fff0" filter={`url(#aurora-glow-${kind})`} opacity="0.9" />
        </svg>

        <div className="h-full flex flex-col justify-between relative z-20 py-4 px-6 md:px-7">
          <img src="/gowlogo.png" alt="15market" className="h-24 md:h-[120px] w-auto self-start -translate-y-[10%]" style={{ filter: 'brightness(0) invert(1)', opacity: 0.95 }} />

          <div className="px-1 min-w-0" onClick={() => { if (cardAddress) { navigator.clipboard.writeText(cardAddress); setToast('Address Copied!'); setTimeout(() => setToast(null), 2000); } }}>
            <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
              <p className="text-left text-lg md:text-xl font-black tracking-[0.22em] truncate leading-none">
                {cardAddress ? truncate(cardAddress).toUpperCase() : (isTrading && isSignerInitializing ? 'SYNCING...' : 'XXXX...XXXX')}
              </p>
              <Copy size={13} className="flex-none text-white/70" />
            </div>
            <p className="text-left text-[9px] md:text-[10px] italic font-black lowercase tracking-[0.25em] text-white/55 mt-1.5">
              {isTrading ? 'Trading Wallet' : 'Main Wallet'}
            </p>
          </div>

          <div className="flex items-end justify-between gap-4">
            <span className="text-2xl md:text-3xl font-black truncate" style={{ fontFamily: 'Sankyu, "sankyu", cursive' }}>{userProfile?.username || 'Trader'}</span>
            <div className="text-right leading-none shrink-0">
              <div className="text-[45px] md:text-[72px] font-black tracking-tighter tabular-nums leading-none" style={{ textShadow: '0 6px 24px rgba(0,0,0,0.40)' }}>
                ${parseFloat(cardBalance || 0).toFixed(2)}
                <span className="text-[11px] md:text-base ml-1.5 font-bold text-white/70">USDC</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const walletCard = (
    <div className={`relative ${isSmallScreen ? 'w-full max-w-[360px]' : 'w-[448px]'} ${isSmallScreen ? 'h-[220px]' : 'h-[260px]'}`}>
      <button
        onClick={() => setWalletCardSide(walletCardSide === 'trading' ? 'main' : 'trading')}
        title="Previous wallet card"
        className="absolute top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full flex items-center justify-center bg-[#0b3220]/85 border border-[#1A6140]/40 text-white/90 backdrop-blur-sm"
        style={{ left: '-46px', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}
      >
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={() => setWalletCardSide(walletCardSide === 'trading' ? 'main' : 'trading')}
        title="Next wallet card"
        className="absolute top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full flex items-center justify-center bg-[#0b3220]/85 border border-[#1A6140]/40 text-white/90 backdrop-blur-sm"
        style={{ right: '-46px', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}
      >
        <ChevronRight size={18} />
      </button>

      <div
        className={`${isSmallScreen ? 'w-full max-w-[360px]' : 'w-[448px]'} ${isSmallScreen ? 'h-[220px]' : 'h-[260px]'} rounded-[40px] relative overflow-hidden mx-auto`}
        style={{ boxShadow: '0 10px 28px rgba(0,0,0,0.50), 0 20px 44px rgba(0,0,0,0.45), 0 10px 30px rgba(20, 241, 149, 0.13)' }}
        onTouchStart={(e) => { touchStartXRef.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          const startX = touchStartXRef.current;
          touchStartXRef.current = null;
          if (startX === null) return;
          const dx = e.changedTouches[0].clientX - startX;
          if (dx < -60 && walletCardSide === 'trading') setWalletCardSide('main');
          else if (dx > 60 && walletCardSide === 'main') setWalletCardSide('trading');
        }}
      >
        <div
          className="flex h-full will-change-transform transition-transform duration-700"
          style={{ transform: walletCardSide === 'trading' ? 'translateX(0px)' : `translateX(-${walletCardWidth}px)`, transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.35, 1)' }}
        >
          {renderWalletCard('trading')}
          {renderWalletCard('main')}
        </div>
      </div>
    </div>
  );

  const walletActions = (
    <div className={`grid ${hasExternalWallet ? 'grid-cols-2' : 'grid-cols-1'} gap-3 md:gap-4 shrink-0`}>
      <button
        onClick={() => {
          setPromptValue('');
          setPromptConfig({
            title: 'Deposit to Trading Wallet',
            placeholder: 'USDC Amount',
            onConfirm: (val) => onDeposit?.(parseFloat(val))
          });
        }}
        className="flex items-center justify-center gap-2 bg-[#1A6140] text-white font-black py-3 md:py-5 rounded-[20px] text-[9px] md:text-[11px] uppercase tracking-widest hover:scale-[1.01] active:scale-[0.98] transition-transform"
        style={{ boxShadow: '0 10px 24px rgba(0,0,0,0.50), 0 12px 34px rgba(20, 241, 149, 0.14)' }}
      >
        <ArrowUp size={13} /> Deposit
      </button>
      {hasExternalWallet && (
        <button
          onClick={() => {
            setPromptValue('');
            setPromptConfig({
              title: 'Withdraw to Main Wallet',
              placeholder: 'Amount',
              onConfirm: (val) => onWithdraw?.(val)
            });
          }}
          className="flex items-center justify-center gap-2 border border-[#1A6140]/40 bg-[#1A6140]/10 text-[#1A6140] font-black py-3 md:py-5 rounded-[20px] text-[9px] md:text-[11px] uppercase tracking-widest hover:scale-[1.01] active:scale-[0.98] transition-transform"
          style={{ boxShadow: '0 10px 24px rgba(0,0,0,0.50), 0 12px 34px rgba(20, 241, 149, 0.14)' }}
        >
          <ArrowDown size={13} /> Withdraw
        </button>
      )}
    </div>
  );

  return (
    <div className={`h-screen w-full flex flex-col overflow-hidden relative ${isLight ? 'text-black bg-white' : 'text-white bg-black'}`} style={{ fontFamily: '"Comfortaa", cursive' }}>
      <style>{`
        @import url('https://fonts.cdnfonts.com/css/sankyu');
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div className="flex items-center justify-between px-4 md:px-10 pb-0 flex-none relative z-10 w-full" style={{ paddingTop: isSmallScreen ? 'calc(env(safe-area-inset-top) + 12px)' : '1.25rem' }}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5' : 'bg-white/5 border-white/5 hover:bg-white/10'} rounded-2xl border flex items-center justify-center`}>
            <ArrowLeft size={16} />
          </button>
          <h1 className={`text-xl font-bold uppercase tracking-widest ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>Dashboard</h1>
        </div>

        {isSmallScreen ? (
          <div className="relative">
            <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5' : 'bg-white/5 border-white/5 hover:bg-white/10'} rounded-2xl border flex items-center justify-center`}>
              <Menu size={16} className={isLight ? 'text-black/80' : 'text-white/80'} />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={onDocs} title="Docs" className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5' : 'bg-white/5 border-white/5 hover:bg-white/10'} rounded-2xl border flex items-center justify-center`}>
              <Bell size={16} className="text-[#1A6140]" />
            </button>
            <button onClick={onCampaign} title="Campaign" className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5' : 'bg-white/5 border-white/5 hover:bg-white/10'} rounded-2xl border flex items-center justify-center`}>
              <Target size={16} className="text-[#1A6140]" />
            </button>
            <button onClick={onAssistedTrading} title="Assisted Trading" className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5' : 'bg-white/5 border-white/5 hover:bg-white/10'} rounded-2xl border flex items-center justify-center`}>
              <Zap size={16} className="text-[#1A6140]" />
            </button>
            <button onClick={onTransferHub || (() => onOpenCircleWallet?.(null))} title="Transfer Hub" className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5' : 'bg-white/5 border-white/5 hover:bg-white/10'} rounded-2xl border flex items-center justify-center`}>
              <ArrowUp size={16} className={isLight ? 'text-black/80' : 'text-white/80'} />
            </button>
            <button onClick={() => {}} title="Settings" className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5' : 'bg-white/5 border-white/5 hover:bg-white/10'} rounded-2xl border flex items-center justify-center`}>
              <Settings size={16} className={isLight ? 'text-black/80' : 'text-white/80'} />
            </button>
          </div>
        )}
      </div>

      {isSmallScreen ? (
        <div className="flex flex-1 gap-3 px-4 py-2 min-h-0 relative z-10 flex-col overflow-y-auto no-scrollbar pb-6">
          <div className="flex-none flex flex-col gap-3">
            <div className="flex justify-center">{walletCard}</div>
            {walletCardSide === 'trading' && walletActions}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
              <div className="flex items-center gap-1.5"><BarChart2 size={12} className="text-[#1A6140]" /><span className="text-[8px] font-bold uppercase tracking-widest text-white/40">Volume</span></div>
              <div className="mt-2 text-sm font-black">${volume.toFixed(2)}</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
              <div className="flex items-center gap-1.5"><Smile size={12} className="text-[#1A6140]" /><span className="text-[8px] font-bold uppercase tracking-widest text-white/40">Sent.</span></div>
              <div className="mt-2 text-sm font-black">{sentiment.toFixed(0)}%</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
              <div className="flex items-center gap-1.5"><Zap size={12} className="text-[#1A6140]" /><span className="text-[8px] font-bold uppercase tracking-widest text-white/40">Win</span></div>
              <div className="mt-2 text-sm font-black">{winRate.toFixed(1)}%</div>
            </div>
            <div className="bg-white/5 border border-white/10 rounded-2xl p-3.5">
              <div className="flex items-center gap-1.5"><Coins size={12} className="text-[#1A6140]" /><span className="text-[8px] font-bold uppercase tracking-widest text-white/40">Stake</span></div>
              <div className="mt-2 text-sm font-black">${avgStake.toFixed(2)}</div>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2"><TrendingUp size={12} className="text-[#1A6140]" /><span className="text-[8px] font-bold uppercase tracking-widest text-white/40">P&amp;L</span></div>
              <span className="text-xl font-black text-[#1A6140]">+${pnl.toFixed(2)}</span>
            </div>
            <div className="h-20 w-full rounded-xl bg-gradient-to-r from-[#1A6140]/20 to-transparent" />
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            <div className="bg-white/5 border border-white/10 rounded-2xl p-4 flex flex-col flex-1 min-h-0">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2"><RefreshCcw size={12} className="text-[#1A6140]" /><span className="text-[8px] font-bold uppercase tracking-widest text-white/40">Transactions</span></div>
              </div>
              <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-3">
                {(transactionHistory || []).slice(0, 5).map((tx, i) => (
                  <div key={tx.id || i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${tx.type === 'DEPOSIT' ? 'bg-[#1A6140]/15 text-[#1A6140]' : 'bg-[#FF7F50]/15 text-[#FF7F50]'}`}>
                        {tx.type === 'DEPOSIT' ? <ArrowUp size={10} /> : <ArrowDown size={10} />}
                      </div>
                      <div>
                        <div className="text-[10px] font-bold">{tx.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}</div>
                        <div className="text-[7px] text-white/40">{new Date(tx.timestamp || Date.now()).toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="text-[10px] font-bold text-[#1A6140]">{tx.type === 'DEPOSIT' ? '+' : '-'}{parseFloat(tx.amount || 0).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 gap-10 px-10 py-5 min-h-0 relative z-10 max-w-[1600px] mx-auto w-full">
          <div className="w-[448px] flex-none flex flex-col justify-center min-h-0 gap-6">
            <div className="flex flex-col gap-4">{walletCard}{walletCardSide === 'trading' && walletActions}</div>
          </div>
          <div className="w-px mx-4 flex-none self-stretch relative">
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1A6140]/20 to-transparent" />
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-4 py-1">
            <div className="grid grid-cols-2 gap-4 flex-none">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4"><BarChart2 size={14} className="text-[#1A6140]" /><span className="text-[9px] font-bold uppercase tracking-widest text-white/40">24H Volume</span></div>
                <div className="text-3xl font-bold">${volume.toFixed(2)}</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4"><Smile size={14} className="text-[#1A6140]" /><span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Sentiment</span></div>
                <div className="text-3xl font-bold">{sentiment.toFixed(0)}%</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4"><Zap size={14} className="text-[#1A6140]" /><span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Win Rate</span></div>
                <div className="text-3xl font-bold">{winRate.toFixed(1)}%</div>
              </div>
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4"><Coins size={14} className="text-[#1A6140]" /><span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Avg Stake</span></div>
                <div className="text-3xl font-bold">${avgStake.toFixed(2)}</div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 pb-1">
              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col">
                <div className="flex items-center gap-2 mb-3"><TrendingUp size={14} className="text-[#1A6140]" /><span className="text-[9px] font-bold uppercase tracking-widest text-white/40">P&amp;L</span></div>
                <div className="text-3xl font-black text-[#1A6140]">+${pnl.toFixed(2)}</div>
              </div>

              <div className="bg-white/5 border border-white/10 rounded-2xl p-5 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-4"><div className="flex items-center gap-2"><RefreshCcw size={14} className="text-[#1A6140]" /><span className="text-[9px] font-bold uppercase tracking-widest text-white/40">Transactions</span></div></div>
                <div className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-4">
                  {(transactionHistory || []).slice(0, 5).map((tx, i) => (
                    <div key={tx.id || i} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type === 'DEPOSIT' ? 'bg-[#1A6140]/15 text-[#1A6140]' : 'bg-[#FF7F50]/15 text-[#FF7F50]'}`}>
                          {tx.type === 'DEPOSIT' ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                        </div>
                        <div>
                          <div className="text-[11px] font-bold">{tx.type === 'DEPOSIT' ? 'Deposit' : 'Withdrawal'}</div>
                          <div className="text-[8px] text-white/40">{new Date(tx.timestamp || Date.now()).toLocaleDateString()}</div>
                        </div>
                      </div>
                      <div className={`text-[11px] font-bold ${tx.type === 'DEPOSIT' ? 'text-[#1A6140]' : 'text-[#FF7F50]'}`}>{tx.type === 'DEPOSIT' ? '+' : '-'}{parseFloat(tx.amount || 0).toFixed(2)}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setIsMobileMenuOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 25, stiffness: 200 }} className={`fixed top-0 right-0 w-[65%] max-w-[300px] h-full z-[9999] shadow-2xl flex flex-col gap-3 p-6 pt-24 ${isLight ? 'bg-white border-l border-[#1A6140]/20' : 'bg-[#111111] border-l border-white/10'}`}>
              <button onClick={() => setIsMobileMenuOpen(false)} className={`absolute top-6 right-6 z-10 p-2 rounded-xl border ${isLight ? 'bg-white/50 border-[#1A6140]/20 text-[#0a261a]' : 'bg-white/5 border-white/10 text-white'}`}>
                <X size={16} />
              </button>

              <button onClick={() => { setIsMobileMenuOpen(false); onDocs?.(); }} className={`flex items-center gap-4 w-full p-4 rounded-2xl ${isLight ? 'bg-white shadow-sm' : 'bg-white/5'}`}>
                <Bell size={16} className="text-[#1A6140]" /> <span className="text-[10px] font-black uppercase tracking-widest">Docs</span>
              </button>
              <button onClick={() => { setIsMobileMenuOpen(false); onCampaign?.(); }} className={`flex items-center gap-4 w-full p-4 rounded-2xl ${isLight ? 'bg-white shadow-sm' : 'bg-white/5'}`}>
                <Target size={16} className="text-[#1A6140]" /> <span className="text-[10px] font-black uppercase tracking-widest">Campaign</span>
              </button>
              <button onClick={() => { setIsMobileMenuOpen(false); onAssistedTrading?.(); }} className={`flex items-center gap-4 w-full p-4 rounded-2xl ${isLight ? 'bg-white shadow-sm' : 'bg-white/5'}`}>
                <Zap size={16} className="text-[#1A6140]" /> <span className="text-[10px] font-black uppercase tracking-widest">Assisted Trading</span>
              </button>
              <button onClick={() => { setIsMobileMenuOpen(false); onTransferHub?.() || onOpenCircleWallet?.(null); }} className={`flex items-center gap-4 w-full p-4 rounded-2xl ${isLight ? 'bg-white shadow-sm' : 'bg-white/5'}`}>
                <ArrowUp size={16} className={isLight ? 'text-[#0a261a]/70' : 'text-white/70'} /> <span className="text-[10px] font-black uppercase tracking-widest">Transfer Hub</span>
              </button>
              <button onClick={() => { setIsMobileMenuOpen(false); }} className={`flex items-center gap-4 w-full p-4 rounded-2xl ${isLight ? 'bg-white shadow-sm' : 'bg-white/5'}`}>
                <Settings size={16} className={isLight ? 'text-[#0a261a]/70' : 'text-white/70'} /> <span className="text-[10px] font-black uppercase tracking-widest">Settings</span>
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[300]">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }} className="bg-[#133a2a] text-white px-6 py-3 rounded-2xl shadow-2xl text-xs font-black uppercase tracking-widest">
            {toast}
          </motion.div>
        </div>
      )}

      {promptConfig && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/30 backdrop-blur-sm">
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} className={`w-full max-w-md ${isLight ? 'bg-white border-[#e2ece5]' : 'bg-[#1a1a1a] border-white/10'} border shadow-2xl rounded-[32px] p-8`}>
            <div className="flex flex-col">
              <h3 className={`text-2xl font-black ${isLight ? 'text-[#133a2a]' : 'text-white'} mb-6 uppercase text-center`}>{promptConfig.title}</h3>
              <input type="text" autoFocus placeholder={promptConfig.placeholder} value={promptValue} onChange={(e) => setPromptValue(e.target.value)} className={`w-full ${isLight ? 'bg-[#f0f6f2] border-[#e2ece5] text-[#133a2a] placeholder:text-[#133a2a]/30' : 'bg-white/5 border-white/10 text-white placeholder:text-white/30'} border rounded-2xl py-4 px-4 text-base font-bold outline-none`} onKeyDown={(e) => { if (e.key === 'Enter') { promptConfig.onConfirm(promptValue); setPromptConfig(null); setPromptValue(''); } }} />
              <div className="grid grid-cols-2 gap-4 w-full mt-6">
                <button onClick={() => { setPromptConfig(null); setPromptValue(''); }} className={`py-4 ${isLight ? 'bg-[#eef5f1] text-[#133a2a]' : 'bg-white/10 text-white'} rounded-full text-xs font-black uppercase tracking-widest`}>
                  Cancel
                </button>
                <button onClick={() => { promptConfig.onConfirm(promptValue); setPromptConfig(null); setPromptValue(''); }} className="py-4 bg-[#1A6140] text-white rounded-full text-xs font-black uppercase tracking-widest">
                  Confirm
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
