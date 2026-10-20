import React, { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Search, TrendingUp, Activity, ChevronRight, ChevronUp, ChevronDown, CheckCircle, Copy, Wallet, Trophy, X, AlertCircle, BarChart, Download, Calendar, Shield, Check, Settings, Send } from 'lucide-react';
import { ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { socketService } from '../utils/socket';
import { KEEPER_URL_ARC } from '../constants';

export function CopyTradingPage({
    address,
    isLight,
    notify,
    onBack,
    profile,
    user,
    tradeHistory
}) {
    const [mode, setMode] = useState(null); // null = select, 'investor' or 'trader'
    const isDark = !isLight;
    const [providers, setProviders] = useState([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedProvider, setSelectedProvider] = useState(null);
    const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
    const [providerToCopy, setProviderToCopy] = useState(null);
    const [copyParams, setCopyParams] = useState({ mode: 'isolated', allocated: '', stakePerTrade: '' });
    const [isLoading, setIsLoading] = useState(true);
    const [isApplying, setIsApplying] = useState(false);
    const [appStep, setAppStep] = useState(0);
    const [appData, setAppData] = useState({ name: '', twitter: '', telegram: '', email: '', fee: '' });
    const [appSuccess, setAppSuccess] = useState(false);
    const [localPending, setLocalPending] = useState(false);
    const [copyWalletAddress, setCopyWalletAddress] = useState(profile?.copyTradingWallet?.address || '');
    const [copyWalletBalance, setCopyWalletBalance] = useState(parseFloat(profile?.copyTradingWallet?.balance || 0));
    const [otpCode, setOtpCode] = useState('');
    const [isSendingOtp, setIsSendingOtp] = useState(false);
    const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
    const [otpSent, setOtpSent] = useState(false);
    const [otpVerified, setOtpVerified] = useState(false);
    const [otpError, setOtpError] = useState('');
    const [emailSource, setEmailSource] = useState(''); // 'privy' or 'manual'

    const [copied, setCopied] = useState(false);

    // Local metrics (overrides profile prop for immediate updates)
    const [localAllocated, setLocalAllocated] = useState(null);

    // Copy result animation
    const [copyResult, setCopyResult] = useState(null); // { type: 'success'|'fail', message: string } | null

    // Portfolio / Withdrawal
    const [portfolioBalance, setPortfolioBalance] = useState(0);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [withdrawAmount, setWithdrawAmount] = useState('');
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [isGeneratingPortfolio, setIsGeneratingPortfolio] = useState(false);

    // Mobile activity bottom pane
    const [showMobileActivity, setShowMobileActivity] = useState(false);
    const [showTraderSettings, setShowTraderSettings] = useState(false);
    const walletCardRef = useRef(null);
    const [traderPaneTop, setTraderPaneTop] = useState(0);

    useLayoutEffect(() => {
        if (mode === 'trader' && walletCardRef.current) {
            const rect = walletCardRef.current.getBoundingClientRect();
            setTraderPaneTop(rect.bottom + 8);
        }
    }, [mode]);

    // Deposit / Withdraw for copy trading wallet
    const [showCopyDepositModal, setShowCopyDepositModal] = useState(false);
    const [showCopyWithdrawModal, setShowCopyWithdrawModal] = useState(false);
    const [copyTransferAmount, setCopyTransferAmount] = useState('');
    const [isCopyTransferring, setIsCopyTransferring] = useState(false);

    // Wallet state
    const [hasCopyWallet, setHasCopyWallet] = useState(!!profile?.copyTradingWallet);
    const [isGeneratingWallet, setIsGeneratingWallet] = useState(false);

    // Fetch copy trading wallet address and on-chain balance
    const fetchCopyWallet = useCallback(async () => {
        if (!address) return;
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/wallet/${address}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.wallet) {
                    setCopyWalletAddress(data.wallet.address);
                    setCopyWalletBalance(parseFloat(data.wallet.balance || 0));
                    setHasCopyWallet(true);
                }
            }
        } catch (e) {
            console.error('Failed to fetch copy wallet:', e);
        }
    }, [address]);

    // Provider dashboard data
    const [followers, setFollowers] = useState([]);
    const [providerPerformance, setProviderPerformance] = useState(null);
    const [providerReport, setProviderReport] = useState(null);
    const [reportPeriod, setReportPeriod] = useState('all');
    const [isLoadingFollowers, setIsLoadingFollowers] = useState(false);
    const [isLoadingPerformance, setIsLoadingPerformance] = useState(false);
    const [investorCopies, setInvestorCopies] = useState({ active: [], history: [] });
    const [isLoadingInvestorCopies, setIsLoadingInvestorCopies] = useState(false);

    // Provider list scroll refs
    const providerListRef = useRef(null);
    const scrollIntervalRef = useRef(null);
    const isProvider = profile?.isProvider;
    const isPending = profile?.providerApplication?.status === 'PENDING' || localPending;

    const formatCurrency = (value, decimals = 2) => {
        const n = Number(value || 0);
        return `$${n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
    };

    const formatNumber = (value, decimals = 0) => {
        const n = Number(value || 0);
        return n.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    };

    const handleCopy = useCallback(async (text) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch { }
    }, []);

    const handleGenerateWallet = async () => {
        setIsGeneratingWallet(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/wallet/${address}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.wallet) {
                    setCopyWalletAddress(data.wallet.address);
                    setCopyWalletBalance(parseFloat(data.wallet.balance || 0));
                    setHasCopyWallet(true);
                    notify("Copy Trading Wallet generated successfully!", "success");
                } else {
                    throw new Error('Wallet generation failed');
                }
            } else {
                throw new Error('Server error');
            }
        } catch (e) {
            notify(e.message || "Failed to generate wallet", "error");
        } finally {
            setIsGeneratingWallet(false);
        }
    };

    // Scroll provider list helpers
    const startScrolling = useCallback((direction, speed) => {
        stopScrolling();
        const el = providerListRef.current;
        if (!el) return;
        scrollIntervalRef.current = setInterval(() => {
            el.scrollTop += direction * speed;
        }, 16);
    }, []);

    const stopScrolling = useCallback(() => {
        if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = null;
        }
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopScrolling();
    }, [stopScrolling]);

    // Fetch Providers
    const fetchProviders = async () => {
        setIsLoading(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers`);
            if (res.ok) {
                const data = await res.json();
                setProviders(data.providers || []);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProviders();
    }, []);

    const handleApply = async () => {
        setIsApplying(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    primaryWallet: address,
                    name: appData.name,
                    twitter: appData.twitter,
                    telegram: appData.telegram,
                    email: appData.email,
                    copyFee: appData.fee,
                    onChainData: {
                        winRate: profile?.stats?.totalTrades > 0 ? ((profile.stats.totalWins / profile.stats.totalTrades) * 100).toFixed(1) + '%' : '0%',
                        volume: `$${(profile?.stats?.totalVolume || 0).toLocaleString()}`,
                        totalTrades: profile?.stats?.totalTrades || 0,
                        avgRoi: profile?.stats?.totalTrades > 0 ? `+${((profile.stats.totalWins / profile.stats.totalTrades) * 15).toFixed(1)}%` : '0%'
                    }
                })
            });
            if (res.ok) {
                setAppSuccess(true);
                setTimeout(() => {
                    setAppSuccess(false);
                    setLocalPending(true);
                }, 3000);
            } else {
                throw new Error("Application failed");
            }
        } catch (e) {
            notify(e.message, "error");
        } finally {
            setIsApplying(false);
        }
    };

    // Provider dashboard data fetching
    const fetchFollowers = useCallback(async () => {
        if (!address) return;
        setIsLoadingFollowers(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers/${address.toLowerCase()}/followers`);
            if (res.ok) {
                const data = await res.json();
                setFollowers(data.followers || []);
            }
        } catch (e) {
            console.error('Failed to fetch followers:', e);
        } finally {
            setIsLoadingFollowers(false);
        }
    }, [address]);

    const fetchPerformance = useCallback(async () => {
        if (!address) return;
        setIsLoadingPerformance(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers/${address.toLowerCase()}/performance`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) setProviderPerformance(data.performance);
            }
        } catch (e) {
            console.error('Failed to fetch performance:', e);
        } finally {
            setIsLoadingPerformance(false);
        }
    }, [address]);

    const fetchReport = useCallback(async (period) => {
        if (!address) return;
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers/${address.toLowerCase()}/reports?period=${period}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) setProviderReport(data.report);
            }
        } catch (e) {
            console.error('Failed to fetch report:', e);
        }
    }, [address]);

    const fetchInvestorCopies = useCallback(async () => {
        if (!address) return;
        setIsLoadingInvestorCopies(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/investors/${address.toLowerCase()}/copies`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setInvestorCopies({
                        active: data.active || [],
                        history: data.history || []
                    });
                }
            }
        } catch (e) {
            console.error('Failed to fetch investor copy activity:', e);
        } finally {
            setIsLoadingInvestorCopies(false);
        }
    }, [address]);

    // Portfolio / revenue state
    const [portfolioWallet, setPortfolioWallet] = useState(null); // { address, balance } or null
    const [pendingRevenue, setPendingRevenue] = useState(0);
    const [activationRevenue, setActivationRevenue] = useState(0);

    // Fetch portfolio balance for provider
    const fetchPortfolio = useCallback(async () => {
        if (!address || !isProvider) return;
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers/${address.toLowerCase()}/portfolio`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    setPortfolioWallet(data.portfolio.wallet);
                    setPortfolioBalance(data.portfolio.balance);
                    setPendingRevenue(data.portfolio.pendingRevenue);
                    setActivationRevenue(data.portfolio.activationRevenue);
                }
            }
        } catch (e) {
            console.error('Failed to fetch portfolio:', e);
        }
    }, [address, isProvider]);

    useEffect(() => {
        if (isProvider && hasCopyWallet) {
            fetchFollowers();
            fetchPerformance();
            fetchReport(reportPeriod);
            fetchPortfolio();
        }
    }, [isProvider, hasCopyWallet, fetchFollowers, fetchPerformance, fetchReport, reportPeriod, fetchPortfolio]);

    // Fetch copy wallet on mount and poll for balance updates
    useEffect(() => {
        fetchCopyWallet();
    }, [fetchCopyWallet]);

    useEffect(() => {
        if (!hasCopyWallet) return;
        const interval = setInterval(fetchCopyWallet, 10000);
        return () => clearInterval(interval);
    }, [hasCopyWallet, fetchCopyWallet]);

    useEffect(() => {
        if (mode === 'investor' && hasCopyWallet) {
            fetchInvestorCopies();
        }
    }, [mode, hasCopyWallet, fetchInvestorCopies]);

    // Poll for live trade activity updates
    useEffect(() => {
        if (mode !== 'investor' || !hasCopyWallet) return;
        const interval = setInterval(fetchInvestorCopies, 15000);
        return () => clearInterval(interval);
    }, [mode, hasCopyWallet, fetchInvestorCopies]);

    // Socket listener for real-time trade updates
    useEffect(() => {
        if (mode !== 'investor' || !hasCopyWallet) return;
        const handleTradeUpdate = () => {
            fetchInvestorCopies();
            fetchCopyWallet();
        };
        const handleBalanceUpdate = (data) => {
            if (data.reason === 'COPY_WIN' || data.reason === 'COPY_LOSS') {
                setCopyWalletBalance(parseFloat(data.balance || 0));
                fetchInvestorCopies();
            }
        };
        socketService.on('copy_trade_update', handleTradeUpdate);
        socketService.on('balance_update', handleBalanceUpdate);
        return () => {
            socketService.off('copy_trade_update', handleTradeUpdate);
            socketService.off('balance_update', handleBalanceUpdate);
        };
    }, [mode, hasCopyWallet, fetchInvestorCopies, fetchCopyWallet]);

    // Socket listener for new follower + trade settled (provider side) — updates portfolio, performance, followers in real-time
    useEffect(() => {
        if (mode !== 'trader' || !isProvider) return;
        const handleNewFollower = () => {
            fetchFollowers();
            fetchPortfolio();
            fetchPerformance();
        };
        const handleTradeSettled = () => {
            fetchPerformance();
            fetchPortfolio();
        };
        const handlePayoutCompleted = () => {
            fetchPerformance();
            fetchPortfolio();
        };
        const handleBalanceUpdate = (data) => {
            if (data.reason === 'WIN_PAYOUT_SETTLED' || data.reason === 'WIN' || data.reason === 'LOSS') {
                fetchPerformance();
                fetchPortfolio();
            }
        };
        socketService.on('new_follower', handleNewFollower);
        socketService.on('trade_settled', handleTradeSettled);
        socketService.on('payout_completed', handlePayoutCompleted);
        socketService.on('balance_update', handleBalanceUpdate);
        return () => {
            socketService.off('new_follower', handleNewFollower);
            socketService.off('trade_settled', handleTradeSettled);
            socketService.off('payout_completed', handlePayoutCompleted);
            socketService.off('balance_update', handleBalanceUpdate);
        };
    }, [mode, isProvider, fetchFollowers, fetchPortfolio, fetchPerformance]);

    // Socket listener for copy activated (investor side) — updates wallet balance instantly
    useEffect(() => {
        if (mode !== 'investor') return;
        const handleCopyActivated = (data) => {
            if (data.newBalance !== undefined) {
                setCopyWalletBalance(parseFloat(data.newBalance));
            }
            fetchInvestorCopies();
            fetchCopyWallet();
        };
        socketService.on('copy_activated', handleCopyActivated);
        return () => socketService.off('copy_activated', handleCopyActivated);
    }, [mode, fetchInvestorCopies, fetchCopyWallet]);

    // Auto-fetch email from Privy user
    useEffect(() => {
        if (user) {
            const privyEmail = user?.email?.address || user?.google?.email;
            if (privyEmail) {
                setAppData(prev => ({ ...prev, email: privyEmail }));
                setEmailSource('privy');
                setOtpVerified(true);
            } else {
                setEmailSource('manual');
                setOtpVerified(false);
            }
        }
    }, [user]);

    const handleSendOtp = async () => {
        if (!appData.email || !/\S+@\S+\.\S+/.test(appData.email)) {
            setOtpError('Please enter a valid email address');
            return;
        }
        setIsSendingOtp(true);
        setOtpError('');
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/send-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, email: appData.email })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setOtpSent(true);
                setOtpCode('');
                notify('Verification code sent to your email', 'success');
            } else {
                setOtpError(data.error || 'Failed to send OTP');
            }
        } catch (e) {
            setOtpError('Network error. Please try again.');
        } finally {
            setIsSendingOtp(false);
        }
    };

    const handleVerifyOtp = async () => {
        if (!otpCode || otpCode.length < 6) {
            setOtpError('Please enter the 6-digit code');
            return;
        }
        setIsVerifyingOtp(true);
        setOtpError('');
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, code: otpCode })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setOtpVerified(true);
                notify('Email verified successfully!', 'success');
            } else {
                setOtpError(data.error || 'Invalid verification code');
            }
        } catch (e) {
            setOtpError('Network error. Please try again.');
        } finally {
            setIsVerifyingOtp(false);
        }
    };

    const filteredProviders = providers.filter(p =>
        p.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.address.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // User's copy trading metrics (from profile or defaults)
    const userMetrics = {
        balance: copyWalletBalance,
        allocated: localAllocated !== null ? localAllocated : (profile?.copyTradingAllocated || '0.00'),
        pnl: profile?.copyTradingPnl || '+0.00',
        pnlPercent: profile?.copyTradingPnlPercent || '0.0',
        activeCopies: investorCopies.active.length || profile?.activeCopies?.length || profile?.activeCopies || 0,
        totalCopied: investorCopies.history.length + investorCopies.active.length || profile?.totalCopied || 0,
    };

    const providerPortfolio = useMemo(() => {
        const isolatedFollowers = followers.filter(f => f.mode === 'isolated');
        const crossFollowers = followers.filter(f => f.mode === 'cross');
        const isolatedAllocated = isolatedFollowers.reduce((sum, f) => sum + Number(f.allocated || 0), 0);
        const crossStake = crossFollowers.reduce((sum, f) => sum + Number(f.stakePerTrade || 0), 0);
        const totalStakePerTrade = followers.reduce((sum, f) => sum + Number(f.stakePerTrade || 0), 0);
        const totalPnl = followers.reduce((sum, f) => sum + Number(f.pnl || 0), 0);
        return {
            isolatedFollowers,
            crossFollowers,
            isolatedAllocated,
            crossStake,
            totalStakePerTrade,
            totalPnl,
            modeData: [
                { name: 'Isolated', value: isolatedFollowers.length },
                { name: 'Cross', value: crossFollowers.length }
            ].filter(item => item.value > 0),
            allocationData: [
                { name: 'Allocated', value: isolatedAllocated },
                { name: 'Per-trade', value: totalStakePerTrade }
            ].filter(item => item.value > 0)
        };
    }, [followers]);

    const mobilePane = (isInvestor) => {
        const togglePane = () => setShowMobileActivity(!showMobileActivity);
        const label = isInvestor ? 'TRADE LOGS' : 'ACTIVITIES';
        const count = isInvestor
            ? [...(investorCopies?.active || []), ...(investorCopies?.history || [])].length
            : tradeHistory?.length || 0;
        const Icon = isInvestor ? BarChart : Activity;

        const content = isInvestor ? (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-12 flex flex-col gap-2">
                {[...(investorCopies?.active || []), ...(investorCopies?.history || [])].length > 0 ? (
                    [...investorCopies.active, ...investorCopies.history].map((trade, i) => (
                        <div key={trade.id || i} className={`p-3 rounded-2xl border transition-all active:scale-[0.98] ${isLight ? 'bg-white/40 border-[#1A6140]/20 shadow-sm' : 'bg-white/5 border-white/5'}`}>
                            <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${trade.result === 'PENDING' ? 'bg-[#1A6140] shadow-[0_0_6px_rgba(26, 97, 64,0.7)]' : trade.result === 'WON' ? 'bg-[#1A6140]' : 'bg-red-400'}`} />
                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>{trade.asset || '---'}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className={`text-[8px] font-bold ${trade.direction === 'UP' ? 'text-[#1A6140]' : 'text-red-400'}`}>
                                        {trade.direction || '---'}
                                    </span>
                                    <span className={`text-[8px] font-bold ${trade.result === 'WON' ? 'text-[#1A6140]' : trade.result === 'LOST' ? 'text-red-400' : 'text-amber-400'}`}>
                                        {trade.result === 'PENDING' ? 'Active' : trade.result || '---'}
                                    </span>
                                </div>
                            </div>
                            <div className={`text-[9px] font-medium ${isLight ? 'text-[#0a261a]/60' : 'text-white/40'}`}>
                                {trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                            </div>
                        </div>
                    ))
                ) : (
                    <div className={`h-full flex flex-col items-center justify-center opacity-20 text-center p-8 ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>
                        <BarChart size={48} className="mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest">No trade logs yet</p>
                    </div>
                )}
            </div>
        ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-12 flex flex-col gap-2">
                {tradeHistory && tradeHistory.length > 0 ? (
                    tradeHistory.slice(0, 20).map((trade) => {
                        const isWin = trade.status === 'WON' || trade.status === 'PAID';
                        const isLoss = trade.status === 'LOST';
                        return (
                            <div key={trade.id} className={`p-3 rounded-2xl border transition-all active:scale-[0.98] ${isLight ? 'bg-white/40 border-[#1A6140]/20 shadow-sm' : 'bg-white/5 border-white/5'}`}>
                                <div className="flex items-center justify-between mb-1">
                                    <div className="flex items-center gap-2">
                                        <div className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${trade.direction === 'UP' ? 'bg-[#1A6140]/20 text-[#1A6140]' : 'bg-[#FF7F50]/20 text-[#FF7F50]'}`}>
                                            {trade.direction === 'UP' ? 'LONG' : 'SHORT'}
                                        </div>
                                        <span className={`text-[10px] font-bold uppercase tracking-widest ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>{trade.symbol?.toUpperCase() || 'BTC'}</span>
                                    </div>
                                    <span className={`text-[10px] font-black uppercase ${isWin ? 'text-[#1A6140]' : isLoss ? 'text-[#FF7F50]' : (isLight ? 'text-[#0a261a]/40' : 'text-white/40')}`}>
                                        {isWin ? `+$${Number(trade.payout || 0).toFixed(2)}` : isLoss ? `-$${Number(trade.amount || 0).toFixed(2)}` : trade.status}
                                    </span>
                                </div>
                                <div className={`text-[9px] font-medium ${isLight ? 'text-[#0a261a]/60' : 'text-white/40'}`}>
                                    ${Number(trade.entryPrice).toFixed(2)} • {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className={`h-full flex flex-col items-center justify-center opacity-20 text-center p-8 ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>
                        <Activity size={48} className="mb-4" />
                        <p className="text-[10px] font-black uppercase tracking-widest">No activity yet</p>
                    </div>
                )}
            </div>
        );

        return (
            <motion.div
                initial={false}
                animate={{ y: showMobileActivity ? 0 : 'calc(100% - 48px)' }}
                transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className="absolute inset-x-0 bottom-0 z-[110] flex flex-col pointer-events-none xl:hidden"
                style={isInvestor ? { height: '51.1vh' } : { top: Math.max(traderPaneTop, 300) || 300, bottom: 0 }}
            >
                <div className={`w-full h-full pointer-events-auto backdrop-blur-xl border-t rounded-t-[40px] flex flex-col overflow-hidden ${isDark ? 'bg-[#0D2B1D]/80 shadow-[0_-20px_60px_rgba(0,0,0,0.5)] border-white/10' : 'bg-[#CFDCD5]/80 shadow-2xl border-t-[2px] border-[#1A6140]'}`}>
                    {/* Toggle Handle */}
                    <div
                        onClick={togglePane}
                        className={`w-full h-12 flex items-center justify-center cursor-pointer transition-all duration-300 relative shrink-0 ${isDark ? 'bg-white/5 border-b border-white/5' : 'bg-[#1A6140] border-b border-[#1A6140]/20'}`}
                    >
                        {isDark && <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#1A6140] to-transparent opacity-90" />}
                        <div className="flex items-center justify-center gap-3 w-full">
                            <Icon size={14} className={`${isDark ? 'text-white' : 'text-white'}`} style={isDark ? { filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.8))' } : {}} />
                            <span className={`text-[11px] font-bold uppercase tracking-[0.25em] ${isDark ? 'text-white' : 'text-white'}`} style={{ fontFamily: '"Comfortaa", cursive' }}>
                                {label} ({count})
                            </span>
                            {showMobileActivity ? <ChevronDown size={12} className={`${isDark ? 'text-white/80' : 'text-white/80'}`} /> : <ChevronUp size={12} className={`${isDark ? 'text-white/80' : 'text-white/80'}`} />}
                        </div>
                    </div>
                    {content}
                </div>
            </motion.div>
        );
    };

    const exportTradeHistory = () => {
        const winCount = tradeHistory?.filter(t => t.status === 'WON' || t.status === 'PAID').length || 0;
        const lossCount = tradeHistory?.filter(t => t.status === 'LOST').length || 0;
        const totalPnl = tradeHistory?.reduce((sum, t) => {
            if (t.status === 'WON' || t.status === 'PAID') return sum + Number(t.payout || 0);
            if (t.status === 'LOST') return sum - Number(t.amount || 0);
            return sum;
        }, 0) || 0;

        const rows = (tradeHistory || []).map(t => `
            <tr>
                <td style="padding:8px 12px;border-bottom:1px solid #1a3a2a;text-align:left;">
                    <span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;letter-spacing:0.1em;${t.direction === 'UP' ? 'background:#1A614033;color:#1A6140' : 'background:#FF7F5033;color:#FF7F50'}">${t.direction === 'UP' ? 'LONG' : 'SHORT'}</span>
                </td>
                <td style="padding:8px 12px;border-bottom:1px solid #1a3a2a;text-align:left;font-size:12px;font-weight:600">${t.symbol?.toUpperCase() || 'BTC'}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1a3a2a;text-align:right;font-size:12px;font-weight:600">${Number(t.amount || 0).toFixed(2)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1a3a2a;text-align:right;font-size:12px;font-weight:600">$${Number(t.entryPrice || 0).toFixed(2)}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1a3a2a;text-align:right;font-size:12px;font-weight:700;${(t.status === 'WON' || t.status === 'PAID') ? 'color:#1A6140' : t.status === 'LOST' ? 'color:#FF7F50' : ''}">${(t.status === 'WON' || t.status === 'PAID') ? '+' : t.status === 'LOST' ? '-' : ''}${(t.status === 'WON' || t.status === 'PAID') ? Number(t.payout || 0).toFixed(2) : t.status === 'LOST' ? Number(t.amount || 0).toFixed(2) : t.status}</td>
                <td style="padding:8px 12px;border-bottom:1px solid #1a3a2a;text-align:right;font-size:11px;color:#888">${t.timestamp ? new Date(t.timestamp).toLocaleString() : ''}</td>
            </tr>
        `).join('');

        const html = `<!DOCTYPE html>
<html>
<head><title>15market Trade History</title></head>
<body style="margin:0;padding:40px;font-family:system-ui,-apple-system,sans-serif;background:#0a1a12;color:#e0e0e0;">
    <div style="max-width:900px;margin:0 auto;">
        <div style="text-align:center;margin-bottom:40px;padding-bottom:30px;border-bottom:2px solid #1A6140;">
            <h1 style="font-size:28px;font-weight:900;margin:0;color:#fff;letter-spacing:0.05em;">15MARKET</h1>
            <p style="font-size:12px;color:#1A6140;font-weight:700;letter-spacing:0.2em;margin:6px 0 0;">TRADE HISTORY REPORT</p>
        </div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:32px;">
            <div style="background:#0d2b1d;border-radius:12px;padding:16px;text-align:center;border:1px solid #1a3a2a;">
                <div style="font-size:10px;color:#888;font-weight:700;letter-spacing:0.1em;">TOTAL TRADES</div>
                <div style="font-size:24px;font-weight:900;color:#fff;margin-top:6px;">${tradeHistory?.length || 0}</div>
            </div>
            <div style="background:#0d2b1d;border-radius:12px;padding:16px;text-align:center;border:1px solid #1a3a2a;">
                <div style="font-size:10px;color:#888;font-weight:700;letter-spacing:0.1em;">WINS</div>
                <div style="font-size:24px;font-weight:900;color:#1A6140;margin-top:6px;">${winCount}</div>
            </div>
            <div style="background:#0d2b1d;border-radius:12px;padding:16px;text-align:center;border:1px solid #1a3a2a;">
                <div style="font-size:10px;color:#888;font-weight:700;letter-spacing:0.1em;">LOSSES</div>
                <div style="font-size:24px;font-weight:900;color:#FF7F50;margin-top:6px;">${lossCount}</div>
            </div>
            <div style="background:#0d2b1d;border-radius:12px;padding:16px;text-align:center;border:1px solid #1a3a2a;">
                <div style="font-size:10px;color:#888;font-weight:700;letter-spacing:0.1em;">TOTAL P&L</div>
                <div style="font-size:24px;font-weight:900;color:${totalPnl >= 0 ? '#1A6140' : '#FF7F50'};margin-top:6px;">${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)}</div>
            </div>
        </div>
        <table style="width:100%;border-collapse:collapse;background:#0d2b1d;border-radius:12px;overflow:hidden;border:1px solid #1a3a2a;">
            <thead>
                <tr style="background:#0a1a12;">
                    <th style="padding:12px;text-align:left;font-size:10px;font-weight:700;color:#888;letter-spacing:0.15em;border-bottom:2px solid #1A6140;">DIRECTION</th>
                    <th style="padding:12px;text-align:left;font-size:10px;font-weight:700;color:#888;letter-spacing:0.15em;border-bottom:2px solid #1A6140;">SYMBOL</th>
                    <th style="padding:12px;text-align:right;font-size:10px;font-weight:700;color:#888;letter-spacing:0.15em;border-bottom:2px solid #1A6140;">AMOUNT</th>
                    <th style="padding:12px;text-align:right;font-size:10px;font-weight:700;color:#888;letter-spacing:0.15em;border-bottom:2px solid #1A6140;">ENTRY</th>
                    <th style="padding:12px;text-align:right;font-size:10px;font-weight:700;color:#888;letter-spacing:0.15em;border-bottom:2px solid #1A6140;">P&L</th>
                    <th style="padding:12px;text-align:right;font-size:10px;font-weight:700;color:#888;letter-spacing:0.15em;border-bottom:2px solid #1A6140;">DATE</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
        <div style="text-align:center;margin-top:32px;font-size:10px;color:#444;letter-spacing:0.1em;">
            15market &bull; Generated ${new Date().toLocaleDateString()}
        </div>
    </div>
</body>
</html>`;

        const win = window.open('', '_blank');
        if (win) {
            win.document.write(html);
            win.document.close();
            win.focus();
            setTimeout(() => win.print(), 500);
        }
    };

    return (<>
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`absolute inset-0 z-[100] ${isLight ? 'bg-[#CFDCD5]' : 'bg-[#050505]'} overflow-hidden flex flex-col font-sans transition-all duration-700`}
            style={{ fontFamily: '"Comfortaa", cursive' }}
        >
            {/* Texture & Ambient Glows */}
            <div className="fixed inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
            <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] ${isLight ? 'bg-[#1A6140]/5' : 'bg-[#1A6140]/10'} blur-[120px] rounded-full`} />
                <div className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] ${isLight ? 'bg-[#1A6140]/5' : 'bg-[#1A6140]/10'} blur-[120px] rounded-full`} />
            </div>

            {/* Header */}
            <div className="w-full shrink-0 relative z-50 safe-top">
                <div className="w-full px-3 md:px-6 h-12 md:h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => {
                                if (mode && selectedProvider) {
                                    setSelectedProvider(null);
                                } else if (mode) {
                                    setMode(null);
                                } else {
                                    onBack();
                                }
                            }}
                            className={`p-2 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/80' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all active:scale-95`}
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <h2 className={`text-base font-black uppercase tracking-tighter ${isLight ? 'text-black/80' : 'text-white'} leading-none`}>
                            {mode === 'trader' ? 'Provider Dashboard' : 'Copy Trading'}
                        </h2>
                    </div>
                    {mode === 'trader' && (
                        <button
                            onClick={() => setShowTraderSettings(true)}
                            className={`p-2 rounded-full transition-all active:scale-90 ${isLight ? 'hover:bg-black/5 text-black/40' : 'hover:bg-white/5 text-white/40'}`}
                        >
                            <Settings size={16} />
                        </button>
                    )}
                </div>
                    {mode === 'trader' && (
                        <div className="w-full px-3 md:px-6 pb-2 flex justify-center lg:justify-start">
                            <span className={`text-2xl md:text-4xl font-normal leading-snug tracking-normal inline-block pb-2 pt-1 overflow-visible ${isLight ? 'bg-gradient-to-b from-[#1A6140] to-black bg-clip-text text-transparent animate-gradient' : 'text-white'}`} style={{ fontFamily: '"BetterBrush", cursive' }}>
                                {profile?.providerApplication?.contactInfo?.name || address?.substring(0, 6)}
                            </span>
                        </div>
                    )}
            </div>

            {/* Mode Selection Screen */}
            {!mode && (
                <div className="flex-1 flex flex-col md:flex-row items-center justify-center gap-4 md:gap-12 max-w-2xl mx-auto w-full relative z-10 px-4">
                    <motion.div 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setMode('investor')}
                        className="flex-1 w-full flex flex-col items-center justify-center cursor-pointer group"
                    >
                        <div className="text-center">
                            <h2 className={`text-xl md:text-2xl font-black uppercase tracking-widest mb-2 group-hover:text-[#1A6140] transition-colors ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>Investor</h2>
                            <p className={`text-[10px] md:text-xs font-bold leading-relaxed max-w-[200px] mx-auto ${isLight ? 'text-black/50' : 'text-white/50'}`}>Browse top traders and automatically mirror their positions in real-time.</p>
                        </div>
                    </motion.div>

                    <div className="w-full h-px md:w-px md:h-24 bg-gradient-to-r md:bg-gradient-to-b from-transparent via-[#1A6140] to-transparent" />

                    <motion.div 
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setMode('trader')}
                        className="flex-1 w-full flex flex-col items-center justify-center cursor-pointer group"
                    >
                        <div className="text-center">
                            <h2 className={`text-xl md:text-2xl font-black uppercase tracking-widest mb-2 group-hover:text-[#1A6140] transition-colors ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>Trader</h2>
                            <p className={`text-[10px] md:text-xs font-bold leading-relaxed max-w-[200px] mx-auto ${isLight ? 'text-black/50' : 'text-white/50'}`}>Apply to become a verified copy trading provider and earn from your strategies.</p>
                        </div>
                    </motion.div>
                </div>
            )}

            {mode === 'trader' && isProvider && (
                <div className="w-full shrink-0 px-3 md:px-6 py-2 md:py-3 flex justify-center relative z-10">
                    <div className="flex items-center gap-3 md:gap-6">
                        {[
                            { icon: Activity, label: 'Trades', value: providerPerformance?.totalTrades ?? profile?.stats?.totalTrades ?? 0 },
                            { icon: TrendingUp, label: 'Win Rate', value: `${providerPerformance?.winRate ?? (profile?.stats?.totalTrades > 0 ? ((profile.stats.totalWins / profile.stats.totalTrades) * 100).toFixed(1) : '0.0')}%`, color: 'text-[#1A6140]' },
                            { icon: Trophy, label: 'Revenue', value: `$${(providerPerformance?.revenue ?? profile?.providerStats?.profitGenerated ?? 0).toLocaleString()}`, color: 'text-amber-500' },
                            { icon: BarChart, label: 'Volume', value: `$${(providerPerformance?.totalVolume ?? profile?.stats?.totalVolume ?? 0).toLocaleString()}`, color: 'text-blue-500' }
                        ].map((item, idx) => (
                            <div key={idx} className={`flex flex-col items-center px-2 md:px-4 py-1 border-r last:border-r-0 ${isLight ? 'border-black/[0.12]' : 'border-white/[0.12]'}`}>
                                <span className={`text-[7px] font-black uppercase tracking-widest ${isLight ? 'text-black/60' : 'text-white/40'}`}>{item.label}</span>
                                <span className={`text-xs md:text-sm font-black mt-0.5 ${item.color || (isLight ? 'text-black' : 'text-white')}`}>{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Main Content Area */}
            {mode && (
            <div className="flex-1 w-full px-3 md:px-6 flex flex-col overflow-y-auto lg:overflow-hidden relative z-10 no-scrollbar">
                <div className="flex flex-col lg:flex-row items-start justify-center gap-4 lg:gap-8 py-2 md:py-4">
                {mode === 'investor' ? (
                    !hasCopyWallet ? (
                        <div className="w-full max-w-md mx-auto flex flex-col items-center justify-center text-center">
                            <h2 className="text-xl font-black mb-3">Activate Investor Account</h2>
                            <p className="text-xs font-bold opacity-60 leading-relaxed mb-6">
                                To start copying top traders, you need to generate a dedicated Copy Trading Wallet. 
                                This wallet will be added to your unified Transfer Hub and used to separate your copy trading funds from your main balance.
                            </p>
                            <button 
                                onClick={handleGenerateWallet}
                                disabled={isGeneratingWallet}
                                className="w-auto px-8 py-4 rounded-[20px] bg-[#1A6140] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {isGeneratingWallet ? 'Activating...' : 'Activate'}
                            </button>
                        </div>
                    ) : (
                        <>
                            {/* MOBILE ONLY: Simple Metrics at top */}
                            {!selectedProvider && (
                                <div className="lg:hidden flex flex-col gap-2 w-full shrink-0 mb-1">
                                    <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-gradient-to-r from-[#1A6140] to-[#124e36] shadow-lg">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-black uppercase tracking-widest text-white/60 mb-0.5">Available Balance</span>
                                            <span className="text-xl font-black text-white">{userMetrics.balance} <span className="text-xs opacity-60">USDC</span></span>
                                        </div>
                                        <div className="p-2 rounded-xl bg-white/10 text-white">
                                            <Wallet size={16} />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#1A6140]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                            <div className="text-[8px] font-black opacity-40 uppercase tracking-widest mb-1">Allocated Stake</div>
                                            <div className="text-base font-black">${userMetrics.allocated}</div>
                                        </div>
                                        <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#1A6140]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                            <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-1">Profit/Loss</div>
                                            <div className="text-lg font-black text-[#1A6140]">{userMetrics.pnl}</div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* LEFT PANE: Top Traders List */}
                        <div className={`flex flex-col gap-2 lg:gap-2 w-full lg:max-w-[280px] shrink-0 ${!selectedProvider ? '' : 'hidden lg:flex'} lg:h-full`}>
                            <div className="flex items-center justify-between px-1">
                                <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/60' : 'text-white/60'}`}>Top Traders</h3>
                                <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isLight ? 'bg-[#1A6140]/10 text-[#1A6140]' : 'bg-[#1A6140]/20 text-[#1A6140]'}`}>
                                    {providers.length} Active
                                </div>
                            </div>

                            <div className={`flex flex-row lg:flex-col lg:flex-1 overflow-x-auto lg:overflow-y-auto no-scrollbar gap-2 pb-2 lg:pb-0 lg:p-2 lg:rounded-[24px] lg:border ${isLight ? 'lg:border-[#1A6140]/20' : 'lg:border-white/10'} lg:backdrop-blur-xl`}>
                                    {isLoading ? (
                                        <div className="flex flex-col items-center justify-center w-full lg:h-full opacity-50 py-4">
                                            <div className="w-6 h-6 border-2 border-[#1A6140]/20 border-t-[#1A6140] rounded-full animate-spin" />
                                        </div>
                                    ) : filteredProviders.length > 0 ? (
                                        filteredProviders.map((provider, idx) => {
                                            const isCurrentUser = provider.address?.toLowerCase() === address?.toLowerCase();
                                            return (
                                            <button
                                                key={provider.address}
                                                onClick={() => setSelectedProvider(provider)}
                                                className={`shrink-0 w-[240px] lg:w-full text-left p-2 rounded-2xl border transition-all flex items-center justify-between group ${isCurrentUser ? 'border-[#1A6140] bg-[#1A6140]/10 shadow-[0_0_12px_rgba(26, 97, 64,0.3)]' : selectedProvider?.address === provider.address ? (isLight ? 'bg-white border-[#1A6140]/40 shadow-md' : 'bg-white/10 border-[#1A6140]/40') : (isLight ? 'bg-transparent border-transparent hover:bg-black/5' : 'bg-transparent border-transparent hover:bg-white/5')}`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <div className="w-5 flex justify-center items-center flex-shrink-0">
                                                        {idx === 0 ? <Trophy size={12} className="text-[#FFD700]" /> : 
                                                         idx === 1 ? <span className="text-[8px] font-black text-gray-400">2ND</span> : 
                                                         idx === 2 ? <span className="text-[8px] font-black text-[#CD7F32]">3RD</span> : 
                                                         idx === 3 ? <span className="text-[8px] font-black opacity-30">4TH</span> : 
                                                         <span className="text-[8px] font-black opacity-30">{idx + 1}TH</span>}
                                                    </div>
                                                    <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-[#1A6140] to-[#124e36] flex-shrink-0">
                                                        {provider.avatar ? <img src={provider.avatar} className="w-full h-full object-cover" /> : null}
                                                    </div>
                                                    <div className="min-w-0 flex flex-col justify-center">
                                                        <h4 className="font-black text-xs truncate">{provider.username}</h4>
                                                        <div className="text-[8px] font-bold opacity-50 uppercase whitespace-nowrap">
                                                            {provider.winRate}% Win · +{provider.roi}%
                                                        </div>
                                                        {isCurrentUser && (
                                                            <div className="text-[7px] font-black text-[#1A6140] uppercase tracking-widest">You</div>
                                                        )}
                                                    </div>
                                                </div>
                                                {!isCurrentUser && (
                                                <div className="flex items-center pl-1 flex-shrink-0">
                                                    <div 
                                                        className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${isLight ? 'bg-[#1A6140]/10 text-[#1A6140] hover:bg-[#1A6140] hover:text-white' : 'bg-[#1A6140]/20 text-[#1A6140] hover:bg-[#1A6140] hover:text-white'}`}
                                                        onClick={(e) => { 
                                                            e.stopPropagation(); 
                                                            setProviderToCopy(provider);
                                                            setIsCopyModalOpen(true);
                                                        }}
                                                    >
                                                        Copy
                                                    </div>
                                                </div>
                                                )}
                                            </button>
                                            );
                                        })
                                    ) : (
                                        <div className="text-center opacity-40 text-xs font-bold py-6 w-full">No providers found</div>
                                    )}
                            </div>
                        </div>

                        {/* Divider Line (Desktop) */}
                        <div className={`hidden lg:block w-px h-full ${isLight ? 'bg-gradient-to-b from-transparent via-[#1A6140]/20 to-transparent' : 'bg-gradient-to-b from-transparent via-white/10 to-transparent'}`} />

                        {/* RIGHT PANE: Metrics + Search + Details */}
                        <div className="flex-1 w-full lg:w-auto max-w-2xl lg:h-full flex flex-col xl:flex-row gap-4 lg:gap-6 overflow-visible lg:overflow-y-auto xl:overflow-visible no-scrollbar">
                            {!selectedProvider ? (
                                <>
                                    {/* Desktop-Only Sub-Left: Wallet Card & Metrics */}
                                    <div className="hidden lg:flex w-full xl:max-w-md flex-col shrink-0 lg:h-full overflow-visible">

                                        {/* Transfer Hub Style Copy Trading Wallet */}
                                    <div className="relative h-[220px] md:h-[260px] w-full shrink-0 mb-4 group">
                                        <div className={`w-full h-full p-8 md:p-10 rounded-[40px] relative flex flex-col justify-between bg-[#1A6140] border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15)]`}>
                                            
                                            {/* Immersive Nature-Series Layer (Behind Texture) */}
                                            <div className="absolute inset-0 pointer-events-none" style={{ borderRadius: 'inherit' }}>
                                                    <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
                                                        <path d="M0,20 Q20,10 40,20 T80,20 T100,10" fill="none" stroke="white" strokeWidth="0.15" />
                                                        <path d="M0,40 Q20,30 40,40 T80,40 T100,30" fill="none" stroke="white" strokeWidth="0.15" />
                                                        <path d="M0,60 Q20,50 40,60 T80,60 T100,50" fill="none" stroke="white" strokeWidth="0.15" />
                                                        <path d="M0,80 Q20,70 40,80 T80,80 T100,70" fill="none" stroke="white" strokeWidth="0.15" />
                                                    </svg>
                                                    <svg className="absolute top-0 right-[-10%] w-[120%] h-full opacity-40" viewBox="0 0 200 100" preserveAspectRatio="none">
                                                        <path d="M0,20 C50,10 80,60 130,50 C180,40 200,90 250,80" fill="none" stroke="white" strokeWidth="10" className="opacity-10" />
                                                        <path d="M0,20 C50,10 80,60 130,50 C180,40 200,90 250,80" fill="none" stroke="white" strokeWidth="0.6" strokeDasharray="4 6" className="opacity-30" />
                                                    </svg>
                                                    <div className="absolute bottom-[15%] right-[12%] flex items-end gap-1 opacity-30">
                                                        <svg width="20" height="28" viewBox="0 0 24 32" fill="white"><path d="M12,0 L24,24 L16,24 L20,32 L4,32 L8,24 L0,24 Z" /></svg>
                                                        <svg width="14" height="20" viewBox="0 0 24 32" fill="white" className="opacity-60"><path d="M12,0 L24,24 L16,24 L20,32 L4,32 L8,24 L0,24 Z" /></svg>
                                                    </div>
                                                    <div className="absolute top-[20%] left-[45%] opacity-20">
                                                        <div className="relative w-3 h-3">
                                                            <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white" />
                                                            <div className="absolute top-0 left-1/2 w-[1px] h-full bg-white" />
                                                        </div>
                                                    </div>
                                                    <div className="absolute bottom-[30%] left-[20%] opacity-10 grid grid-cols-2 gap-2">
                                                        <div className="w-1 h-1 rounded-full bg-white" />
                                                        <div className="w-1 h-1 rounded-full bg-white" />
                                                    </div>
                                                </div>

                                                {/* Platform Standard Texture Layer (On Top) */}
                                                <div className="absolute inset-0 z-0">
                                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#2E8B57_0%,transparent_60%)] opacity-60" />
                                                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,#1E5D3B_0%,transparent_60%)] opacity-40" />
                                                    <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/carbon-fibre.png')` }} />
                                                    <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent opacity-30" />
                                                </div>

                                                {/* Credit Card Chip (Metallic Gold) - Moved to Right */}
                                                <div className="absolute top-1/2 right-10 -translate-y-1/2 w-14 h-11 rounded-xl bg-gradient-to-br from-[#E6BE8A] via-[#C5A059] to-[#8B7355] shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-black/20 z-10">
                                                    <div className="absolute inset-0 grid grid-cols-2 grid-rows-3 gap-[1.5px] p-2.5 opacity-30">
                                                        {[...Array(6)].map((_, i) => (
                                                            <div key={i} className="border border-black/40 rounded-[3px]" />
                                                        ))}
                                                    </div>
                                                    <div className="absolute top-1/2 left-0 w-full h-[1px] bg-black/20" />
                                                </div>

                                                <div className="flex-1 flex flex-col justify-between relative z-20">
                                                    <div className="flex items-center justify-between">
                                                        <div>
                                                            <p className={`text-[11px] font-black uppercase tracking-[0.2em] text-white`}>Copy Trading</p>
                                                            <p className={`text-[28px] md:text-[34px] font-black uppercase text-white/80 -mt-1 leading-none`}>Investor</p>
                                                        </div>
                                                        <img src="/boblogo.png" alt="Logo" className="h-16 md:h-20 object-contain brightness-0 invert mix-blend-overlay opacity-80" />
                                                    </div>

                                                    {/* Card Number (Wallet Address) */}
                                                    <div className="py-2">
                                                        <div className="flex items-center gap-3 group/copy cursor-pointer" onClick={(e) => { e.stopPropagation(); handleCopy(copyWalletAddress); }}>
                                                            <p className="text-[18px] md:text-[22px] font-mono tracking-[0.2em] text-white">
                                                                {copyWalletAddress ? `${copyWalletAddress.slice(0, 6)}...${copyWalletAddress.slice(-4)}`.toUpperCase() : "xxxx...xxxx"}
                                                            </p>
                                                            <div className="p-1.5 rounded-lg bg-white/5 opacity-0 group-hover/copy:opacity-100 transition-all hover:bg-white/10 active:scale-90">
                                                                {copied ? <Check size={14} className="text-[#1A6140]" /> : <Copy size={14} className="text-white/40" />}
                                                            </div>
                                                        </div>
                                                        <div className="flex gap-1.5 mt-4">
                                                            <div className="w-4 h-1.5 rounded-full bg-white" />
                                                        </div>
                                                    </div>

                                                    <div className="flex items-end justify-between relative">
                                                        <div>
                                                            <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 text-white`}>Available Balance</p>
                                                            <h1 className={`text-4xl md:text-5xl font-black tracking-tighter text-white flex items-baseline gap-2`}>
                                                                {copyWalletBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                <span className="text-xl text-white/60">USDC</span>
                                                            </h1>
                                                        </div>
                                                    </div>

                                                    <div className="flex items-center justify-between mt-3">
                                                        <div className="flex items-center gap-2">
                                                            <Shield size={10} className="text-white opacity-40" />
                                                            <p className={`text-[9px] font-bold uppercase tracking-widest text-white opacity-40`}>Secured</p>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => { setCopyTransferAmount(''); setShowCopyDepositModal(true); }}
                                                                className="px-3 py-1.5 rounded-full bg-white/10 text-white text-[8px] font-black uppercase tracking-widest hover:bg-white/20 active:scale-95 transition-all border border-white/10"
                                                            >
                                                                Deposit
                                                            </button>
                                                            <button
                                                                onClick={() => { setCopyTransferAmount(''); setShowCopyWithdrawModal(true); }}
                                                                className="px-3 py-1.5 rounded-full bg-white/10 text-white text-[8px] font-black uppercase tracking-widest hover:bg-white/20 active:scale-95 transition-all border border-white/10"
                                                            >
                                                                Withdraw
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* User Copy Trading Metrics */}
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#1A6140]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[8px] font-black opacity-40 uppercase tracking-widest mb-0.5">Allocated Stake</div>
                                                <div className="text-base font-black">${userMetrics.allocated}</div>
                                            </div>
                                            <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#1A6140]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[8px] font-black opacity-40 uppercase tracking-widest mb-0.5">Profit/Loss</div>
                                                <div className="text-base font-black text-[#1A6140]">{userMetrics.pnl}</div>
                                            </div>
                                            <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#1A6140]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[8px] font-black opacity-40 uppercase tracking-widest mb-0.5">Active Copies</div>
                                                <div className="text-base font-black">{userMetrics.activeCopies}</div>
                                            </div>
                                            <div className={`px-3 py-2 rounded-2xl border ${isLight ? 'border-[#1A6140]/15 bg-white/40' : 'border-white/5 bg-white/[0.02]'}`}>
                                                <div className="text-[8px] font-black opacity-40 uppercase tracking-widest mb-0.5">Total Copied</div>
                                                <div className="text-base font-black">{userMetrics.totalCopied}</div>
                                            </div>
                                        </div>

                                        {/* Activity (Desktop Only) */}
                                        <div className="hidden lg:block mt-3">
                                            <div className="flex items-center justify-between mb-1.5">
                                                <span className={`text-[7px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Activity</span>
                                                <button onClick={fetchInvestorCopies} className="text-[6px] font-bold opacity-30 hover:opacity-60 uppercase tracking-widest transition-opacity">Refresh</button>
                                            </div>
                                            <div className="max-h-32 overflow-y-auto no-scrollbar space-y-0.5">
                                                {isLoadingInvestorCopies ? (
                                                    <div className="py-3 flex items-center justify-center">
                                                        <div className="w-3 h-3 border-2 border-[#1A6140]/20 border-t-[#1A6140] rounded-full animate-spin" />
                                                    </div>
                                                ) : [...investorCopies.active, ...investorCopies.history].length > 0 ? (
                                                    [...investorCopies.active, ...investorCopies.history].map((trade, i) => (
                                                        <div key={trade.id || i} className={`flex items-center justify-between gap-1 px-2 py-1 rounded-lg ${isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'}`}>
                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${trade.result === 'PENDING' ? 'bg-[#1A6140] shadow-[0_0_6px_rgba(26, 97, 64,0.7)]' : trade.result === 'WON' ? 'bg-[#1A6140]' : 'bg-red-400'}`} />
                                                                <span className="text-[10px] font-black truncate">{trade.asset || '---'}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2 shrink-0">
                                                                <span className={`text-[8px] font-bold ${trade.direction === 'UP' ? 'text-[#1A6140]' : 'text-red-400'}`}>
                                                                    {trade.direction || '---'}
                                                                </span>
                                                                <span className={`text-[8px] font-bold ${trade.result === 'WON' ? 'text-[#1A6140]' : trade.result === 'LOST' ? 'text-red-400' : 'text-amber-400'}`}>
                                                                    {trade.result === 'PENDING' ? 'Active' : trade.result || '---'}
                                                                </span>
                                                                <span className={`text-[7px] font-bold ${isLight ? 'text-black/30' : 'text-white/30'}`}>
                                                                    {trade.timestamp ? new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="py-4 text-center">
                                                        <p className={`text-[8px] font-bold ${isLight ? 'text-black/30' : 'text-white/30'}`}>No activity yet</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                    </div>

                                    {/* Vertical Divider Line (Desktop) / Horizontal (Mobile) */}
                                    <div className={`hidden xl:block w-px h-full shrink-0 ${isLight ? 'bg-gradient-to-b from-transparent via-[#1A6140]/20 to-transparent' : 'bg-gradient-to-b from-transparent via-white/10 to-transparent'}`} />

                                    {/* Sub-Right: Provider List */}
                                    <div className="flex-1 flex flex-col lg:h-full lg:overflow-hidden lg:mt-0">

                                    <div className="flex items-center justify-between mb-3 px-1">
                                        <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/60' : 'text-white/60'}`}>Providers</h3>
                                        <div className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${isLight ? 'bg-[#1A6140]/10 text-[#1A6140]' : 'bg-[#1A6140]/20 text-[#1A6140]'}`}>
                                            {providers.length} Available
                                        </div>
                                    </div>

                                    <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl border mb-3 ${isLight ? 'bg-black/5 border-transparent' : 'bg-white/5 border-white/5'}`}>
                                        <Search size={12} className="opacity-40 flex-none" />
                                        <input
                                            type="text"
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            placeholder="Search providers..."
                                            className={`w-full bg-transparent force-transparent-bg text-[11px] font-bold outline-none border-none transition-all focus:!ring-0 focus:!shadow-none focus:!border-none focus:!outline-none ${isLight ? 'text-black placeholder:text-black/30' : 'text-white placeholder:text-white/30'}`}
                                        />
                                    </div>

                                    {/* Provider List */}
                                    <div ref={providerListRef} className="flex-1 overflow-y-auto no-scrollbar flex flex-col gap-1.5 scroll-smooth">
                                        {isLoading ? (
                                            <div className="flex flex-col items-center justify-center h-24 opacity-50">
                                                <div className="w-6 h-6 border-2 border-[#1A6140]/20 border-t-[#1A6140] rounded-full animate-spin" />
                                            </div>
                                        ) : filteredProviders.length > 0 ? (
                                            filteredProviders.map(provider => {
                                                const isCurrentUser = provider.address?.toLowerCase() === address?.toLowerCase();
                                                return (
                                                <button
                                                    key={provider.address}
                                                    onClick={() => setSelectedProvider(provider)}
                                                    className={`w-full text-left p-3 rounded-2xl border flex items-center justify-between transition-all group ${isCurrentUser ? 'border-[#1A6140] bg-[#1A6140]/10 shadow-[0_0_12px_rgba(26, 97, 64,0.3)]' : isLight ? 'bg-transparent border-[#1A6140]/10 hover:bg-white hover:shadow-md' : 'bg-transparent border-white/5 hover:bg-white/5'}`}
                                                >
                                                    <div className="flex items-center gap-2">
                                                        <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-[#1A6140] to-[#124e36] flex-shrink-0 border border-[#1A6140]">
                                                            {provider.avatar ? <img src={provider.avatar} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-white font-black text-[10px]">{provider.username?.[0] || 'T'}</div>}
                                                        </div>
                                                        <div>
                                                            <h4 className="font-black text-xs">{provider.username}</h4>
                                                            <div className="text-[9px] font-bold opacity-50 uppercase">
                                                                {provider.winRate}% Win Rate · {provider.followers} Copiers
                                                            </div>
                                                            {isCurrentUser && (
                                                                <div className="text-[7px] font-black text-[#1A6140] uppercase tracking-widest mt-0.5">You</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="text-right flex items-center gap-2">
                                                        <div>
                                                            <div className="text-[#1A6140] font-black text-xs">+{provider.roi}%</div>
                                                            <div className="text-[9px] font-bold opacity-30 uppercase">ROI</div>
                                                        </div>
                                                        <ChevronRight size={14} className="opacity-30 group-hover:opacity-70 transition-all" />
                                                    </div>
                                                </button>
                                                );
                                            })
                                        ) : (
                                            <div className="text-center opacity-40 text-xs font-bold py-6">No providers found</div>
                                        )}
                                    </div>


                                    </div>
                                    </>
                            ) : (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="h-full flex flex-col"
                                >
                                    <h3 className={`text-xs font-black uppercase tracking-[0.2em] mb-4 px-2 ${isLight ? 'text-black/60' : 'text-white/60'}`}>Provider Analysis</h3>

                                    <div className={`p-5 rounded-[24px] border ${isLight ? 'bg-transparent border-[#1A6140]/20 shadow-xl' : 'bg-transparent border-white/10 shadow-2xl'} backdrop-blur-xl relative overflow-hidden`}>
                                        
                                        <div className="flex items-start justify-between mb-5">
                                            <div className="flex items-center gap-4">
                                                <div className="w-14 h-14 rounded-full overflow-hidden bg-gradient-to-br from-[#1A6140] to-[#124e36] shadow-lg border-2 border-white/5">
                                                    {selectedProvider.avatar && <img src={selectedProvider.avatar} className="w-full h-full object-cover" />}
                                                </div>
                                                <div>
                                                    <h2 className="text-2xl font-black">{selectedProvider.username}</h2>
                                                    <div className="flex items-center gap-2 mt-1">
                                                        <span className="text-[11px] font-bold opacity-50 font-mono">{selectedProvider.address.substring(0, 6)}...{selectedProvider.address.slice(-4)}</span>
                                                        <div className="px-2 py-0.5 rounded-full bg-[#1A6140]/20 text-[#1A6140] text-[9px] font-black uppercase tracking-widest">Verified</div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-3 gap-3 mb-6">
                                            <div className={`p-3 rounded-xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                                <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-0.5">Win Rate</div>
                                                <div className="text-lg font-black text-[#1A6140]">{selectedProvider.winRate}%</div>
                                            </div>
                                            <div className={`p-3 rounded-xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                                <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-0.5">Total Trades</div>
                                                <div className="text-lg font-black">{selectedProvider.totalTrades}</div>
                                            </div>
                                            <div className={`p-3 rounded-xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                                <div className="text-[9px] font-black opacity-40 uppercase tracking-widest mb-0.5">Total ROI</div>
                                                <div className="text-lg font-black text-[#1A6140]">+{selectedProvider.roi}%</div>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => {
                                                setProviderToCopy(selectedProvider);
                                                setIsCopyModalOpen(true);
                                            }}
                                            className="w-full py-4 rounded-[20px] bg-[#1A6140] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                        >
                                            <Copy size={16} />
                                            <span>Copy This Trader</span>
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                        </>
                    )
                ) : (
                    /* TRADER MODE PANE */
                    <div className="w-full flex flex-col">
                        {isProvider ? (
                            <div className="w-full flex flex-col lg:flex-row gap-4 lg:gap-8 overflow-y-auto lg:overflow-hidden relative">
                                {/* LEFT: Wallet Card + Revenue */}
                                <div className="w-full xl:max-w-md flex flex-col shrink-0 lg:h-full overflow-visible">
                                    {/* Portfolio Wallet Card (same design as investor wallet) */}
                                    <div ref={walletCardRef} className="relative h-[220px] md:h-[260px] w-full shrink-0 mb-4 group">
                                        <div className={`w-full h-full px-6 py-4 md:px-10 md:py-8 rounded-[40px] relative overflow-hidden flex flex-col justify-between bg-[#1A6140] border border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.15)]`}>
                                            
                                            {/* Immersive Nature-Series Layer */}
                                            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                                                <svg className="absolute inset-0 w-full h-full opacity-20" viewBox="0 0 100 100" preserveAspectRatio="none">
                                                    <path d="M0,20 Q20,10 40,20 T80,20 T100,10" fill="none" stroke="white" strokeWidth="0.15" />
                                                    <path d="M0,40 Q20,30 40,40 T80,40 T100,30" fill="none" stroke="white" strokeWidth="0.15" />
                                                    <path d="M0,60 Q20,50 40,60 T80,60 T100,50" fill="none" stroke="white" strokeWidth="0.15" />
                                                    <path d="M0,80 Q20,70 40,80 T80,80 T100,70" fill="none" stroke="white" strokeWidth="0.15" />
                                                </svg>
                                                <svg className="absolute top-0 right-[-10%] w-[120%] h-full opacity-40" viewBox="0 0 200 100" preserveAspectRatio="none">
                                                    <path d="M0,20 C50,10 80,60 130,50 C180,40 200,90 250,80" fill="none" stroke="white" strokeWidth="10" className="opacity-10" />
                                                    <path d="M0,20 C50,10 80,60 130,50 C180,40 200,90 250,80" fill="none" stroke="white" strokeWidth="0.6" strokeDasharray="4 6" className="opacity-30" />
                                                </svg>
                                                <div className="absolute bottom-[15%] right-[12%] flex items-end gap-1 opacity-30">
                                                    <svg width="20" height="28" viewBox="0 0 24 32" fill="white"><path d="M12,0 L24,24 L16,24 L20,32 L4,32 L8,24 L0,24 Z" /></svg>
                                                    <svg width="14" height="20" viewBox="0 0 24 32" fill="white" className="opacity-60"><path d="M12,0 L24,24 L16,24 L20,32 L4,32 L8,24 L0,24 Z" /></svg>
                                                </div>
                                                <div className="absolute top-[20%] left-[45%] opacity-20">
                                                    <div className="relative w-3 h-3">
                                                        <div className="absolute top-1/2 left-0 w-full h-[1px] bg-white" />
                                                        <div className="absolute top-0 left-1/2 w-[1px] h-full bg-white" />
                                                    </div>
                                                </div>
                                                <div className="absolute bottom-[30%] left-[20%] opacity-10 grid grid-cols-2 gap-2">
                                                    <div className="w-1 h-1 rounded-full bg-white" />
                                                    <div className="w-1 h-1 rounded-full bg-white" />
                                                </div>
                                            </div>

                                            {/* Texture Layer */}
                                            <div className="absolute inset-0 z-0">
                                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,#2E8B57_0%,transparent_60%)] opacity-60" />
                                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,#1E5D3B_0%,transparent_60%)] opacity-40" />
                                                <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: `url('https://www.transparenttextures.com/patterns/carbon-fibre.png')` }} />
                                                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 to-transparent opacity-30" />
                                            </div>

                                            {/* Credit Card Chip */}
                                            <div className="absolute top-1/2 right-10 -translate-y-1/2 w-14 h-11 rounded-xl bg-gradient-to-br from-[#E6BE8A] via-[#C5A059] to-[#8B7355] shadow-[0_4px_12px_rgba(0,0,0,0.5)] border border-black/20 z-10">
                                                <div className="absolute inset-0 grid grid-cols-2 grid-rows-3 gap-[1.5px] p-2.5 opacity-30">
                                                    {[...Array(6)].map((_, i) => (
                                                        <div key={i} className="border border-black/40 rounded-[3px]" />
                                                    ))}
                                                </div>
                                                <div className="absolute top-1/2 left-0 w-full h-[1px] bg-black/20" />
                                            </div>

                                            <div className="flex-1 flex flex-col justify-between relative z-20">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className={`text-[11px] font-black uppercase tracking-[0.2em] text-white`}>Portfolio Wallet</p>
                                                        <p className={`text-[28px] md:text-[34px] font-black uppercase text-white/80 -mt-1 leading-none`}>Provider</p>
                                                    </div>
                                                    {portfolioWallet ? (
                                                        <img src="/boblogo.png" alt="Logo" className="h-16 md:h-20 object-contain brightness-0 invert mix-blend-overlay opacity-80" />
                                                    ) : null}
                                                </div>

                                                {portfolioWallet ? (
                                                    <>
                                                        <div className="py-2">
                                                            <div className="flex items-center gap-3 group/copy cursor-pointer" onClick={(e) => { e.stopPropagation(); handleCopy(portfolioWallet.address); }}>
                                                                <p className="text-[18px] md:text-[22px] font-mono tracking-[0.2em] text-white">
                                                                    {portfolioWallet.address ? `${portfolioWallet.address.slice(0, 6)}...${portfolioWallet.address.slice(-4)}`.toUpperCase() : "xxxx...xxxx"}
                                                                </p>
                                                                <div className="p-1.5 rounded-lg bg-white/5 opacity-0 group-hover/copy:opacity-100 transition-all hover:bg-white/10 active:scale-90">
                                                                    {copied ? <Check size={14} className="text-[#1A6140]" /> : <Copy size={14} className="text-white/40" />}
                                                                </div>
                                                            </div>
                                                            <div className="flex gap-1.5 mt-4">
                                                                <div className="w-4 h-1.5 rounded-full bg-white" />
                                                            </div>
                                                        </div>

                                                        <div className="flex items-end justify-between relative">
                                                            <div>
                                                                <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 text-white`}>Available Balance</p>
                                                                <h1 className={`text-4xl md:text-5xl font-black tracking-tighter text-white flex items-baseline gap-2`}>
                                                                    {portfolioWallet.balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                                                    <span className="text-xl text-white/60">USDC</span>
                                                                </h1>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2 mt-2">
                                                            <Shield size={10} className="text-white opacity-40" />
                                                            <p className={`text-[9px] font-bold uppercase tracking-widest text-white opacity-40`}>Secured</p>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        {/* Generate Portfolio Wallet */}
                                                        <div className="py-2">
                                                            <div className="flex items-center gap-3">
                                                                <p className="text-[18px] md:text-[22px] font-mono tracking-[0.2em] text-white/40">xxxx...xxxx</p>
                                                            </div>
                                                            <div className="flex gap-1.5 mt-4">
                                                                <div className="w-4 h-1.5 rounded-full bg-white/20" />
                                                            </div>
                                                        </div>

                                                        <div className="flex items-end justify-between relative">
                                                            <div>
                                                                <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-1 text-white/60`}>Available Balance</p>
                                                                <h1 className={`text-4xl md:text-5xl font-black tracking-tighter text-white/40 flex items-baseline gap-2`}>
                                                                    0.00
                                                                    <span className="text-xl text-white/30">USDC</span>
                                                                </h1>
                                                            </div>
                                                        </div>

                                                        <div className="flex flex-col items-center justify-center">
                                                            <span className="text-[8px] font-black uppercase tracking-[0.2em] text-white/40 mb-1">Generate</span>
                                                            <button
                                                                onClick={async () => {
                                                                    setIsGeneratingPortfolio(true);
                                                                    try {
                                                                        const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers/${address.toLowerCase()}/generate-portfolio-wallet`, { method: 'POST' });
                                                                        const data = await res.json();
                                                                        if (res.ok && data.success) {
                                                                            setPortfolioWallet(data.wallet);
                                                                            setPortfolioBalance(data.wallet.balance);
                                                                            if (data.claimed) {
                                                                                setCopyResult({ type: 'success', message: `Wallet +${data.claimed.net.toFixed(2)} USDC` });
                                                                            } else {
                                                                                setCopyResult({ type: 'success', message: 'Wallet generated' });
                                                                            }
                                                                            fetchPortfolio();
                                                                            setTimeout(() => setCopyResult(null), 3000);
                                                                        } else {
                                                                            setCopyResult({ type: 'fail', message: data.error || 'Generation failed' });
                                                                            setTimeout(() => setCopyResult(null), 2500);
                                                                        }
                                                                    } catch (e) {
                                                                        setCopyResult({ type: 'fail', message: 'Network error' });
                                                                        setTimeout(() => setCopyResult(null), 2500);
                                                                    } finally {
                                                                        setIsGeneratingPortfolio(false);
                                                                    }
                                                                }}
                                                                disabled={isGeneratingPortfolio}
                                                                className="px-6 py-2.5 rounded-xl bg-amber-500 text-black font-black text-[10px] uppercase tracking-[0.2em] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 shadow-lg"
                                                            >
                                                                {isGeneratingPortfolio ? 'Generating...' : 'Generate Wallet'}
                                                            </button>
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Pending Revenue Alert */}
                                    {pendingRevenue > 0 && (
                                        <motion.div
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            className="mb-4 p-4 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-between"
                                        >
                                            <div>
                                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-400">Unclaimed Revenue</p>
                                                <p className="text-sm font-black text-amber-400">{pendingRevenue.toFixed(2)} USDC</p>
                                                <p className="text-[8px] font-bold text-amber-400/60 mt-1">Generate wallet to claim (10% penalty applies)</p>
                                            </div>
                                            {portfolioWallet && (
                                                <button
                                                    onClick={async () => {
                                                        try {
                                                            const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers/${address.toLowerCase()}/claim-revenue`, { method: 'POST' });
                                                            const data = await res.json();
                                                            if (res.ok && data.success) {
                                                                setPortfolioWallet(prev => ({ ...prev, balance: data.newBalance }));
                                                                setPendingRevenue(0);
                                                                setCopyResult({ type: 'success', message: `Claimed ${data.claimed.net.toFixed(2)} USDC (10% penalty: ${data.claimed.penalty.toFixed(2)})` });
                                                                setTimeout(() => setCopyResult(null), 3000);
                                                            } else {
                                                                setCopyResult({ type: 'fail', message: data.error || 'Claim failed' });
                                                                setTimeout(() => setCopyResult(null), 2500);
                                                            }
                                                        } catch (e) {
                                                            setCopyResult({ type: 'fail', message: 'Network error' });
                                                            setTimeout(() => setCopyResult(null), 2500);
                                                        }
                                                    }}
                                                    className="px-4 py-2 rounded-xl bg-amber-500 text-black font-black text-[9px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
                                                >
                                                    Claim
                                                </button>
                                            )}
                                        </motion.div>
                                    )}

                                    {/* Withdraw button for portfolio wallet */}
                                    {portfolioWallet && (
                                        <button
                                            onClick={() => { setWithdrawAmount(''); setShowWithdrawModal(true); }}
                                            className="w-full py-3 rounded-[20px] bg-[#1A6140] text-white font-black text-[10px] uppercase tracking-[0.2em] shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                                        >
                                            <Send size={14} />
                                            Withdraw from Portfolio
                                        </button>
                                    )}
                                </div>

                                {/* CENTER: Two Donuts — Revenue + Win/Loss */}
                                <div className="flex flex-row xl:flex-col items-start xl:items-center justify-center gap-4 xl:gap-8 shrink-0 py-2 xl:py-4 w-full xl:w-80 xl:ml-[10%]">
                                    {/* Revenue Donut */}
                                    <div className="flex-1 min-w-0 xl:w-full xl:flex-none flex flex-col">
                                        <div className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-2 text-center">Revenue</div>
                                        <div className="flex items-center gap-4">
                                            <div className="relative h-32 w-32 shrink-0">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie data={(() => {
                                                            if (activationRevenue === 0) return [{ name: 'No Data', value: 1, color: '#1A6140' }];
                                                            return [
                                                                { name: 'Activation Fees', value: activationRevenue / 2, color: '#8B7355' },
                                                                { name: 'Win Trade Fees', value: 0, color: '#1A6140' },
                                                                { name: 'Loss Trade Fees', value: 0, color: '#FF4444' }
                                                            ];
                                                        })()} cx="50%" cy="50%" innerRadius={30} outerRadius={48} dataKey="value" stroke="none">
                                                            {activationRevenue === 0 ? (
                                                                <Cell fill="#1A6140" />
                                                            ) : (
                                                                <><Cell fill="#8B7355" /><Cell fill="#1A6140" /><Cell fill="#FF4444" /></>
                                                            )}
                                                        </Pie>
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <span className="text-[10px] font-black">{activationRevenue.toFixed(2)}</span>
                                                </div>
                                            </div>
                                            <div className="space-y-2 text-[8px] font-bold opacity-60">
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#8B7355]" />Activation</span>
                                                    <span className="font-black">{(activationRevenue / 2).toFixed(2)}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#1A6140]" />Trade Fees</span>
                                                    <span className="font-black">0.00</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-4 pt-1 border-t border-white/10">
                                                    <span className="flex items-center gap-1.5 font-black uppercase tracking-wider">Total</span>
                                                    <span className="font-black">{activationRevenue.toFixed(2)}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Win/Loss Donut */}
                                    <div className="flex-1 min-w-0 xl:w-full xl:flex-none flex flex-col">
                                        <div className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-2 text-center">Win / Loss</div>
                                        <div className="flex items-center gap-4">
                                            <div className="relative h-32 w-32 shrink-0">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <PieChart>
                                                        <Pie data={(() => {
                                                            const w = providerPerformance?.wins || profile?.stats?.totalWins || 0;
                                                            const l = providerPerformance?.losses || (profile?.stats?.totalTrades - profile?.stats?.totalWins) || 0;
                                                            if (w === 0 && l === 0) return [{ name: 'No Data', value: 1, color: '#1A6140' }];
                                                            return [{ name: 'Wins', value: w, color: '#1A6140' }, { name: 'Losses', value: l, color: '#FF4444' }];
                                                        })()} cx="50%" cy="50%" innerRadius={30} outerRadius={48} startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                                                            {(() => {
                                                                const w = providerPerformance?.wins || profile?.stats?.totalWins || 0;
                                                                const l = providerPerformance?.losses || (profile?.stats?.totalTrades - profile?.stats?.totalWins) || 0;
                                                                if (w === 0 && l === 0) return <Cell fill="#1A6140" />;
                                                                return <><Cell fill="#1A6140" /><Cell fill="#FF4444" /></>;
                                                            })()}
                                                        </Pie>
                                                    </PieChart>
                                                </ResponsiveContainer>
                                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                    <span className="text-[10px] font-black">
                                                        {(() => {
                                                            const total = providerPerformance?.wins || profile?.stats?.totalWins || 0;
                                                            const losses = providerPerformance?.losses || (profile?.stats?.totalTrades - profile?.stats?.totalWins) || 0;
                                                            const all = total + losses;
                                                            return all > 0 ? ((total / all) * 100).toFixed(0) + '%' : '0%';
                                                        })()}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="space-y-2 text-[8px] font-bold opacity-60">
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#1A6140]" />Wins</span>
                                                    <span className="font-black">{providerPerformance?.wins || profile?.stats?.totalWins || 0}</span>
                                                </div>
                                                <div className="flex items-center justify-between gap-4">
                                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-[#FF4444]" />Losses</span>
                                                    <span className="font-black">{providerPerformance?.losses || (profile?.stats?.totalTrades - profile?.stats?.totalWins) || 0}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT: Activities (Desktop) */}
                                <div className="hidden xl:flex w-full xl:max-w-sm ml-auto flex-col lg:h-full lg:overflow-hidden pb-8 px-2">
                                    <div className="flex flex-col items-center gap-0.5">
                                        <div className="flex items-center gap-2 opacity-40">
                                            <Activity size={10} className="text-[#1A6140]" />
                                            <span className="text-[7px] font-black uppercase tracking-widest">Activities</span>
                                        </div>
                                        <button
                                            onMouseEnter={() => { const el = document.getElementById('activities-scroll'); if (el) { el._scrollInterval = setInterval(() => { el.scrollTop -= 4; }, 16); } }}
                                            onMouseLeave={() => { const el = document.getElementById('activities-scroll'); if (el && el._scrollInterval) { clearInterval(el._scrollInterval); el._scrollInterval = null; } }}
                                            onClick={() => { const el = document.getElementById('activities-scroll'); if (el) { el.scrollTop -= 100; } }}
                                            className="p-1 rounded transition-all hover:bg-white/5 active:scale-90"
                                        >
                                            <ChevronUp size={14} className="opacity-30" />
                                        </button>
                                        {tradeHistory && tradeHistory.length > 0 ? (
                                            <div id="activities-scroll" className="divide-y divide-white/[0.03] max-h-[200px] overflow-y-auto custom-scrollbar w-full">
                                                {tradeHistory.slice(0, 10).map((trade) => {
                                                    const isWin = trade.status === 'WON' || trade.status === 'PAID';
                                                    const isLoss = trade.status === 'LOST';
                                                    return (
                                                        <div key={trade.id} className="grid grid-cols-[1fr_auto] md:grid-cols-[1fr_70px_70px_70px] gap-3 items-center px-2 py-2 hover:bg-white/[0.01] transition-colors">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <div className={`text-[8px] font-black px-1.5 py-0.5 rounded uppercase tracking-tighter ${trade.direction === 'UP' ? 'bg-[#1A6140]/20 text-[#1A6140]' : 'bg-[#FF7F50]/20 text-[#FF7F50]'}`}>
                                                                    {trade.direction === 'UP' ? 'LONG' : 'SHORT'}
                                                                </div>
                                                                <span className="text-[9px] font-bold uppercase tracking-widest truncate">{trade.symbol?.toUpperCase() || 'BTC'}</span>
                                                            </div>
                                                            <div className="hidden md:block text-right">
                                                                <div className="text-[7px] font-black opacity-30 uppercase tracking-widest">Amt</div>
                                                                <div className="text-[9px] font-black">{Number(trade.amount || 0).toFixed(2)}</div>
                                                            </div>
                                                            <div className="hidden md:block text-right">
                                                                <div className="text-[7px] font-black opacity-30 uppercase tracking-widest">Entry</div>
                                                                <div className="text-[9px] font-black">${Number(trade.entryPrice || 0).toFixed(2)}</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className={`text-[9px] font-black ${isWin ? 'text-[#1A6140]' : isLoss ? 'text-[#FF7F50]' : 'opacity-40'}`}>
                                                                    {isWin ? `+$${Number(trade.payout || 0).toFixed(2)}` : isLoss ? `-$${Number(trade.amount || 0).toFixed(2)}` : trade.status}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="flex items-center justify-center py-4 text-[8px] font-bold opacity-25">No trades yet</div>
                                        )}
                                        <button
                                            onMouseEnter={() => { const el = document.getElementById('activities-scroll'); if (el) { el._scrollInterval = setInterval(() => { el.scrollTop += 4; }, 16); } }}
                                            onMouseLeave={() => { const el = document.getElementById('activities-scroll'); if (el && el._scrollInterval) { clearInterval(el._scrollInterval); el._scrollInterval = null; } }}
                                            onClick={() => { const el = document.getElementById('activities-scroll'); if (el) { el.scrollTop += 100; } }}
                                            className="p-1 rounded transition-all hover:bg-white/5 active:scale-90"
                                        >
                                            <ChevronDown size={14} className="opacity-30" />
                                        </button>
                                    </div>
                                </div>

                            </div>
                        ) : isPending ? (
                            <div className={`p-8 rounded-[32px] max-w-md w-full text-center ${isLight ? 'bg-transparent' : 'bg-transparent'} backdrop-blur-xl`}>
                                <div className="flex items-center justify-center gap-1 mb-5">
                                    {[...Array(3)].map((_, i) => (
                                        <div
                                            key={i}
                                            className="w-2 h-10 rounded-full bg-[#1A6140]"
                                            style={{
                                                animation: `futuristicPulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                                                boxShadow: '0 0 12px rgba(26, 97, 64,0.6)',
                                            }}
                                        />
                                    ))}
                                </div>
                                <h2 className="text-lg font-black mb-3">Application Pending</h2>
                                <p className="text-xs font-bold opacity-60 leading-relaxed">
                                    The 15market citadel is reviewing your on-chain trading metrics. You will be notified once approved.
                                </p>
                                <style>{`
                                    @keyframes futuristicPulse {
                                        0%, 80%, 100% { transform: scaleY(0.4); opacity: 0.4; }
                                        40% { transform: scaleY(1.2); opacity: 1; }
                                    }
                                `}</style>
                            </div>
                        ) : appSuccess ? (
                            <motion.div initial={{opacity:0, scale:0.8}} animate={{opacity:1, scale:1}} exit={{opacity:0}} className="max-w-sm w-full mx-auto text-center bg-transparent backdrop-blur-xl flex flex-col items-center justify-center">
                                <h2 className="text-2xl font-black mb-1 text-[#1A6140]">Success!</h2>
                                <p className="text-xs font-bold opacity-60 uppercase tracking-widest">Application Submitted</p>
                            </motion.div>
                        ) : (
                            <div className="w-full max-w-sm mx-auto text-center bg-transparent backdrop-blur-xl">
                                {appStep === 0 && (
                                    <motion.div initial={{opacity:0}} animate={{opacity:1}} className="flex flex-col items-center">
                                        <h2 className="text-lg font-black mb-3">Become a Provider</h2>
                                        <p className="text-xs font-bold opacity-60 leading-relaxed mb-6">
                                            Monetize your trading edge. Allow others to copy your trades and earn a flat performance fee on all generated profits. 
                                            Your application will be evaluated based on your historical 15market PnL and win rate.
                                        </p>
                                        <button 
                                            onClick={() => setAppStep(1)}
                                            className="w-auto px-10 py-4 rounded-[20px] bg-[#1A6140] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                                        >
                                            Apply
                                        </button>
                                    </motion.div>
                                )}

                                {appStep >= 1 && appStep <= 5 && (
                                    <motion.div key={appStep} initial={{opacity:0, x:30}} animate={{opacity:1, x:0}} className="text-left w-full">
                                        {/* Progress bar */}
                                        <div className="flex items-center gap-1 mb-6 justify-center">
                                            {[1,2,3,4,5].map(s => (
                                                <div key={s} className={`h-1 rounded-full transition-all duration-500 ${s <= appStep ? 'bg-[#1A6140]' : isLight ? 'bg-black/10' : 'bg-white/10'} ${s === appStep ? 'w-8' : 'w-4'}`} />
                                            ))}
                                        </div>

                                        <h2 className="text-lg font-black mb-1 text-center">{
                                            appStep === 1 ? 'Display Name' :
                                            appStep === 2 ? 'Twitter' :
                                            appStep === 3 ? 'Telegram' :
                                            appStep === 4 ? 'Email Address' :
                                            appStep === 5 ? 'Copy Fee' : ''
                                        }</h2>
                                        <p className={`text-[10px] font-bold opacity-40 uppercase tracking-widest mb-6 text-center`}>
                                            Step {appStep} of 5
                                        </p>

                                        {/* Step 1: Name */}
                                        {appStep === 1 && (
                                            <div className="flex flex-col gap-4">
                                                <input 
                                                    type="text" 
                                                    placeholder="Enter your display name"
                                                    value={appData.name}
                                                    onChange={(e) => setAppData({...appData, name: e.target.value})}
                                                    autoFocus
                                                    className={`w-full p-4 rounded-2xl text-sm font-bold outline-none border transition-all ${isLight ? 'bg-black/5 border-transparent text-black focus:border-[#1A6140]/40' : 'bg-white/5 border-white/5 text-white focus:border-[#1A6140]/40'}`}
                                                />
                                                <button
                                                    onClick={() => appData.name.trim() && setAppStep(2)}
                                                    disabled={!appData.name.trim()}
                                                    className="w-full py-4 rounded-[20px] bg-[#1A6140] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30"
                                                >
                                                    Continue
                                                </button>
                                            </div>
                                        )}

                                        {/* Step 2: Twitter */}
                                        {appStep === 2 && (
                                            <div className="flex flex-col gap-4">
                                                <input 
                                                    type="text" 
                                                    placeholder="@username"
                                                    value={appData.twitter}
                                                    onChange={(e) => setAppData({...appData, twitter: e.target.value})}
                                                    autoFocus
                                                    className={`w-full p-4 rounded-2xl text-sm font-bold outline-none border transition-all ${isLight ? 'bg-black/5 border-transparent text-black focus:border-[#1A6140]/40' : 'bg-white/5 border-white/5 text-white focus:border-[#1A6140]/40'}`}
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setAppStep(1)}
                                                        className={`flex-1 py-4 rounded-[20px] font-black text-xs uppercase tracking-[0.2em] transition-all border ${isLight ? 'border-black/10 text-black/60 hover:bg-black/5' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                                                    >
                                                        Back
                                                    </button>
                                                    <button
                                                        onClick={() => setAppStep(3)}
                                                        disabled={!appData.twitter.trim()}
                                                        className="flex-1 py-4 rounded-[20px] bg-[#1A6140] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30"
                                                    >
                                                        Continue
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Step 3: Telegram */}
                                        {appStep === 3 && (
                                            <div className="flex flex-col gap-4">
                                                <input 
                                                    type="text" 
                                                    placeholder="@telegram_username"
                                                    value={appData.telegram}
                                                    onChange={(e) => setAppData({...appData, telegram: e.target.value})}
                                                    autoFocus
                                                    className={`w-full p-4 rounded-2xl text-sm font-bold outline-none border transition-all ${isLight ? 'bg-black/5 border-transparent text-black focus:border-[#1A6140]/40' : 'bg-white/5 border-white/5 text-white focus:border-[#1A6140]/40'}`}
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setAppStep(2)}
                                                        className={`flex-1 py-4 rounded-[20px] font-black text-xs uppercase tracking-[0.2em] transition-all border ${isLight ? 'border-black/10 text-black/60 hover:bg-black/5' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                                                    >
                                                        Back
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            setAppStep(4);
                                                            // Reset OTP state when entering email step
                                                            if (emailSource === 'manual') {
                                                                setOtpVerified(false);
                                                                setOtpSent(false);
                                                            }
                                                        }}
                                                        disabled={!appData.telegram.trim()}
                                                        className="flex-1 py-4 rounded-[20px] bg-[#1A6140] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30"
                                                    >
                                                        Continue
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Step 4: Email with OTP verification */}
                                        {appStep === 4 && (
                                            <div className="flex flex-col gap-4">
                                                {emailSource === 'privy' && appData.email ? (
                                                    <>
                                                        <div className={`p-4 rounded-2xl border ${isLight ? 'bg-[#1A6140]/5 border-[#1A6140]/20' : 'bg-[#1A6140]/10 border-[#1A6140]/20'}`}>
                                                            <div className="flex items-center gap-2 mb-1">
                                                                <CheckCircle size={14} className="text-[#1A6140]" />
                                                                <span className="text-[10px] font-black uppercase tracking-widest text-[#1A6140]">Auto-detected Email</span>
                                                            </div>
                                                            <p className="text-sm font-bold">{appData.email}</p>
                                                        </div>
                                                        <p className={`text-[11px] font-bold leading-relaxed ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                                                            This email was fetched from your connected account. Confirm it is correct to proceed.
                                                        </p>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => setAppStep(3)}
                                                                className={`flex-1 py-4 rounded-[20px] font-black text-xs uppercase tracking-[0.2em] transition-all border ${isLight ? 'border-black/10 text-black/60 hover:bg-black/5' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                                                            >
                                                                Back
                                                            </button>
                                                            <button
                                                                onClick={() => setAppStep(5)}
                                                                className="flex-1 py-4 rounded-[20px] bg-[#1A6140] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                                                            >
                                                                Confirm & Continue
                                                            </button>
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <input 
                                                            type="email" 
                                                            placeholder="you@email.com"
                                                            value={appData.email}
                                                            onChange={(e) => {
                                                                setAppData({...appData, email: e.target.value});
                                                                setOtpVerified(false);
                                                                setOtpSent(false);
                                                                setOtpError('');
                                                            }}
                                                            disabled={otpSent}
                                                            autoFocus
                                                            className={`w-full p-4 rounded-2xl text-sm font-bold outline-none border transition-all ${isLight ? 'bg-black/5 border-transparent text-black focus:border-[#1A6140]/40' : 'bg-white/5 border-white/5 text-white focus:border-[#1A6140]/40'}`}
                                                        />

                                                        {!otpSent ? (
                                                            <button
                                                                onClick={handleSendOtp}
                                                                disabled={isSendingOtp || !appData.email || !/\S+@\S+\.\S+/.test(appData.email)}
                                                                className="w-full py-4 rounded-[20px] bg-[#1A6140] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30"
                                                            >
                                                                {isSendingOtp ? 'Sending Code...' : 'Send Verification Code'}
                                                            </button>
                                                        ) : (
                                                            <>
                                                                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-black/5 border-transparent' : 'bg-white/5 border-white/5'}`}>
                                                                    <label className={`text-[10px] font-black uppercase tracking-widest block mb-2 ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                                                                        Enter 6-digit verification code
                                                                    </label>
                                                                    <input 
                                                                        type="text"
                                                                        maxLength={6}
                                                                        placeholder="000000"
                                                                        value={otpCode}
                                                                        onChange={(e) => {
                                                                            setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                                                                            setOtpError('');
                                                                        }}
                                                                        autoFocus
                                                                        className={`w-full p-4 rounded-2xl text-center text-2xl font-black tracking-[0.3em] outline-none border transition-all ${isLight ? 'bg-black/5 border-transparent text-black focus:border-[#1A6140]/40' : 'bg-white/5 border-white/5 text-white focus:border-[#1A6140]/40'}`}
                                                                    />
                                                                </div>

                                                                {otpError && (
                                                                    <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold text-center">
                                                                        {otpError}
                                                                    </div>
                                                                )}

                                                                <div className="flex gap-2">
                                                                    <button
                                                                        onClick={() => { setOtpSent(false); setOtpCode(''); setOtpError(''); }}
                                                                        className={`flex-1 py-4 rounded-[20px] font-black text-xs uppercase tracking-[0.2em] transition-all border ${isLight ? 'border-black/10 text-black/60 hover:bg-black/5' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                                                                    >
                                                                        Change Email
                                                                    </button>
                                                                    <button
                                                                        onClick={handleVerifyOtp}
                                                                        disabled={isVerifyingOtp || otpCode.length < 6}
                                                                        className="flex-1 py-4 rounded-[20px] bg-[#1A6140] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30"
                                                                    >
                                                                        {isVerifyingOtp ? 'Verifying...' : 'Verify Code'}
                                                                    </button>
                                                                </div>
                                                            </>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                        )}

                                        {/* Step 5: Copy Fee */}
                                        {appStep === 5 && (
                                            <div className="flex flex-col gap-4">
                                                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-black/5 border-transparent' : 'bg-white/5 border-white/5'}`}>
                                                    <label className={`text-[10px] font-black uppercase tracking-widest block mb-2 ${isLight ? 'text-black/50' : 'text-white/50'}`}>
                                                        Performance Fee (%)
                                                    </label>
                                                    <input 
                                                        type="number"
                                                        placeholder="2.5"
                                                        value={appData.fee}
                                                        onChange={(e) => {
                                                            let val = e.target.value;
                                                            if(val !== '') {
                                                                val = Number(val);
                                                                if(val > 5) val = 5;
                                                                if(val < 0) val = 0;
                                                            }
                                                            setAppData({...appData, fee: val});
                                                        }}
                                                        min="0"
                                                        max="5"
                                                        step="0.5"
                                                        autoFocus
                                                        className={`w-full p-4 rounded-2xl text-2xl font-black text-center outline-none border transition-all ${isLight ? 'bg-black/5 border-transparent text-black focus:border-[#1A6140]/40' : 'bg-white/5 border-white/5 text-white focus:border-[#1A6140]/40'}`}
                                                    />
                                                    <p className={`text-[10px] font-bold opacity-40 mt-2 text-center`}>Set between 0% and 5%</p>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => setAppStep(4)}
                                                        className={`flex-1 py-4 rounded-[20px] font-black text-xs uppercase tracking-[0.2em] transition-all border ${isLight ? 'border-black/10 text-black/60 hover:bg-black/5' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                                                    >
                                                        Back
                                                    </button>
                                                    <button
                                                        onClick={() => setAppStep(6)}
                                                        disabled={appData.fee === '' || Number(appData.fee) > 5}
                                                        className="flex-1 py-4 rounded-[20px] bg-[#1A6140] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30"
                                                    >
                                                        Review
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                )}

                                {/* Step 6: Review & Submit */}
                                {appStep === 6 && (
                                    <motion.div initial={{opacity:0, y:20}} animate={{opacity:1, y:0}} className="text-left w-full">
                                        <h2 className="text-lg font-black mb-4 text-center">Review Application</h2>
                                        
                                        <div className={`rounded-2xl border divide-y ${isLight ? 'border-[#1A6140]/15 bg-black/5 divide-black/5' : 'border-white/10 bg-white/[0.02] divide-white/5'} mb-6 overflow-hidden`}>
                                            {[
                                                { label: 'Name', value: appData.name },
                                                { label: 'Twitter', value: appData.twitter },
                                                { label: 'Telegram', value: appData.telegram },
                                                { label: 'Email', value: appData.email },
                                                { label: 'Copy Fee', value: `${appData.fee}%` },
                                            ].map((item, i) => (
                                                <div key={i} className="flex items-center justify-between px-4 py-3">
                                                    <span className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>{item.label}</span>
                                                    <span className="text-xs font-bold">{item.value}</span>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => setAppStep(5)}
                                                className={`flex-1 py-4 rounded-[20px] font-black text-xs uppercase tracking-[0.2em] transition-all border ${isLight ? 'border-black/10 text-black/60 hover:bg-black/5' : 'border-white/10 text-white/60 hover:bg-white/5'}`}
                                            >
                                                Back
                                            </button>
                                            <button 
                                                onClick={handleApply}
                                                disabled={isApplying}
                                                className="flex-1 py-4 rounded-[20px] bg-[#1A6140] text-white font-black text-xs uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                                            >
                                                {isApplying ? 'Submitting...' : 'Submit Application'}
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </div>
                        )}
                    </div>
                )}
                </div>
            </div>
            )}

            {/* Copy Settings Modal */}
            <AnimatePresence>
                {isCopyModalOpen && providerToCopy && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        exit={{ opacity: 0 }} 
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    >
                        <motion.div 
                            initial={{ scale: 0.95, y: 20 }} 
                            animate={{ scale: 1, y: 0 }} 
                            exit={{ scale: 0.95, y: 20 }} 
                            className={`w-full max-w-md p-6 rounded-[32px] border ${isLight ? 'bg-[#F2F7F4] border-[#1A6140]/20' : 'bg-[#0A0A0A] border-white/10'} shadow-2xl relative`}
                        >
                            <button 
                                onClick={() => setIsCopyModalOpen(false)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                                <X size={20} className={isLight ? 'text-black/40' : 'text-white/40'} />
                            </button>
                            
                            <h2 className="text-2xl font-black mb-2">Copy Settings</h2>
                            <p className="text-sm font-bold opacity-50 mb-6">Configure parameters for copying {providerToCopy.username}</p>

                            <div className="space-y-6 mb-8">
                                {/* Mode Selection */}
                                <div className={`flex gap-2 p-1 rounded-2xl border ${isLight ? 'bg-black/5 border-transparent' : 'bg-white/5 border-white/5'}`}>
                                    <button 
                                        onClick={() => setCopyParams({...copyParams, mode: 'isolated'})}
                                        className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${copyParams.mode === 'isolated' ? 'bg-[#1A6140] text-white shadow-md' : 'text-black/40 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                    >
                                        Isolated
                                    </button>
                                    <button 
                                        onClick={() => setCopyParams({...copyParams, mode: 'cross'})}
                                        className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${copyParams.mode === 'cross' ? 'bg-[#FF4444] text-white shadow-md' : 'text-black/40 dark:text-white/40 hover:bg-black/5 dark:hover:bg-white/5'}`}
                                    >
                                        Cross
                                    </button>
                                </div>

                                {copyParams.mode === 'isolated' && (
                                    <div>
                                        <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-2">Allocated Funds (USDC)</label>
                                        <p className="text-[10px] font-bold opacity-30 mb-3 leading-relaxed">Total maximum risk limit for this trader. Protects your main copy trading balance.</p>
                                        <input 
                                            type="number"
                                            placeholder="e.g. 500"
                                            value={copyParams.allocated}
                                            onChange={e => setCopyParams({...copyParams, allocated: e.target.value})}
                                            className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                        />
                                    </div>
                                )}

                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-2">Stake Per Trade (USDC)</label>
                                    <p className="text-[10px] font-bold opacity-30 mb-3 leading-relaxed">Amount placed for each individual trade copied.</p>
                                    <input 
                                        type="number"
                                        placeholder="e.g. 50"
                                        value={copyParams.stakePerTrade}
                                        onChange={e => setCopyParams({...copyParams, stakePerTrade: e.target.value})}
                                        className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                    />
                                </div>

                                {copyParams.mode === 'cross' && (
                                    <div className="p-4 rounded-xl bg-[#FF4444]/10 border border-[#FF4444]/20 flex items-start gap-3">
                                        <AlertCircle size={16} className="text-[#FF4444] shrink-0 mt-0.5" />
                                        <p className="text-[10px] font-bold text-[#FF4444]/80 leading-relaxed uppercase tracking-widest">
                                            Warning: Cross mode exposes your entire copy trading balance. Risk of full liquidation.
                                        </p>
                                    </div>
                                )}

                                <div className="p-4 rounded-xl bg-[#1A6140]/10 border border-[#1A6140]/20 flex flex-col gap-2">
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-[#1A6140]">Activation Fee</span>
                                        <span className="text-xs font-black text-[#1A6140]">1 USDC</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[9px] font-bold opacity-50 uppercase">
                                        <span>Provider Share</span>
                                        <span>0.5 USDC</span>
                                    </div>
                                    <div className="flex justify-between items-center text-[9px] font-bold opacity-50 uppercase">
                                        <span>Protocol Share</span>
                                        <span>0.5 USDC</span>
                                    </div>
                                </div>
                            </div>

                            <button 
                                onClick={async () => {
                                    if(!profile?.copyTradingWallet) {
                                        setCopyResult({ type: 'fail', message: 'No copy trading wallet' });
                                        setTimeout(() => setCopyResult(null), 2500);
                                        return;
                                    }
                                    if(copyParams.mode === 'isolated' && !copyParams.allocated) { setCopyResult({ type: 'fail', message: 'Specify allocated funds' }); setTimeout(() => setCopyResult(null), 2500); return; }
                                    if(!copyParams.stakePerTrade) { setCopyResult({ type: 'fail', message: 'Specify stake per trade' }); setTimeout(() => setCopyResult(null), 2500); return; }

                                    try {
                                        const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/activate`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({
                                                investorAddress: address,
                                                providerAddress: providerToCopy.address,
                                                mode: copyParams.mode,
                                                allocated: copyParams.allocated,
                                                stakePerTrade: copyParams.stakePerTrade
                                            })
                                        });
                                        const data = await res.json();
                                        if (res.ok && data.success) {
                                            setCopyResult({ type: 'success', message: `Copied ${providerToCopy.username}!` });
                                            setIsCopyModalOpen(false);
                                            setCopyParams({ mode: 'isolated', allocated: '', stakePerTrade: '' });
                                            // Immediately update local metrics
                                            setCopyWalletBalance(parseFloat(data.newBalance));
                                            if (copyParams.mode === 'isolated' && copyParams.allocated) {
                                                const prev = parseFloat(localAllocated !== null ? localAllocated : (profile?.copyTradingAllocated || 0));
                                                setLocalAllocated(prev + parseFloat(copyParams.allocated));
                                            }
                                            // Refresh copies
                                            fetchInvestorCopies();
                                            fetchCopyWallet();
                                            setTimeout(() => setCopyResult(null), 2500);
                                        } else {
                                            setCopyResult({ type: 'fail', message: data.error || 'Activation failed' });
                                            setTimeout(() => setCopyResult(null), 2500);
                                        }
                                    } catch (e) {
                                        setCopyResult({ type: 'fail', message: 'Network error' });
                                        setTimeout(() => setCopyResult(null), 2500);
                                    }
                                }}
                                className="w-full py-5 rounded-[24px] bg-[#1A6140] text-white font-black text-sm uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                Confirm & Activate
                            </button>
                        </motion.div>
                    </motion.div>
                )}

                {/* Success/Fail Animation Overlay */}
                {copyResult && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ scale: 0.5, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.5, opacity: 0 }}
                            transition={{ type: 'spring', damping: 15, stiffness: 200 }}
                            className="flex flex-col items-center gap-3"
                        >
                            <motion.div
                                initial={{ scale: 0, rotate: -180 }}
                                animate={{ scale: 1, rotate: 0 }}
                                transition={{ type: 'spring', damping: 10, stiffness: 150, delay: 0.1 }}
                            >
                                {copyResult.type === 'success' ? (
                                    <div className="w-16 h-16 rounded-full bg-[#1A6140] flex items-center justify-center shadow-2xl">
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <motion.path
                                                initial={{ pathLength: 0 }}
                                                animate={{ pathLength: 1 }}
                                                transition={{ duration: 0.4, delay: 0.2 }}
                                                d="M20 6L9 17l-5-5"
                                            />
                                        </svg>
                                    </div>
                                ) : (
                                    <div className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center shadow-2xl">
                                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                            <motion.path
                                                initial={{ pathLength: 0, opacity: 0 }}
                                                animate={{ pathLength: 1, opacity: 1 }}
                                                transition={{ duration: 0.2, delay: 0.3 }}
                                                d="M15 9l-6 6M9 9l6 6"
                                            />
                                        </svg>
                                    </div>
                                )}
                            </motion.div>
                            <motion.p
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className="text-white/90 font-bold text-sm text-center"
                            >
                                {copyResult.message}
                            </motion.p>
                        </motion.div>
                    </motion.div>
                )}

                {/* Copy Trading Deposit Modal */}
                {showCopyDepositModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className={`w-full max-w-md p-6 rounded-[32px] border ${isLight ? 'bg-[#F2F7F4] border-[#1A6140]/20' : 'bg-[#0A0A0A] border-white/10'} shadow-2xl relative`}
                        >
                            <button
                                onClick={() => setShowCopyDepositModal(false)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                                <X size={20} className={isLight ? 'text-black/40' : 'text-white/40'} />
                            </button>

                            <h2 className="text-2xl font-black mb-2">Deposit to Copy Trading</h2>
                            <p className="text-sm font-bold opacity-50 mb-6">Move funds from your trading wallet to your copy trading wallet</p>

                            <div className="space-y-4 mb-8">
                                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-black/5 border-transparent' : 'bg-white/5 border-white/5'}`}>
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">Copy Trading Balance</p>
                                    <p className="text-xl font-black">{copyWalletBalance.toFixed(2)} USDC</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-2">Amount (USDC)</label>
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        value={copyTransferAmount}
                                        onChange={e => setCopyTransferAmount(e.target.value)}
                                        className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                    />
                                </div>
                            </div>

                            <button
                                onClick={async () => {
                                    const amt = parseFloat(copyTransferAmount);
                                    if (!amt || amt <= 0) return;
                                    setIsCopyTransferring(true);
                                    try {
                                        const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/deposit`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ address: address.toLowerCase(), amount: amt })
                                        });
                                        const data = await res.json();
                                        if (res.ok && data.success) {
                                            setCopyResult({ type: 'success', message: `Deposited ${amt} USDC` });
                                            setCopyWalletBalance(data.newBalance);
                                            setShowCopyDepositModal(false);
                                            setCopyTransferAmount('');
                                            setTimeout(() => setCopyResult(null), 2500);
                                        } else {
                                            setCopyResult({ type: 'fail', message: data.error || 'Deposit failed' });
                                            setTimeout(() => setCopyResult(null), 2500);
                                        }
                                    } catch (e) {
                                        setCopyResult({ type: 'fail', message: 'Network error' });
                                        setTimeout(() => setCopyResult(null), 2500);
                                    } finally {
                                        setIsCopyTransferring(false);
                                    }
                                }}
                                disabled={!copyTransferAmount || parseFloat(copyTransferAmount) <= 0 || isCopyTransferring}
                                className="w-full py-5 rounded-[24px] bg-[#1A6140] text-white font-black text-sm uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30"
                            >
                                {isCopyTransferring ? 'Processing...' : 'Confirm Deposit'}
                            </button>
                        </motion.div>
                    </motion.div>
                )}

                {/* Copy Trading Withdraw Modal */}
                {showCopyWithdrawModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className={`w-full max-w-md p-6 rounded-[32px] border ${isLight ? 'bg-[#F2F7F4] border-[#1A6140]/20' : 'bg-[#0A0A0A] border-white/10'} shadow-2xl relative`}
                        >
                            <button
                                onClick={() => setShowCopyWithdrawModal(false)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                                <X size={20} className={isLight ? 'text-black/40' : 'text-white/40'} />
                            </button>

                            <h2 className="text-2xl font-black mb-2">Withdraw from Copy Trading</h2>
                            <p className="text-sm font-bold opacity-50 mb-6">Move funds back to your trading wallet</p>

                            <div className="space-y-4 mb-8">
                                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-black/5 border-transparent' : 'bg-white/5 border-white/5'}`}>
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">Available Balance</p>
                                    <p className="text-xl font-black">{copyWalletBalance.toFixed(2)} USDC</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-2">Amount (USDC)</label>
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        value={copyTransferAmount}
                                        onChange={e => setCopyTransferAmount(e.target.value)}
                                        max={copyWalletBalance}
                                        className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                    />
                                </div>
                            </div>

                            <button
                                onClick={async () => {
                                    const amt = parseFloat(copyTransferAmount);
                                    if (!amt || amt <= 0 || amt > copyWalletBalance) return;
                                    setIsCopyTransferring(true);
                                    try {
                                        const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/withdraw`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ address: address.toLowerCase(), amount: amt })
                                        });
                                        const data = await res.json();
                                        if (res.ok && data.success) {
                                            setCopyResult({ type: 'success', message: `Withdrew ${amt} USDC` });
                                            setCopyWalletBalance(data.newBalance);
                                            setShowCopyWithdrawModal(false);
                                            setCopyTransferAmount('');
                                            setTimeout(() => setCopyResult(null), 2500);
                                        } else {
                                            setCopyResult({ type: 'fail', message: data.error || 'Withdrawal failed' });
                                            setTimeout(() => setCopyResult(null), 2500);
                                        }
                                    } catch (e) {
                                        setCopyResult({ type: 'fail', message: 'Network error' });
                                        setTimeout(() => setCopyResult(null), 2500);
                                    } finally {
                                        setIsCopyTransferring(false);
                                    }
                                }}
                                disabled={!copyTransferAmount || parseFloat(copyTransferAmount) <= 0 || parseFloat(copyTransferAmount) > copyWalletBalance || isCopyTransferring}
                                className="w-full py-5 rounded-[24px] bg-[#1A6140] text-white font-black text-sm uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30"
                            >
                                {isCopyTransferring ? 'Processing...' : 'Confirm Withdrawal'}
                            </button>
                        </motion.div>
                    </motion.div>
                )}

                {/* Withdrawal Modal */}
                {showWithdrawModal && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    >
                        <motion.div
                            initial={{ scale: 0.95, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.95, y: 20 }}
                            className={`w-full max-w-md p-6 rounded-[32px] border ${isLight ? 'bg-[#F2F7F4] border-[#1A6140]/20' : 'bg-[#0A0A0A] border-white/10'} shadow-2xl relative`}
                        >
                            <button
                                onClick={() => setShowWithdrawModal(false)}
                                className="absolute top-6 right-6 p-2 rounded-full hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                            >
                                <X size={20} className={isLight ? 'text-black/40' : 'text-white/40'} />
                            </button>

                            <h2 className="text-2xl font-black mb-2">Withdraw</h2>
                            <p className="text-sm font-bold opacity-50 mb-6">Withdraw portfolio earnings to your main wallet</p>

                            <div className="space-y-4 mb-8">
                                <div className={`p-4 rounded-2xl border ${isLight ? 'bg-black/5 border-transparent' : 'bg-white/5 border-white/5'}`}>
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-40 mb-1">Available Balance</p>
                                    <p className="text-xl font-black">{portfolioBalance.toFixed(2)} USDC</p>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-40 block mb-2">Amount (USDC)</label>
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        value={withdrawAmount}
                                        onChange={e => setWithdrawAmount(e.target.value)}
                                        max={portfolioBalance}
                                        className={`w-full p-4 rounded-xl text-sm font-bold outline-none border ${isLight ? 'bg-black/5 border-transparent text-black' : 'bg-white/5 border-white/5 text-white'}`}
                                    />
                                </div>
                            </div>

                            <button
                                onClick={async () => {
                                    const amt = parseFloat(withdrawAmount);
                                    if (!amt || amt <= 0 || amt > portfolioBalance) return;
                                    setIsWithdrawing(true);
                                    try {
                                        const res = await fetch(`${KEEPER_URL_ARC}/copy-trading/providers/${address.toLowerCase()}/withdraw`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ amount: amt, targetAddress: address })
                                        });
                                        const data = await res.json();
                                        if (res.ok && data.success) {
                                            setCopyResult({ type: 'success', message: `Withdrew ${amt} USDC` });
                                            setPortfolioBalance(data.newBalance);
                                            setPortfolioWallet(prev => prev ? { ...prev, balance: data.newBalance } : null);
                                            setShowWithdrawModal(false);
                                            setWithdrawAmount('');
                                            setTimeout(() => setCopyResult(null), 2500);
                                        } else {
                                            setCopyResult({ type: 'fail', message: data.error || 'Withdrawal failed' });
                                            setTimeout(() => setCopyResult(null), 2500);
                                        }
                                    } catch (e) {
                                        setCopyResult({ type: 'fail', message: 'Network error' });
                                        setTimeout(() => setCopyResult(null), 2500);
                                    } finally {
                                        setIsWithdrawing(false);
                                    }
                                }}
                                disabled={!withdrawAmount || parseFloat(withdrawAmount) <= 0 || parseFloat(withdrawAmount) > portfolioBalance || isWithdrawing}
                                className="w-full py-5 rounded-[24px] bg-[#1A6140] text-white font-black text-sm uppercase tracking-[0.2em] shadow-[0_10px_30px_-10px_rgba(26, 97, 64,0.4)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-30"
                            >
                                {isWithdrawing ? 'Processing...' : 'Confirm Withdrawal'}
                            </button>
                        </motion.div>
                    </motion.div>
                )}

            </AnimatePresence>

            {/* Trader Settings Modal */}
            <AnimatePresence>
                {showTraderSettings && (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                        onClick={() => setShowTraderSettings(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            onClick={e => e.stopPropagation()}
                            className={`w-full max-w-sm p-6 rounded-[32px] border ${isLight ? 'bg-[#F2F7F4] border-[#1A6140]/20' : 'bg-[#0A0A0A] border-white/10'} shadow-2xl`}
                        >
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-lg font-black">Settings</h2>
                                <button onClick={() => setShowTraderSettings(false)} className={`p-2 rounded-full ${isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'} transition-colors`}>
                                    <X size={16} className="opacity-40" />
                                </button>
                            </div>

                            <div className="space-y-3">
                                <button
                                    onClick={() => { setShowTraderSettings(false); setWithdrawAmount(''); setShowWithdrawModal(true); }}
                                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all active:scale-[0.98] ${isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/10 hover:bg-white/5'}`}
                                >
                                    <div className={`p-2.5 rounded-xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                        <Wallet size={18} className="opacity-60" />
                                    </div>
                                    <div className="text-left">
                                        <div className={`text-sm font-black ${isLight ? 'text-black/80' : 'text-white'}`}>Withdraw Funds</div>
                                        <div className={`text-[10px] font-bold opacity-40`}>Withdraw from your portfolio wallet</div>
                                    </div>
                                </button>

                                <button
                                    onClick={() => { setShowTraderSettings(false); exportTradeHistory(); }}
                                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border transition-all active:scale-[0.98] ${isLight ? 'border-black/10 hover:bg-black/5' : 'border-white/10 hover:bg-white/5'}`}
                                >
                                    <div className={`p-2.5 rounded-xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                        <Download size={18} className="opacity-60" />
                                    </div>
                                    <div className="text-left">
                                        <div className={`text-sm font-black ${isLight ? 'text-black/80' : 'text-white'}`}>Export Trade History</div>
                                        <div className={`text-[10px] font-bold opacity-40`}>Download as branded PDF report</div>
                                    </div>
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Mobile Bottom Pane */}
            {mode === 'investor' ? mobilePane(true) : mode === 'trader' ? mobilePane(false) : null}

        </motion.div>

        <style>{`
            @keyframes gradientShift {
                0% { background-position: 50% 0%; }
                50% { background-position: 50% 100%; }
                100% { background-position: 50% 0%; }
            }
            .animate-gradient {
                background-size: 200% 200%;
                animation: gradientShift 3s ease infinite;
            }
        `}</style>
    </>);
}
