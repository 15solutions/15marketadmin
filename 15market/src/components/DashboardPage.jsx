import React, { useEffect, useState, useMemo, useRef, useCallback } from "react";
import { toPng } from 'html-to-image';
import * as ethers from "ethers";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount } from "wagmi";
import { Check, Trophy, Activity, DollarSign, Award, Target, BarChart2, User, Settings, ArrowLeft, ArrowRight, ArrowDown, ArrowUp, TrendingUp, TrendingDown, Zap, Shield, Globe, MessageSquare, AlertCircle, Copy, RotateCw, ChevronRight, ChevronLeft, Nfc, Send, ArrowDownLeft, Wallet, Bell, Megaphone, Calendar, ChevronDown, ChevronUp, Smile, Coins, RefreshCcw, BookOpen, Share2, Mail, Download, X, Menu, Bot } from "lucide-react";
import MessagingSystem from "./MessagingSystem";
import CampaignLeaderboardPane from "./CampaignLeaderboardPane";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, AreaChart, Area, ReferenceLine } from 'recharts';
import { LatencyMeter } from "./LatencyMeter";
import ArcABI from "../abi/ArcPrediction.json";
import { KEEPER_URL_ARC, ARC_CONTRACT_ADDRESS, ARC_RPC, KEEPER_URL_ROUNDS, ADMIN_TOKEN } from "../constants";
import { socketService } from "../utils/socket";
import { parseEther } from "viem";
import GlobalLoader from "./GlobalLoader";
import { useCreateWallet, usePrivy, useWallets } from '@privy-io/react-auth';

// ─── Animate-UI Style: Framer Motion Animated Icon Wrappers ──────────────────
// Each icon has a unique, semantically-appropriate looping micro-animation.
// Inspired by animate-ui.com's approach of wrapping Lucide icons with Framer Motion.

const AnimatedBook = ({ size = 16, className = '' }) => (
    <motion.div
        animate={{ scale: [1, 1.12, 0.96, 1.04, 1], rotate: [0, -6, 6, -3, 0] }}
        transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 3.5, ease: 'easeInOut' }}
        style={{ display: 'inline-flex' }}
    >
        <BookOpen size={size} className={className} />
    </motion.div>
);

const AnimatedBell = ({ size = 16, className = '' }) => (
    <motion.div
        animate={{ rotate: [0, 18, -18, 12, -12, 6, -6, 0], y: [0, -1, 0] }}
        transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 3.5, ease: 'easeInOut' }}
        style={{ display: 'inline-flex', transformOrigin: 'top center' }}
    >
        <Bell size={size} className={className} />
    </motion.div>
);

const AnimatedTrophy = ({ size = 16, className = '' }) => (
    <motion.div
        initial={{ y: 0, scale: 1 }}
        animate={{ y: [0, -4, 0, -2, 0], scale: [1, 1.08, 1, 1.04, 1] }}
        transition={{ duration: 2.2, repeat: 0, ease: 'easeInOut' }}
        style={{ display: 'inline-flex' }}
    >
        <Trophy size={size} className={className} />
    </motion.div>
);

const AnimatedSend = ({ size = 15, className = '' }) => (
    <motion.div
        initial={{ x: 0, y: 0, rotate: 0 }}
        animate={{ x: [0, 3, 0, -1, 0], y: [0, -3, 0, 1, 0], rotate: [0, 5, 0] }}
        transition={{ duration: 2.0, repeat: 0, ease: 'easeInOut' }}
        style={{ display: 'inline-flex' }}
    >
        <Send size={size} className={className} />
    </motion.div>
);

const AnimatedSettings = ({ size = 13, className = '' }) => (
    <motion.div
        animate={{ rotate: [0, 60, 120, 180, 240, 300, 360] }}
        transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        style={{ display: 'inline-flex' }}
    >
        <Settings size={size} className={className} />
    </motion.div>
);

const AnimatedBarChart = ({ size = 14, className = '' }) => (
    <motion.div
        animate={{ scaleY: [1, 1.3, 0.85, 1.15, 1], scaleX: [1, 0.95, 1.05, 0.98, 1] }}
        transition={{ duration: 2.0, repeat: Infinity, repeatDelay: 1.5, ease: 'easeInOut' }}
        style={{ display: 'inline-flex', transformOrigin: 'bottom' }}
    >
        <BarChart2 size={size} className={className} />
    </motion.div>
);

const AnimatedSmile = ({ size = 14, className = '' }) => (
    <motion.div
        animate={{ y: [0, -4, 0], rotate: [0, 8, -8, 0], scale: [1, 1.12, 1] }}
        transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 2.4, ease: 'easeInOut' }}
        style={{ display: 'inline-flex' }}
    >
        <Smile size={size} className={className} />
    </motion.div>
);

const AnimatedTarget = ({ size = 14, className = '' }) => (
    <motion.div
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
        style={{ display: 'inline-flex' }}
    >
        <Target size={size} className={className} />
    </motion.div>
);

const AnimatedCoins = ({ size = 14, className = '' }) => (
    <motion.div
        animate={{ y: [0, -5, 0, -2, 0], rotate: [0, -8, 8, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 1.8, repeat: Infinity, repeatDelay: 2.2, ease: 'easeInOut' }}
        style={{ display: 'inline-flex' }}
    >
        <Coins size={size} className={className} />
    </motion.div>
);

const AnimatedTrendingUp = ({ size = 14, className = '' }) => (
    <motion.div
        animate={{ x: [0, 3, 0], y: [0, -3, 0], scale: [1, 1.1, 1] }}
        transition={{ duration: 2.0, repeat: Infinity, repeatDelay: 2.5, ease: 'easeInOut' }}
        style={{ display: 'inline-flex' }}
    >
        <TrendingUp size={size} className={className} />
    </motion.div>
);

const AnimatedRefresh = ({ size = 12, className = '' }) => (
    <motion.div
        animate={{ rotate: [0, 360] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        style={{ display: 'inline-flex' }}
    >
        <RefreshCcw size={size} className={className} />
    </motion.div>
);
const AnimatedZap = ({ size = 14, className = '' }) => (
    <motion.div
        animate={{ scale: [1, 1.3, 0.9, 1.2, 1], opacity: [1, 0.7, 1, 0.85, 1], rotate: [0, -8, 8, -4, 0] }}
        transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2.0, ease: 'easeInOut' }}
        style={{ display: 'inline-flex' }}
    >
        <Zap size={size} className={className} />
    </motion.div>
);
// ─────────────────────────────────────────────────────────────────────────────

// Count-up animation hook — animates a number from 0 to target on change
function useCountUp(target, duration = 1400) {
    const [value, setValue] = useState(0);
    useEffect(() => {
        if (target === 0 || target == null) { setValue(0); return; }
        let startTime = null;
        let rafId;
        const animate = (ts) => {
            if (!startTime) startTime = ts;
            const p = Math.min((ts - startTime) / duration, 1);
            const eased = 1 - Math.pow(1 - p, 4);
            setValue(target * eased);
            if (p < 1) { rafId = requestAnimationFrame(animate); }
        };
        rafId = requestAnimationFrame(animate);
        return () => { if (rafId) cancelAnimationFrame(rafId); };
    }, [target]);
    return value;
}

export function DashboardPage({ onBack, onAdmin, sessionBalance, evmBalance, onDeposit, onWithdraw, treasuryBalance,
    autoSignerFees,
    userProfile,
    theme,
    isSmallScreen,
    evmSessionWallet,
    isSignerInitializing,
    onRetryInit,
    transactionHistory,
    onViewReceipt,
    uiVersion,
    setUiVersion,
    onOpenCircleWallet,
    onCampaign,
    onTransferHub,
    onDocs
}) {
    const isLight = theme === 'light';
    const { isConnected, address, connector } = useAccount();
    const { wallets } = useWallets();
    // Wallet model: a "main" wallet exists ONLY for external connections.
    // Email/Google/Discord users get the trading wallet alone. Privy embedded
    // wallets (walletClientType 'privy') never count, whichever layer reports.
    const hasExternalWallet = (wallets || []).some(w => w.walletClientType && w.walletClientType !== 'privy')
        || (isConnected && !!address && !/privy/i.test(String(connector?.id || connector?.name || '')));
    const { createWallet } = useCreateWallet();
    const { user, linkDiscord, unlinkDiscord } = usePrivy();
    const [selectedWallet, setSelectedWallet] = useState('trading');

    const [stats, setStats] = useState({
        userWinRate: 0,
        userTotalTrades: 0,
        userTotalWins: 0,
        marketSentiment: 50,
        marketAvgStake: 0,
        marketTotalVol: 0,
        bullsInfo: 0,
        bearsInfo: 0,
        recentTrades: []
    });
    const [userHistory, setUserHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [localWithdrawAmount, setLocalWithdrawAmount] = useState("");
    const [modalConfig, setModalConfig] = useState(null); // { title: string, message: string, onConfirm: function }
    const [promptConfig, setPromptConfig] = useState(null); // { title: string, placeholder: string, onConfirm: function }
    const [promptValue, setPromptValue] = useState("");

    const [isSyncing, setIsSyncing] = useState(false);
    const [campaigns, setCampaigns] = useState([]);
    const [activeCampaignLeaderboard, setActiveCampaignLeaderboard] = useState([]);
    const [selectedCampaignId, setSelectedCampaignId] = useState(null);
    const [toast, setToast] = useState(null);
    const [enrolling, setEnrolling] = useState(false);
    const [enrollments, setEnrollments] = useState({});
    const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
    const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);
    const [newUsername, setNewUsername] = useState("");
    const [isEditingUsername, setIsEditingUsername] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [isProfileCardOpen, setIsProfileCardOpen] = useState(false);
    const [walletCardSide, setWalletCardSide] = useState('trading'); // which card of the deck is showing
    const touchStartXRef = useRef(null); // swipe navigation for the card deck
    const deckRef = useRef(null); // wallet card deck box (for fit-to-screen scaling)
    const [deckScale, setDeckScale] = useState(1);

    // The deck is designed on a fixed 448 × 260 canvas; measure its box and
    // scale the whole canvas down uniformly so it always fits the screen.
    useEffect(() => {
        const el = deckRef.current;
        if (!el) return;
        const applyScale = () => setDeckScale(Math.min(1, el.clientWidth / 448));
        applyScale();
        const ro = new ResizeObserver(applyScale);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const [linkedEmail, setLinkedEmail] = useState(userProfile?.email || '');
    const [isSavingEmail, setIsSavingEmail] = useState(false);

    const handleClearNotifications = async () => {
        setNotifications([]);
        if (address) {
            try {
                await fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ notifications: [] })
                });
            } catch (e) {
                console.error("Failed to clear notifications:", e);
            }
        }
    };

    // Auto-sync Privy email/google email to backend profile if not already set
    useEffect(() => {
        if (address && user && !userProfile?.email) {
            const emailToLink = user?.email?.address || user?.google?.email;
            if (emailToLink) {
                fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: emailToLink })
                }).then(res => {
                    if (res.ok) {
                        setLinkedEmail(emailToLink);
                    }
                }).catch(e => console.error('Failed to auto-link email:', e));
            }
        }
    }, [address, user, userProfile?.email]);

    // Handle Discord OAuth Callback
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        
        if (code && address) {
            fetch(`${KEEPER_URL_ARC}/auth/discord`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code, address })
            })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    window.history.replaceState({}, document.title, window.location.pathname);
                    setToast("Discord Linked Successfully!");
                    setTimeout(() => window.location.reload(), 1000);
                }
            })
            .catch(e => console.error('Failed to link discord:', e));
        }
    }, [address]);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;
    const fileInputRef = React.useRef(null);
    const profileCardRef = useRef(null);

    // Derived stats computed strictly from active/settled user history for per-user accuracy
    const derivedStats = useMemo(() => {
        const totalTrades = userHistory.length;
        const totalWins = userHistory.filter(t => t.won || t.status === 'WON' || t.status?.toUpperCase() === 'SUCCESS').length;
        const winRate = totalTrades > 0 ? ((totalWins / totalTrades) * 100) : 0;

        // Sentiment: User's own bet directions (UP vs DOWN)
        const bulls = userHistory.filter(t => {
            const dirStr = String(t.direction || '').toUpperCase();
            return dirStr.includes("UP") || t.direction === 1 || String(t.direction) === '1';
        }).length;
        const bears = totalTrades - bulls;
        const sentimentRatio = totalTrades > 0 ? Math.round((bulls / totalTrades) * 100) : 50;
        const sentimentText = totalTrades > 0 ? (bulls > bears ? 'BULLISH' : bulls < bears ? 'BEARISH' : 'NEUTRAL') : 'NEUTRAL';

        // 24H Volume
        const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
        const trades24h = userHistory.filter(t => (t.timestamp || t.createdAt || Date.now()) >= oneDayAgo);
        const volume24h = trades24h.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const totalVolume = userHistory.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);

        // Average Stake
        const avgStake = totalTrades > 0 ? (totalVolume / totalTrades) : 0;

        return {
            winRate,
            sentimentRatio,
            sentimentText,
            volume24h,
            avgStake,
            totalTrades,
            totalWins
        };
    }, [userHistory]);

    // Count-up animated display values for premium feel
    const animWinRate   = useCountUp(derivedStats.winRate);
    const animSentiment = useCountUp(derivedStats.sentimentRatio);
    const animVolume    = useCountUp(derivedStats.volume24h);
    const animAvgStake  = useCountUp(derivedStats.avgStake);

    const handleAvatarUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate type (JPEG, JPG, PNG, GIF)
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
        if (!validTypes.includes(file.type)) {
            setToast("Only JPEG, JPG, PNG, and GIF allowed");
            return;
        }

        // Limit size to 1MB to prevent large Redis payloads
        if (file.size > 1024 * 1024) {
            setToast("Image too large (Max 1MB)");
            return;
        }

        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result;
            try {
                const res = await fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ avatar: base64String })
                });
                if (res.ok) {
                    setToast("Avatar Updated!");
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    const data = await res.json();
                    setToast(data.error || "Upload Failed");
                }
            } catch (e) {
                setToast("Upload Failed");
            }
        };
        reader.readAsDataURL(file);
    };

    const paginatedHistory = useMemo(() => {
        const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
        return userHistory.slice(startIndex, startIndex + ITEMS_PER_PAGE);
    }, [userHistory, currentPage]);

    const totalPages = Math.ceil(userHistory.length / ITEMS_PER_PAGE);

    const hasActiveCampaign = useMemo(() => {
        return campaigns.some(c => enrollments[c.id] && Date.now() >= c.startTime);
    }, [campaigns, enrollments]);

    // Auto-select active enrolled campaign
    useEffect(() => {
        if (!selectedCampaignId && campaigns.length > 0) {
            const activeEnrolled = campaigns.find(c => enrollments[c.id] && Date.now() >= c.startTime);
            if (activeEnrolled) {
                setSelectedCampaignId(activeEnrolled.id);
            }
        }
    }, [campaigns, enrollments, selectedCampaignId]);

    // Fetch Data
    useEffect(() => {
        fetchMetrics();
        const interval = setInterval(fetchMetrics, 20000); // Poll every 20s — analytics data is not real-time
        return () => clearInterval(interval);
    }, [address]);

    // Listen to live notifications from Socket.io for instant feedback
    useEffect(() => {
        if (!address) return;
        
        const handleNotif = (notif) => {
            console.log("[DashboardPage] New socket notification received:", notif);
            setNotifications(prev => [notif, ...prev]);
            
            // Trigger a beautiful notification toast alert
            setToast(`🔔 ${notif.title}: ${notif.message}`);
        };

        socketService.on('notification', handleNotif);
        
        return () => {
            socketService.off('notification', handleNotif);
        };
    }, [address]);

    const fetchMetrics = async () => {
        try {
            // AUTHORITATIVE BACKEND METRICS
            if (address) {
                const res = await fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data) {
                        if (data.stats) {
                            setStats(prev => ({
                                ...prev,
                                userWinRate: data.stats.totalTrades > 0 ? ((data.stats.totalWins / data.stats.totalTrades) * 100).toFixed(1) : 0,
                                userTotalTrades: data.stats.totalTrades || 0,
                                userTotalWins: data.stats.totalWins || 0
                            }));
                        }
                        // Populate trade history for PnL graph
                        if (Array.isArray(data.trades)) {
                            setUserHistory(data.trades);
                        }
                        // Populate notifications
                        if (Array.isArray(data.notifications)) {
                            setNotifications(data.notifications);
                        }
                    }
                }
            }

            // AUTHORITATIVE GLOBAL METRICS
            const globalRes = await fetch(`${KEEPER_URL_ARC}/stats/global`);
            if (globalRes.ok) {
                const globalData = await globalRes.json();
                setStats(prev => ({
                    ...prev,
                    marketSentiment: globalData.bullBearRatio || 50,
                    sentiment: globalData.sentiment || 'NEUTRAL',
                    marketAvgStake: globalData.avgStake || "0.000",
                    marketTotalVol: globalData.totalVolume || "0.000",
                    activeTraders: globalData.activeTraders || 0,
                    bullsInfo: globalData.bullsInfo || 0,
                    bearsInfo: globalData.bearsInfo || 0,
                    recentTrades: globalData.recentTrades || []
                }));
            }

            setIsLoading(false);
        } catch (e) {
            console.error("Dashboard Sync Error:", e);
            setIsLoading(false);
        }
    };

    const fetchCampaigns = async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/campaigns`);
            if (!res.ok) return;
            const data = await res.json();
            setCampaigns(data);

            if (address && data.length > 0) {
                const newEnrollments = {};
                for (const c of data) {
                   const eRes = await fetch(`${KEEPER_URL_ARC}/enroll?campaignId=${c.id}&address=${address}`);
                   if (eRes.ok) {
                       const eData = await eRes.json();
                       newEnrollments[c.id] = eData.enrolled;
                   }
                }
                setEnrollments(newEnrollments);
            }
        } catch (e) {}
    };

    const fetchActiveLeaderboard = async () => {
        if (!selectedCampaignId) return;
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/leaderboard?campaignId=${selectedCampaignId}`);
            if (!res.ok) return;
            const data = await res.json();
            setActiveCampaignLeaderboard(data);
        } catch (e) {}
    };

    useEffect(() => {
        fetchCampaigns();
        const interval = setInterval(fetchCampaigns, 15000);
        
        const handleNewCampaign = () => fetchCampaigns();
        socketService.on('new_campaign', handleNewCampaign);
        
        return () => {
            clearInterval(interval);
            socketService.off('new_campaign', handleNewCampaign);
        };
    }, [address]);

    useEffect(() => {
        if (selectedCampaignId) {
            fetchActiveLeaderboard();
            const interval = setInterval(fetchActiveLeaderboard, 5000);
            return () => clearInterval(interval);
        }
    }, [selectedCampaignId]);

    const handleEnroll = async (cid) => {
        if (!address) return;
        setEnrolling(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/enroll`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ campaignId: cid, address })
            });

            if (res.ok) {
                setEnrollments(prev => ({ ...prev, [cid]: true }));
                if (!selectedCampaignId) setSelectedCampaignId(cid);
            }
        } catch (e) {} finally { setEnrolling(false); }
    };

    // Cumulative PnL stats derived from authoritative backend trade history
    const pnlStats = useMemo(() => {
        const trades = [...userHistory]
            .filter(t => t && (t.status || t.won !== undefined))
            .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

        let allTimeProfit = 0;
        let allTimeLoss = 0;
        const chartPoints = [{ i: 0, pnl: 0, pnlPos: 0, pnlNeg: 0 }];

        trades.forEach((t, index) => {
            const isWon = t.status?.toUpperCase() === 'WON' || t.status?.toUpperCase() === 'SUCCESS' || t.won === true;
            const amt = parseFloat(t.amount || 0);
            const duration = t.duration || 15;
            const multiplier = duration === 5 ? 2.90 : duration === 10 ? 2.40 : 1.90;
            const payout = t.payout ? parseFloat(t.payout) : (amt * multiplier);
            let pv = 0;
            if (isWon) {
                const netProfit = payout - amt;
                pv = parseFloat(netProfit.toFixed(4));
                allTimeProfit += netProfit;
            } else {
                pv = parseFloat((-amt).toFixed(4));
                allTimeLoss += amt;
            }
            chartPoints.push({ i: index + 1, pnl: pv, pnlPos: Math.max(pv, 0), pnlNeg: Math.min(pv, 0) });
        });

        const hasTrades = chartPoints.length > 1;
        // Keep the absolute range to at least 5.0 to avoid small fluctuations spreading radically
        const maxAbs = Math.max(...chartPoints.map(d => Math.abs(d.pnl)), 5.0);
        const netPnl = allTimeProfit - allTimeLoss;

        const finalChartData = hasTrades ? chartPoints : [{ i: 0, pnl: 0, pnlPos: 0, pnlNeg: 0 }, { i: 1, pnl: 0, pnlPos: 0, pnlNeg: 0 }];
        const finalMaxAbs = hasTrades ? maxAbs : 5.0;
        const pValues = finalChartData.map(d => d.pnl);
        const maxVal = Math.max(...pValues, 0.001);
        const minVal = Math.min(...pValues, -0.001);
        return { chartData: finalChartData, maxAbs: finalMaxAbs, allTimeProfit, allTimeLoss, netPnl, maxVal, minVal, hasTrades };
    }, [userHistory]);

    const animNetPnl = useCountUp(pnlStats.netPnl || 0);

    const maxVal = pnlStats.maxVal;
    const minVal = pnlStats.minVal;
    let strokeOffset = 0.5;
    if (maxVal > 0 && minVal < 0) {
        strokeOffset = maxVal / (maxVal - minVal);
    } else if (maxVal <= 0) {
        strokeOffset = 0;
    } else if (minVal >= 0) {
        strokeOffset = 1;
    }
    const strokeOffsetPercent = `${strokeOffset * 100}%`;

    const truncate = (str) => str ? `${str.slice(0, 6)}...${str.slice(-4)}` : "";

    // ─── WALLET CARD — Brand-green credit card (Transfer-Hub dimensions) ───────
    // Same card dimensions as the Transfer Hub swipeable wallet card
    // (h-[220px]/md:h-[260px], rounded-[40px], metallic gold chip, topographic
    // nature texture) but finished in the brand green fill from the reference
    // mock. Content is a profile + balance card: cardholder (avatar + username),
    // card number (main wallet address), main wallet balance and trading wallet
    // balance.
    // One credit card per wallet, rendered by `kind` ('trading' | 'main'). Dark
    // brand-green face with a world-map background; the two cards sit on a
    // horizontal slider so switching reads like flipping a card deck.
    const renderWalletCard = (kind) => {
        const isTrading = kind === 'trading';
        const cardAddress = isTrading ? evmSessionWallet?.address : address;
        const cardBalance = isTrading ? sessionBalance : evmBalance;
        return (
        <div
            className="w-[448px] h-[260px] flex-none relative overflow-hidden group text-white"
            style={{
                fontFamily: '"Comfortaa", cursive',
                background: 'linear-gradient(145deg, #1a6140 0%, #123f28 55%, #0b3220 100%)',
                border: '1.5px solid rgba(99,194,141,0.45)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 46px rgba(0,0,0,0.28)'
            }}
        >
            {/* World-Map Background */}
            <img src="/worldmap.svg" alt="" aria-hidden="true"
                className="absolute inset-0 w-full h-full object-cover brightness-0 invert opacity-[0.14] pointer-events-none" />
            {/* Brand sheen (keeps the dark green from reading flat) */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 via-transparent to-black/15 pointer-events-none" />

            {/* NFC icon, top right — level with the brand logo */}
            <Nfc size={24} className="absolute top-4 right-6 text-white/65 pointer-events-none" />

            {/* Aurora beam — thin, glowing, hugging the card outline and sweeping
                smoothly around it */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 448 260" fill="none" style={{ overflow: 'visible' }}>
                <defs>
                    <linearGradient id="aurora-stroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="rgba(126,255,199,0)" />
                        <stop offset="50%" stopColor="rgba(126,255,199,0.9)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.95)" />
                    </linearGradient>
                </defs>
                <rect x="2" y="2" width="444" height="256" rx="39" pathLength="100"
                    stroke="url(#aurora-stroke)" strokeWidth="4.5" strokeDasharray="12 88" className="aurora-dash"
                    style={{ filter: 'blur(3.5px)', opacity: 0.55, strokeLinecap: 'round' }} />
                <rect x="2" y="2" width="444" height="256" rx="39" pathLength="100"
                    stroke="url(#aurora-stroke)" strokeWidth="1.5" strokeDasharray="12 88" className="aurora-dash"
                    style={{ strokeLinecap: 'round' }} />
            </svg>

            {/* Card Face: all-white brand logo (top-left, level with the NFC icon) ·
                wallet address on the left with its label beneath ·
                username (bottom-left) + balance with bigger numbers (bottom-right) */}
            <div className="h-full flex flex-col justify-between relative z-20 py-4 px-6 md:px-7">

                {/* 15market logo — all white, top-left, shifted upward */}
                <img src="/gowlogo.png" alt="15market" className="h-24 md:h-[120px] w-auto self-start -translate-y-[30%]"
                    style={{ filter: 'brightness(0) invert(1)', opacity: 0.95 }} />

                {/* Wallet address — full address on the left with a copy icon; label beneath */}
                <div className="px-1 min-w-0"
                    onClick={() => { if (cardAddress) { navigator.clipboard.writeText(cardAddress); setToast('Address Copied!'); setTimeout(() => setToast(null), 2000); } }}>
                    <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                        <p className="text-left text-lg md:text-xl font-black tracking-[0.22em] truncate leading-none">
                            {cardAddress
                                ? truncate(cardAddress).toUpperCase()
                                : (isTrading && isSignerInitializing ? 'SYNCING...' : 'XXXX...XXXX')}
                        </p>
                        <Copy size={13} className="flex-none text-white/70" />
                    </div>
                    <p className="text-left text-[9px] md:text-[10px] italic font-black lowercase tracking-[0.25em] text-white/55 mt-1.5">
                        {isTrading ? 'Trading Wallet' : 'Main Wallet'}
                    </p>
                </div>

                {/* Bottom row: username (left) · balance with bigger numbers, USDC small on its base (right) */}
                <div className="flex items-end justify-between gap-4">
                    <span className="text-2xl md:text-3xl font-black truncate" style={{ fontFamily: 'Sankyu, "sankyu", cursive' }}>{userProfile?.username || 'Trader'}</span>
                    <div className="text-right leading-none shrink-0">
                        <div className="text-[45px] md:text-[72px] font-black tracking-tighter tabular-nums leading-none"
                            style={{ textShadow: '0 6px 24px rgba(0,0,0,0.40)' }}>
                            ${parseFloat(cardBalance || 0).toFixed(2)}
                            <span className="text-[11px] md:text-base ml-1.5 font-bold text-white/70">USDC</span>
                        </div>
                    </div>
                </div>
            </div>

        </div>
        );
    };

    {/* Card deck: trading + main cards side by side on one horizontal slider.
        Both chevrons sit OUTSIDE the card on each side, always visible; mobile
        users can also just swipe left/right between the two cards. */}
    const walletCard = (
        <div ref={deckRef} className="relative w-full max-w-[448px]" style={{ aspectRatio: '448 / 260' }}>
            {/* Fixed-design canvas (448 × 260), uniformly scaled to fit the screen */}
            <div className="absolute top-0 left-0 origin-top-left"
                style={{ width: '448px', height: '260px', transform: `scale(${deckScale})`, transition: 'transform 0.25s ease' }}>
                {/* Carousel chevrons — outside the card, desktop only */}
                <button onClick={() => setWalletCardSide(walletCardSide === 'trading' ? 'main' : 'trading')} title="Main Wallet card"
                    className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full items-center justify-center bg-[#0b3220]/85 border border-[#1A6140]/40 text-white/90 backdrop-blur-sm hover:bg-[#0b3220] hover:scale-105 active:scale-95 transition-all"
                    style={{ left: '-46px', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}>
                    <ChevronLeft size={18} />
                </button>
                <button onClick={() => setWalletCardSide(walletCardSide === 'trading' ? 'main' : 'trading')} title="Trading Wallet card"
                    className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full items-center justify-center bg-[#0b3220]/85 border border-[#1A6140]/40 text-white/90 backdrop-blur-sm hover:bg-[#0b3220] hover:scale-105 active:scale-95 transition-all"
                    style={{ right: '-46px', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}>
                    <ChevronRight size={18} />
                </button>

                {/* Static clip window over the sliding cards — carries the outer glow */}
                <div className="w-[448px] h-[260px] rounded-[40px] relative overflow-hidden"
                    style={{ boxShadow: '0 10px 28px rgba(0,0,0,0.50), 0 20px 44px rgba(0,0,0,0.45), 0 10px 30px rgba(20, 241, 149, 0.13)' }}
                    onTouchStart={(e) => { touchStartXRef.current = e.touches[0].clientX; }}
                    onTouchEnd={(e) => {
                        const startX = touchStartXRef.current;
                        touchStartXRef.current = null;
                        if (startX === null) return;
                        const dx = e.changedTouches[0].clientX - startX;
                        if (dx < -60 && walletCardSide === 'trading') setWalletCardSide('main');
                        else if (dx > 60 && walletCardSide === 'main') setWalletCardSide('trading');
                    }}>
                    <div
                        className="flex h-full will-change-transform transition-transform duration-700"
                        style={{
                            transform: walletCardSide === 'trading' ? 'translateX(0px)' : 'translateX(-448px)',
                            transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.35, 1)'
                        }}>
                        {renderWalletCard('trading')}
                        {renderWalletCard('main')}
                    </div>
                </div>
            </div>
        </div>
    );

    // Compact action row that sits directly under the wallet card, mirroring the
    // Transfer Hub 'Primary Actions' row. Withdraw is hidden for accounts with
    // no external wallet (trading wallet only).
    const walletActions = (
        <div className={`grid ${hasExternalWallet ? 'grid-cols-2' : 'grid-cols-1'} gap-3 md:gap-4 shrink-0`}>
            <button onClick={() => { setPromptValue(""); setPromptConfig({ title: "Deposit to Trading Wallet", placeholder: "USDC Amount", onConfirm: (val) => onDeposit(parseFloat(val)) }); }}
                className="flex items-center justify-center gap-2 bg-[#1A6140] text-white font-black py-3 md:py-5 rounded-[20px] text-[9px] md:text-[11px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.95] transition-all"
                style={{ boxShadow: '0 10px 24px rgba(0,0,0,0.50), 0 12px 34px rgba(20, 241, 149, 0.14)' }}>
                <ArrowUp size={13} /> Deposit
            </button>
            {hasExternalWallet && (
                <button onClick={() => { setPromptValue(""); setPromptConfig({ title: "Withdraw to Main Wallet", placeholder: "Amount", onConfirm: (val) => onWithdraw(val) }); }}
                    className="flex items-center justify-center gap-2 border border-[#1A6140]/40 bg-[#1A6140]/10 text-[#1A6140] font-black py-3 md:py-5 rounded-[20px] text-[9px] md:text-[11px] uppercase tracking-widest hover:bg-[#1A6140]/20 active:scale-[0.95] transition-all"
                    style={{ boxShadow: '0 10px 24px rgba(0,0,0,0.50), 0 12px 34px rgba(20, 241, 149, 0.14)' }}>
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
                /* Transaction history: scrolls inside its box — scrollbar only on desktop */
                .tx-scroll { overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(26, 97, 64, 0.55) transparent; }
                .tx-scroll::-webkit-scrollbar { width: 4px; }
                .tx-scroll::-webkit-scrollbar-thumb { background: rgba(26, 97, 64, 0.55); border-radius: 999px; }
                .tx-scroll::-webkit-scrollbar-track { background: transparent; }
                @media (max-width: 767px) {
                    .tx-scroll { scrollbar-width: none; -ms-overflow-style: none; }
                    .tx-scroll::-webkit-scrollbar { display: none; }
                }
                .db-card { background: ${isLight ? 'rgba(255,255,255,0.7)' : 'rgba(10,10,10,0.8)'}; border: 1px solid ${isLight ? 'rgba(26, 97, 64,0.15)' : 'rgba(255,255,255,0.06)'}; border-radius: 24px; margin: 0 2px; filter: drop-shadow(${isLight ? '0 2px 4px rgba(0,0,0,0.10)' : '0 2px 4px rgba(0,0,0,0.4)'}); }
                .db-card-alt { background: ${isLight ? 'rgba(255,255,255,0.65)' : 'rgba(10,10,10,0.75)'}; border: 1px solid ${isLight ? 'rgba(26, 97, 64,0.12)' : 'rgba(255,255,255,0.05)'}; border-radius: 24px; margin: 0 2px; filter: drop-shadow(${isLight ? '0 2px 4px rgba(0,0,0,0.10)' : '0 2px 4px rgba(0,0,0,0.4)'}); }
                @keyframes breathe { 0%,100%{box-shadow:0 0 20px rgba(26, 97, 64,0.3)} 50%{box-shadow:0 0 40px rgba(26, 97, 64,0.6)} }
                /* Aurora beam — one light segment travels along the card outline */
                @keyframes aurora-slide { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
                .aurora-dash { animation: aurora-slide 5.5s linear infinite; }
            `}</style>

            <div className={`absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] ${isLight ? '' : 'hidden'}`} />

            {/* HEADER */}
            <div className="flex items-center justify-between px-4 md:px-10 pb-0 flex-none relative z-10 w-full"
                 style={isSmallScreen ? { paddingTop: 'calc(env(safe-area-inset-top) + 12px)' } : { paddingTop: '1.25rem' }}>
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5' : 'bg-white/5 border-white/5 hover:bg-white/10'} rounded-2xl border flex items-center justify-center hover:-translate-x-1 transition-transform ${isLight ? 'text-black shadow-[0_2px_8px_rgba(0,0,0,0.12)]' : 'text-white shadow-[0_2px_8px_rgba(0,0,0,0.4)]'}`}>
                        <ArrowLeft size={16} />
                    </button>
                    <h1 className={`text-xl font-bold uppercase tracking-widest ${isLight ? 'text-[#0f2618]' : 'text-white'}`}>Dashboard</h1>
                </div>
                {isSmallScreen ? (
                    <div className="relative">
                        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5 shadow-[0_2px_8px_rgba(0,0,0,0.10)]' : 'bg-white/5 border-white/5 hover:bg-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.4)]'} rounded-2xl border flex items-center justify-center relative group`}>
                            <Menu size={16} className={isLight ? 'text-black/80' : 'text-white/80'} />
                            <motion.span
                                className="absolute top-2 right-2 w-2 h-2 bg-[#1A6140] rounded-full"
                                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                            />
                        </button>
                        <input ref={fileInputRef} type="file" className="hidden" accept="image/jpeg,image/jpg,image/png,image/gif" onChange={handleAvatarUpload}/>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <button onClick={onDocs} title="Platform Documentation" className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5 shadow-[0_2px_8px_rgba(0,0,0,0.10)]' : 'bg-white/5 border-white/5 hover:bg-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.4)]'} rounded-2xl border flex items-center justify-center relative group`}>
                            <AnimatedBook size={16} className="text-[#1A6140]"/>
                        </button>
                        <button onClick={onCampaign} title="Campaign" className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5 shadow-[0_2px_8px_rgba(0,0,0,0.10)]' : 'bg-white/5 border-white/5 hover:bg-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.4)]'} rounded-2xl border flex items-center justify-center relative group`}>
                            <AnimatedTrophy size={16} className="text-[#1A6140]"/>
                        </button>
                        <button onClick={onTransferHub || (() => onOpenCircleWallet?.(null))} title="Transfer Hub" className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5 shadow-[0_2px_8px_rgba(0,0,0,0.10)]' : 'bg-white/5 border-white/5 hover:bg-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.4)]'} rounded-2xl border flex items-center justify-center relative group`}>
                            <AnimatedSend size={15} className={isLight ? 'text-black/80' : 'text-white/80'}/>
                        </button>
                        <button onClick={() => setIsNotificationsOpen(true)} className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5 shadow-[0_2px_8px_rgba(0,0,0,0.10)]' : 'bg-white/5 border-white/5 hover:bg-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.4)]'} rounded-2xl border flex items-center justify-center relative group`} title="Notifications">
                            <AnimatedBell size={16} className={isLight ? 'text-black/80' : 'text-white/80'}/>
                            <motion.span
                                className="absolute top-2 right-2 w-2 h-2 bg-[#1A6140] rounded-full"
                                animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                            />
                        </button>
                        <button onClick={() => { setNewUsername(userProfile?.username || ''); setLinkedEmail(userProfile?.email || ''); setIsSettingsOpen(true); }}
                            className={`w-10 h-10 ${isLight ? 'bg-white border-white hover:bg-black/5 shadow-[0_2px_8px_rgba(0,0,0,0.10)]' : 'bg-white/5 border-white/5 hover:bg-white/10 shadow-[0_2px_8px_rgba(0,0,0,0.4)]'} rounded-2xl border flex items-center justify-center relative group`} title="Settings">
                            <AnimatedSettings size={16} className={isLight ? 'text-black/80' : 'text-white/80'}/>
                        </button>
                        <input ref={fileInputRef} type="file" className="hidden" accept="image/jpeg,image/jpg,image/png,image/gif" onChange={handleAvatarUpload}/>
                    </div>
                )}
            </div>

            {/* MAIN BODY */}
            {isSmallScreen ? (
                /* MOBILE PORTRAIT: vertical stacked layout */
                <div className="flex flex-1 gap-3 px-4 py-2 min-h-0 relative z-10 flex-col overflow-y-auto no-scrollbar pb-6">

                    {/* WALLET CARD — fixed credit-card size (327 × 220), not screen-responsive */}
                    <div className="flex-none flex flex-col gap-3">
                        <div className="flex justify-center">
                            {walletCard}
                        </div>
                        {walletCardSide === 'trading' && walletActions}
                    </div>

                    {/* LINE UNDER WALLET */}
                    <div className="flex-none relative">
                        <div className="w-full h-px bg-gradient-to-r from-transparent via-[#1A6140]/40 to-transparent"/>
                    </div>

                    {/* USER METRICS (Rearranged 2x2 Grid) */}
                    <div className="flex-none">
                        <div className="grid grid-cols-2 gap-2">
                            {/* 24H Volume */}
                            <div className="db-card p-3.5 flex flex-col justify-between min-h-[72px] relative overflow-hidden">
                                <div className="flex items-center gap-1.5">
                                    <BarChart2 size={12} className="text-[#1A6140] flex-none"/>
                                    <span className={`text-[8px] font-bold ${isLight ? 'text-black/60' : 'text-white/40'} uppercase tracking-widest truncate`}>Volume</span>
                                </div>
                                <div className="flex items-baseline justify-between mt-1">
                                    <div className={`text-sm font-black ${isLight ? 'text-black' : 'text-white'} tracking-tight truncate`}>{animVolume.toFixed(2)}</div>
                                    <div className="text-[8px] font-bold text-[#1A6140] truncate">+12.4%</div>
                                </div>
                            </div>

                            {/* Win Rate */}
                            <div className="db-card p-3.5 flex flex-col justify-between min-h-[72px] relative overflow-hidden">
                                <div className="flex items-center gap-1.5">
                                    <AnimatedZap size={12} className="text-[#1A6140] flex-none"/>
                                    <span className={`text-[8px] font-bold ${isLight ? 'text-black/60' : 'text-white/40'} uppercase tracking-widest truncate`}>Win Rate</span>
                                </div>
                                <div className="flex items-baseline justify-between mt-1">
                                    <div className={`text-sm font-black ${isLight ? 'text-black' : 'text-white'} tracking-tight truncate`}>{animWinRate.toFixed(1)}%</div>
                                    <div className={`text-[8px] font-bold ${isLight ? 'text-black/40' : 'text-white/40'} truncate`}>Neutral</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* PROFIT & LOSS GRAPH */}
                    <div className="flex-none">
                        <div className="db-card p-4 flex flex-col h-[160px] relative overflow-hidden">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                    <AnimatedTrendingUp size={12} className="text-[#1A6140]"/>
                                    <span className={`text-[8px] font-bold ${isLight ? 'text-black/60' : 'text-white/40'} uppercase tracking-widest`}>P&amp;L</span>
                                </div>
                                <span className={`text-xl font-black tabular-nums leading-none ${pnlStats.netPnl >= 0 ? 'text-[#1A6140]' : 'text-[#FF6B6B]'}`} style={{ fontFamily: '"Comfortaa", cursive', fontWeight: 900 }}>
                                    {pnlStats.netPnl >= 0 ? '+' : ''}{animNetPnl.toFixed(2)}
                                    <span className="text-[10px] font-bold ml-1 opacity-60">USDC</span>
                                </span>
                            </div>
                            <div className="flex-1 min-h-0 -mx-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={pnlStats.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                        <defs>
                                            <linearGradient id="pnlLineStrokeMobile" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="0%" stopColor="#1A6140" />
                                                <stop offset={strokeOffsetPercent} stopColor="#1A6140" />
                                                <stop offset={strokeOffsetPercent} stopColor="#FF6B6B" />
                                                <stop offset="100%" stopColor="#FF6B6B" />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="i" hide />
                                        <YAxis domain={[-pnlStats.maxAbs * 1.2, pnlStats.maxAbs * 1.2]} hide />
                                        <Tooltip
                                            contentStyle={{ background: isLight ? 'rgba(207,220,213,0.95)' : 'rgba(10,10,10,0.9)', border: 'none', borderRadius: 8, fontSize: 8, fontWeight: 700 }}
                                            formatter={(v) => [`${v >= 0 ? '+' : ''}${parseFloat(v).toFixed(4)} USDC`, 'PnL']}
                                            labelFormatter={() => ''}
                                        />
                                        <ReferenceLine y={0} stroke={isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'} strokeWidth={1} strokeDasharray="3 3"/>
                                        <Area type="monotone" dataKey="pnl" stroke="url(#pnlLineStrokeMobile)" strokeWidth={1.25} fill="none" dot={false} activeDot={{ r: 2.5, strokeWidth: 0, fill: pnlStats.netPnl >= 0 ? '#1A6140' : '#FF6B6B' }} baseValue={0}/>
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* TRANSACTION HISTORY */}
                    <div className="flex-1 min-h-0 flex flex-col">
                        {/* Transactions */}
                        <div className="db-card-alt p-4 flex flex-col flex-1 min-h-0">
                            <div className="flex items-center justify-between mb-3 flex-none">
                                <div className="flex items-center gap-2">
                                    <AnimatedRefresh size={12} className="text-[#1A6140]"/>
                                    <span className={`text-[8px] font-bold ${isLight ? 'text-black/60' : 'text-white/40'} uppercase tracking-widest`}>Transactions</span>
                                </div>
                                <button className={`text-[8px] font-bold ${isLight ? 'text-black/50 hover:text-black' : 'text-white/40 hover:text-white'} flex items-center gap-1 uppercase tracking-widest transition-colors`}>View all<ChevronRight size={10}/></button>
                            </div>
                            <div className="flex-1 tx-scroll flex flex-col gap-3">
                                {(!transactionHistory||transactionHistory.length===0) ? (
                                    <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center gap-2">
                                        <AnimatedRefresh size={16} className={isLight ? 'text-black/20' : 'text-white/20'}/>
                                        <div className={`text-[8px] font-bold uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>No recent activity</div>
                                    </div>
                                ) : transactionHistory.slice(0, 10).map((tx,i) => (
                                    <div key={tx.id||i} className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-7 h-7 rounded-full flex items-center justify-center ${tx.type==="DEPOSIT"?"bg-[#1A6140]/15 text-[#1A6140]":"bg-[#FF7F50]/15 text-[#FF7F50]"}`}>
                                                {tx.type==="DEPOSIT"?<ArrowUp size={10}/>:<ArrowDown size={10}/>}
                                            </div>
                                            <div>
                                                <div className={`text-[10px] font-bold ${isLight ? 'text-black' : 'text-white'}`}>{tx.type==="DEPOSIT"?"Deposit":"Withdrawal"}</div>
                                                <div className={`text-[7px] font-semibold mt-0.5 ${isLight ? 'text-black/50' : 'text-white/40'}`}>{new Date(tx.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-end gap-0.5">
                                            <div className="px-1.5 py-0.5 bg-[#1A6140]/10 text-[#1A6140] text-[6px] font-black tracking-widest rounded-md uppercase">COMPLETED</div>
                                            <div className={`text-[10px] font-bold tabular-nums ${tx.type==="DEPOSIT"?"text-[#1A6140]":"text-[#FF7F50]"}`}>{tx.type==="DEPOSIT"?"+":"-"}{parseFloat(tx.amount).toFixed(2)}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* DESKTOP: original side-by-side layout */
                <div className="flex flex-1 gap-10 px-10 py-5 min-h-0 relative z-10 max-w-[1600px] mx-auto w-full">

                    {/* LEFT: Wallet Card Column */}
                    <div className="w-[448px] flex-none flex flex-col justify-center min-h-0 gap-6">

                        {/* WALLET CARD — Transfer-Hub credit-card format (desktop) */}
                        <div className="flex flex-col gap-4">
                            {walletCard}
                            {walletCardSide === 'trading' && walletActions}
                        </div>
                    </div>

                    {/* DIVIDER */}
                    <div className="w-px mx-4 flex-none self-stretch relative">
                        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#1A6140]/20 to-transparent"/>
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[2px] h-12 bg-[#1A6140] rounded-full" style={{animation:'breathe 2s ease-in-out infinite'}}/>
                    </div>

                    {/* RIGHT: Stats & Panels */}
                    <div className="flex-1 min-w-0 flex flex-col gap-4 py-1">
                        {/* 2x2 Stats */}
                        <div className="grid grid-cols-2 gap-4 flex-none">
                            {/* 24H Volume */}
                            <div className="db-card p-5 relative overflow-hidden group flex flex-col justify-between">
                                <div className="flex items-center gap-2 mb-4">
                                    <AnimatedBarChart size={14} className="text-[#1A6140] flex-none"/>
                                    <span className={`text-[9px] font-bold ${isLight ? 'text-black/60' : 'text-white/40'} uppercase tracking-widest`}>24H Volume</span>
                                </div>
                                <div className={`text-3xl font-bold ${isLight ? 'text-black' : 'text-white'} mb-1.5 tracking-tight tabular-nums`}>{animVolume.toFixed(2)}</div>
                                <div className="flex items-center gap-1.5 text-[9px] font-bold"><span className="text-[#1A6140] flex items-center gap-0.5"><ChevronUp size={10}/>+12.4%</span><span className={isLight ? 'text-black/30' : 'text-white/20'}>vs yesterday</span></div>
                                <div className="absolute right-0 bottom-3 w-[110px] h-[45px] opacity-20">
                                    <svg viewBox="0 0 100 50" className="w-full h-full"><path d="M0,50 L15,38 L30,42 L45,22 L60,28 L75,8 L90,12 L100,0 L100,50 Z" fill="#1A6140" opacity="0.3"/><path d="M0,50 L15,38 L30,42 L45,22 L60,28 L75,8 L90,12 L100,0" fill="none" stroke="#1A6140" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                            </div>

                            {/* Sentiment */}
                            <div className="db-card p-5 relative overflow-hidden flex flex-col justify-between">
                                <div className="flex items-center gap-2 mb-4">
                                    <AnimatedSmile size={14} className="text-[#1A6140] flex-none"/>
                                    <span className={`text-[9px] font-bold ${isLight ? 'text-black/60' : 'text-white/40'} uppercase tracking-widest`}>Sentiment</span>
                                </div>
                                <div className={`text-3xl font-bold ${isLight ? 'text-black' : 'text-white'} mb-1.5 tracking-tight tabular-nums`}>{animSentiment.toFixed(0)}%</div>
                                <div className="text-[9px] font-bold text-[#1A6140] uppercase tracking-widest">{derivedStats.sentimentText}</div>
                                <div className="absolute right-6 top-1/2 -translate-y-1/2 w-[60px] h-[60px]">
                                    <svg viewBox="0 0 64 64" className="w-full h-full -rotate-90">
                                        <circle cx="32" cy="32" r="26" fill="none" stroke={isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)'} strokeWidth="6"/>
                                        <circle cx="32" cy="32" r="26" fill="none" stroke="#1A6140" strokeWidth="6" strokeLinecap="round" strokeDasharray="163.4" strokeDashoffset={163.4-(163.4*Math.min(animSentiment,100)/100)}/>
                                    </svg>
                                    <div className={`absolute inset-0 flex items-center justify-center text-[11px] font-bold ${isLight ? 'text-black' : 'text-white'}`} style={{transform:'rotate(0deg)'}}>{animSentiment.toFixed(0)}%</div>
                                </div>
                            </div>

                            {/* Win Rate */}
                            <div className="db-card p-5 relative overflow-hidden group flex flex-col justify-between">
                                <div className="flex items-center gap-2 mb-4">
                                    <AnimatedZap size={14} className="text-[#1A6140] flex-none"/>
                                    <span className={`text-[9px] font-bold ${isLight ? 'text-black/60' : 'text-white/40'} uppercase tracking-widest`}>Win Rate</span>
                                </div>
                                <div className={`text-3xl font-bold ${isLight ? 'text-black' : 'text-white'} mb-1.5 tracking-tight tabular-nums`}>{animWinRate.toFixed(1)}%</div>
                                <div className="flex items-center gap-1.5 text-[9px] font-bold"><div className={`w-1.5 h-1.5 rounded-full ${isLight ? 'bg-black/20' : 'bg-white/30'}`}/><span className={isLight ? 'text-black/40' : 'text-white/40'}>Neutral</span></div>
                                <div className="absolute right-0 bottom-3 w-[110px] h-[45px] opacity-20">
                                    <svg viewBox="0 0 100 50" className="w-full h-full"><path d="M0,50 L20,38 L40,44 L60,22 L80,28 L100,10 L100,50 Z" fill="#1A6140" opacity="0.3"/><path d="M0,50 L20,38 L40,44 L60,22 L80,28 L100,10" fill="none" stroke="#1A6140" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                            </div>

                            {/* Avg Stake */}
                            <div className="db-card p-5 relative overflow-hidden group flex flex-col justify-between">
                                <div className="flex items-center gap-2 mb-4">
                                    <AnimatedCoins size={14} className="text-[#1A6140] flex-none"/>
                                    <span className={`text-[9px] font-bold ${isLight ? 'text-black/60' : 'text-white/40'} uppercase tracking-widest`}>Avg Stake</span>
                                </div>
                                <div className={`text-3xl font-bold ${isLight ? 'text-black' : 'text-white'} mb-1.5 tracking-tight tabular-nums`}>{animAvgStake.toFixed(2)}</div>
                                <div className="flex items-center gap-1.5 text-[9px] font-bold"><span className="text-[#1A6140] flex items-center gap-0.5"><ChevronUp size={10}/>+8.1%</span><span className={isLight ? 'text-black/30' : 'text-white/20'}>vs yesterday</span></div>
                                <div className="absolute right-0 bottom-3 w-[110px] h-[45px] opacity-20">
                                    <svg viewBox="0 0 100 50" className="w-full h-full"><path d="M0,50 L15,44 L30,32 L45,28 L60,38 L75,14 L90,18 L100,0 L100,50 Z" fill="#1A6140" opacity="0.3"/><path d="M0,50 L15,44 L30,32 L45,28 L60,38 L75,14 L90,18 L100,0" fill="none" stroke="#1A6140" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                </div>
                            </div>
                        </div>

                        {/* Bottom Row: Activity Pulse + Transactions */}
                        <div className="grid grid-cols-2 gap-4 flex-1 min-h-0 pb-1">
                            {/* PnL Graph */}
                            <div className="db-card p-5 flex flex-col min-h-0">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <AnimatedTrendingUp size={14} className="text-[#1A6140]"/>
                                        <span className={`text-[9px] font-bold ${isLight ? 'text-black/60' : 'text-white/40'} uppercase tracking-widest`}>P&amp;L</span>
                                    </div>
                                </div>
                                {/* Chart — symmetric domain means y=0 is always at exactly 50% height, so gradient split is always 50% */}
                                <div className="flex-1 min-h-0 -mx-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        {/* Two separate Area fills: green only above zero, red only below zero */}
                                        <AreaChart data={pnlStats.chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                                            <defs>
                                                <linearGradient id="pnlLineStroke" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#1A6140" />
                                                    <stop offset={strokeOffsetPercent} stopColor="#1A6140" />
                                                    <stop offset={strokeOffsetPercent} stopColor="#FF6B6B" />
                                                    <stop offset="100%" stopColor="#FF6B6B" />
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="i" hide />
                                            <YAxis domain={[-pnlStats.maxAbs * 1.2, pnlStats.maxAbs * 1.2]} hide />
                                            <Tooltip
                                                contentStyle={{ background: isLight ? 'rgba(207,220,213,0.95)' : 'rgba(10,10,10,0.9)', border: 'none', borderRadius: 8, fontSize: 9, fontWeight: 700 }}
                                                formatter={(v) => [`${v >= 0 ? '+' : ''}${parseFloat(v).toFixed(4)} USDC`, 'PnL']}
                                                labelFormatter={() => ''}
                                            />
                                            <ReferenceLine y={0} stroke={isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)'} strokeWidth={1.5} strokeDasharray="3 3"/>
                                            {/* Stroke line only, colored by gradient based on top/bottom half */}
                                            <Area type="monotone" dataKey="pnl" stroke="url(#pnlLineStroke)" strokeWidth={1.25} fill="none" dot={false} activeDot={{ r: 3, strokeWidth: 0, fill: pnlStats.netPnl >= 0 ? '#1A6140' : '#FF6B6B' }} baseValue={0}/>
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                                {/* Big bold P&L value positioned in the lower right */}
                                <div className="flex items-center justify-between mt-1">
                                    <div />
                                    <span className={`text-3xl font-black tabular-nums leading-none ${pnlStats.netPnl >= 0 ? 'text-[#1A6140]' : 'text-[#FF6B6B]'}`} style={{ fontFamily: '"Comfortaa", cursive', fontWeight: 900 }}>
                                        {pnlStats.netPnl >= 0 ? '+' : ''}{animNetPnl.toFixed(2)}
                                        <span className="text-xs font-bold ml-1 opacity-60">USDC</span>
                                    </span>
                                </div>
                            </div>

                            {/* Transactions */}
                            <div className="db-card-alt p-5 flex flex-col min-h-0">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <AnimatedRefresh size={14} className="text-[#1A6140]"/>
                                        <span className={`text-[9px] font-bold ${isLight ? 'text-black/60' : 'text-white/40'} uppercase tracking-widest`}>Transactions</span>
                                    </div>
                                    <button className={`text-[9px] font-bold ${isLight ? 'text-black/50 hover:text-black' : 'text-white/40 hover:text-white'} flex items-center gap-1 uppercase tracking-widest transition-colors`}>View all<ChevronRight size={12}/></button>
                                </div>
                                <div className="flex-1 tx-scroll flex flex-col gap-4">
                                    {(!transactionHistory||transactionHistory.length===0) ? (
                                        <div className="flex-1 flex flex-col items-center justify-center opacity-30 text-center gap-2">
                                            <AnimatedRefresh size={20} className={isLight ? 'text-black/20' : 'text-white/20'}/>
                                            <div className={`text-[9px] font-bold uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>No recent activity</div>
                                        </div>
                                    ) : transactionHistory.slice(0,5).map((tx,i) => (
                                        <div key={tx.id||i} className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${tx.type==="DEPOSIT"?"bg-[#1A6140]/15 text-[#1A6140]":"bg-[#FF7F50]/15 text-[#FF7F50]"}`}>
                                                    {tx.type==="DEPOSIT"?<ArrowUp size={12}/>:<ArrowDown size={12}/>}
                                                </div>
                                                <div>
                                                    <div className={`text-[11px] font-bold ${isLight ? 'text-black' : 'text-white'}`}>{tx.type==="DEPOSIT"?"Deposit":"Withdrawal"}</div>
                                                    <div className={`text-[8px] font-semibold mt-0.5 ${isLight ? 'text-black/50' : 'text-white/40'}`}>{new Date(tx.timestamp).toLocaleDateString('en-US',{month:'short',day:'numeric'})}</div>
                                                </div>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <div className="px-2 py-0.5 bg-[#1A6140]/10 text-[#1A6140] text-[7px] font-black tracking-widest rounded-md uppercase">COMPLETED</div>
                                                <div className={`text-[11px] font-bold tabular-nums ${tx.type==="DEPOSIT"?"text-[#1A6140]":"text-[#FF7F50]"}`}>{tx.type==="DEPOSIT"?"+":"-"}{parseFloat(tx.amount).toFixed(2)}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Notifications Modal */}
            <AnimatePresence>
                {isNotificationsOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/30 backdrop-blur-sm">
                        <motion.div initial={{opacity:0,scale:0.9,y:20}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:0.9,y:20}}
                            className={`w-full max-w-md ${isLight ? 'bg-white border-[#e2ece5]' : 'bg-[#1a1a1a] border-white/10'} border shadow-2xl rounded-[32px] p-8 flex flex-col`}>
                            <div className="flex flex-col items-center text-center mb-4">
                                <div className={`w-14 h-14 rounded-2xl ${isLight ? 'bg-[#eef5f1]' : 'bg-white/5'} flex items-center justify-center mb-4`}><AnimatedBell size={28} className="text-[#1A6140]"/></div>
                                <h3 className={`text-2xl font-black ${isLight ? 'text-[#133a2a]' : 'text-white'} uppercase font-comfortaa`}>Notifications</h3>
                            </div>
                            
                            {/* Scrollable Notification List */}
                            <div className="flex-1 max-h-[300px] overflow-y-auto pr-1 mb-6 flex flex-col gap-3 custom-scrollbar">
                                {notifications.length === 0 ? (
                                    <div className="py-12 text-center flex flex-col items-center justify-center">
                                        <AlertCircle size={36} className={`${isLight ? 'text-[#133a2a]/20' : 'text-white/20'} mb-2`} />
                                        <p className={`text-xs font-semibold uppercase tracking-widest ${isLight ? 'text-[#133a2a]/30' : 'text-white/30'}`}>No notifications yet.</p>
                                    </div>
                                ) : (
                                    notifications.map((notif) => {
                                        const typeColors = {
                                            success: 'border-[#1A6140]/20 bg-[#1A6140]/5 text-[#1A6140]',
                                            warning: 'border-amber-500/20 bg-amber-500/5 text-amber-500',
                                            info: 'border-sky-500/20 bg-sky-500/5 text-sky-500',
                                            error: 'border-rose-500/20 bg-rose-500/5 text-rose-500'
                                        };
                                        const colorClass = typeColors[notif.type] || typeColors.info;
                                        
                                        return (
                                            <div key={notif.id} className={`p-4 rounded-2xl border ${isLight ? 'bg-[#f8fbf9] border-[#e2ece5]' : 'bg-white/[0.02] border-white/5'} flex gap-3 items-start transition-all`}>
                                                <div className={`p-2 rounded-xl border ${colorClass.split(' ').slice(0, 2).join(' ')} flex-shrink-0 mt-0.5`}>
                                                    {notif.type === 'success' && <Check size={14} className="text-[#1A6140]"/>}
                                                    {notif.type === 'warning' && <AlertCircle size={14} className="text-amber-500"/>}
                                                    {notif.type === 'info' && <Bell size={14} className="text-sky-500"/>}
                                                    {notif.type === 'error' && <AlertCircle size={14} className="text-rose-500"/>}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex justify-between items-center gap-2 mb-1">
                                                        <span className={`text-xs font-black uppercase tracking-wider ${isLight ? 'text-[#133a2a]' : 'text-white'}`}>{notif.title}</span>
                                                        <span className={`text-[9px] font-medium ${isLight ? 'text-[#133a2a]/40' : 'text-white/40'} tabular-nums`}>
                                                            {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                        </span>
                                                    </div>
                                                    <p className={`text-[11px] font-medium leading-relaxed ${isLight ? 'text-[#133a2a]/60' : 'text-white/60'}`}>{notif.message}</p>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>

                            <div className="flex flex-col gap-2">
                                {notifications.length > 0 && (
                                    <button onClick={handleClearNotifications} className={`w-full py-3.5 ${isLight ? 'bg-[#eef5f1] hover:bg-[#e2ece5] text-[#133a2a]' : 'bg-white/5 hover:bg-white/10 text-white'} text-[10px] font-black uppercase tracking-widest rounded-full transition-all`}>
                                        Clear All
                                    </button>
                                )}
                                <button onClick={() => setIsNotificationsOpen(false)} className="w-full py-4 bg-[#1A6140] text-white text-xs font-black uppercase tracking-widest rounded-full hover:brightness-110 transition-all shadow-[0_4px_16px_rgba(26, 97, 64,0.25)]">
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {isSettingsOpen && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/30 backdrop-blur-sm">
                    <motion.div initial={{opacity:0,scale:0.9,y:20}} animate={{opacity:1,scale:1,y:0}}
                        className={`w-full max-w-md ${isLight ? 'bg-white border-[#1A6140]/20' : 'bg-[#1a1a1a] border-white/10'} border shadow-2xl rounded-[32px] p-5 max-h-[90vh] overflow-y-auto no-scrollbar relative overflow-hidden`}>
                        {isLight && (
                            <div className="absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                        )}
                        <button onClick={() => setIsSettingsOpen(false)} className={`absolute top-5 right-5 z-20 p-2 rounded-xl border ${isLight ? 'bg-white/50 border-[#1A6140]/20 text-[#0a261a] hover:bg-white shadow-sm' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                            <X size={14} />
                        </button>
                        <div className="flex flex-col relative z-10">
                            <h3 className={`text-lg font-black ${isLight ? 'text-[#133a2a]' : 'text-white'} mb-4 mt-1 uppercase text-center`}>Settings</h3>

                            <div className="mb-4">
                                <label className={`text-[9px] font-bold uppercase tracking-widest ${isLight ? 'text-[#133a2a]/50' : 'text-white/50'} mb-2 block`}>Username</label>
                                {!isEditingUsername ? (
                                    <div className="flex flex-col gap-2">
                                        <div className={`w-full ${isLight ? 'bg-white/40 text-[#133a2a] border border-[#1A6140]/10' : 'bg-white/5 text-white'} rounded-2xl py-3 px-6 font-bold text-center`}>
                                            {userProfile?.username || 'Trader'}
                                        </div>
                                        <button onClick={() => setIsEditingUsername(true)}
                                            className={`w-full py-2.5 bg-[#1A6140] text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:brightness-110 hover:shadow-[0_4px_16px_rgba(26, 97, 64,0.4)] text-[9px] font-black uppercase tracking-widest rounded-full transition-all`}>
                                            Change
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-col gap-2">
                                        <input type="text" autoFocus placeholder="Enter username" value={newUsername}
                                            onChange={(e) => setNewUsername(e.target.value)}
                                            className={`w-full ${isLight ? 'bg-white/60 border-[#1A6140]/20 text-[#133a2a] placeholder:text-[#133a2a]/30' : 'bg-white/5 border-white/10 text-white placeholder:text-white/30'} border rounded-2xl py-3 px-6 font-bold text-center focus:border-[#1A6140] outline-none transition-all`}/>
                                        <div className="flex gap-2">
                                            <button onClick={() => setIsEditingUsername(false)}
                                                className={`flex-1 py-2.5 bg-[#1A6140] text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:brightness-110 hover:shadow-[0_4px_16px_rgba(26, 97, 64,0.4)] text-[9px] font-black uppercase tracking-widest rounded-full transition-all`}>
                                                Cancel
                                            </button>
                                            <button onClick={async () => {
                                                if (!newUsername.trim() || !address) return;
                                                try {
                                                    const res = await fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`, {
                                                        method: 'PATCH',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ username: newUsername.trim() })
                                                    });
                                                    if (res.ok) {
                                                        setToast("Username Updated!");
                                                        setIsEditingUsername(false);
                                                        setTimeout(() => window.location.reload(), 1000);
                                                    } else {
                                                        const data = await res.json();
                                                        setToast(data.error || "Update Failed");
                                                    }
                                                } catch (e) {
                                                    setToast("Update Failed");
                                                }
                                            }} className={`flex-1 py-2.5 bg-[#1A6140] text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:brightness-110 hover:shadow-[0_4px_16px_rgba(26, 97, 64,0.4)] text-[9px] font-black uppercase tracking-widest rounded-full transition-all`}>
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className={`w-full h-px ${isLight ? 'bg-black/5' : 'bg-white/10'} mb-4`}/>

                            <div className="mb-4">
                                <label className={`text-[9px] font-bold uppercase tracking-widest ${isLight ? 'text-[#133a2a]/50' : 'text-white/50'} mb-2 block`}>Trading Wallet</label>
                                <button onClick={async () => {
                                    try {
                                        const wallet = await createWallet();
                                        if (wallet?.address) {
                                            const res = await fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`, {
                                                method: 'PATCH',
                                                headers: { 'Content-Type': 'application/json' },
                                                body: JSON.stringify({ tradingWallet: wallet.address })
                                            });
                                            if (res.ok) {
                                                setToast("Trading Wallet Regenerated!");
                                                setTimeout(() => window.location.reload(), 1000);
                                            }
                                        }
                                    } catch (e) {
                                        setToast("Failed to regenerate wallet");
                                    }
                                }} className={`w-full py-3 bg-[#1A6140] text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:brightness-110 hover:shadow-[0_4px_16px_rgba(26, 97, 64,0.4)] text-[10px] font-black uppercase tracking-widest rounded-full transition-all`}>
                                    Regenerate Wallet
                                </button>
                            </div>

                            <div className={`w-full h-px ${isLight ? 'bg-black/5' : 'bg-white/10'} mb-4`}/>

                            <div className="mb-4">
                                <label className={`text-[9px] font-bold uppercase tracking-widest ${isLight ? 'text-[#133a2a]/50' : 'text-white/50'} mb-2 block flex items-center gap-1.5`}>
                                    <Mail size={10}/> Link Email
                                </label>
                                <input type="email" placeholder="you@email.com" value={linkedEmail}
                                    onChange={(e) => setLinkedEmail(e.target.value)}
                                    disabled={!!userProfile?.email}
                                    className={`w-full ${isLight ? 'bg-white/60 border-[#1A6140]/20 text-[#133a2a] placeholder:text-[#133a2a]/30' : 'bg-white/5 border-white/10 text-white placeholder:text-white/30'} border rounded-2xl py-3 px-6 font-bold text-center focus:border-[#1A6140] outline-none transition-all mb-2 disabled:opacity-70 disabled:cursor-not-allowed`}/>
                                <button onClick={async () => {
                                    if (!linkedEmail.trim() || !address) return;
                                    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(linkedEmail.trim())) {
                                        setToast('Invalid email address');
                                        return;
                                    }
                                    setIsSavingEmail(true);
                                    try {
                                        const res = await fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`, {
                                            method: 'PATCH',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ email: linkedEmail.trim() })
                                        });
                                        if (res.ok) {
                                            setToast('Email Linked Successfully!');
                                            setTimeout(() => window.location.reload(), 1000);
                                        } else {
                                            const data = await res.json();
                                            setToast(data.error || 'Failed to link email');
                                        }
                                    } catch (e) {
                                        setToast('Failed to link email');
                                    } finally {
                                        setIsSavingEmail(false);
                                    }
                                }} disabled={isSavingEmail || !!userProfile?.email}
                                    className={`w-full py-3 bg-[#1A6140] text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:brightness-110 hover:shadow-[0_4px_16px_rgba(26, 97, 64,0.4)] text-[10px] font-black uppercase tracking-widest rounded-full transition-all disabled:opacity-50 disabled:cursor-not-allowed`}>
                                    {isSavingEmail ? 'Linking...' : (userProfile?.email ? 'Email Linked' : 'Link Email')}
                                </button>
                            </div>

                            <div className={`w-full h-px ${isLight ? 'bg-black/5' : 'bg-white/10'} mb-4`}/>

                            <div className="mb-4">
                                <label className={`text-[9px] font-bold uppercase tracking-widest ${isLight ? 'text-[#133a2a]/50' : 'text-white/50'} mb-1.5 block flex items-center gap-1.5`}>
                                    <Globe size={10}/> Social Accounts
                                </label>
                                <div className={`w-full rounded-2xl p-4 flex items-center justify-between ${isLight ? 'bg-white/40 border border-[#1A6140]/10' : 'bg-white/5 border border-white/5'}`}>
                                    <div className="flex items-center gap-3">
                                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className={isLight ? 'text-[#133a2a]' : 'text-white'}>
                                            <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                                        </svg>
                                        <div>
                                            <div className={`text-[10px] font-bold ${isLight ? 'text-[#133a2a]' : 'text-white'}`}>Discord</div>
                                            {userProfile?.discord ? (
                                                <div className="text-[8px] font-mono text-[#1A6140] font-bold">@{userProfile.discord.username}</div>
                                            ) : (
                                                <div className={`text-[8px] font-medium ${isLight ? 'text-[#133a2a]/40' : 'text-white/40'}`}>Not Linked</div>
                                            )}
                                        </div>
                                    </div>
                                    {!userProfile?.discord ? (
                                        <button onClick={() => {
                                            window.location.href = "https://discord.com/oauth2/authorize?client_id=1509759894348369980&response_type=code&redirect_uri=https%3A%2F%2F15market.online&scope=connections+identify";
                                        }} className={`py-2 px-4 rounded-full text-[9px] font-black uppercase tracking-widest transition-all bg-[#1A6140] text-white shadow-[0_4px_12px_rgba(0,0,0,0.25)] hover:brightness-110`}>
                                            Link
                                        </button>
                                    ) : (
                                        <button onClick={async () => {
                                            try {
                                                await fetch(`${KEEPER_URL_ARC}/auth/discord/unlink`, {
                                                    method: 'POST',
                                                    headers: { 'Content-Type': 'application/json' },
                                                    body: JSON.stringify({ address })
                                                });
                                                window.location.reload();
                                            } catch (e) {}
                                        }} className={`py-2 px-4 rounded-full text-[9px] font-black uppercase tracking-widest transition-all border ${isLight ? 'bg-white/40 border-[#1A6140]/20 text-[#133a2a] hover:bg-white' : 'bg-white/5 border-white/10 text-white hover:bg-white/10'}`}>
                                            Unlink
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}

            {/* PROFILE CARD MODAL */}
            <AnimatePresence>
                {isProfileCardOpen && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/30 backdrop-blur-md cursor-pointer" onClick={() => setIsProfileCardOpen(false)}>
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="cursor-default flex flex-col items-center gap-4 w-full max-w-[560px]"
                        >
                            {/* The VISIBLE card (reacts to theme) */}
                            <div className="w-full rounded-[28px] overflow-hidden relative" style={{ background: isLight ? '#eef5f1' : '#0a0a0a', fontFamily: '"Comfortaa", cursive', boxShadow: isLight ? '0 10px 40px rgba(0,0,0,0.1)' : 'none' }}>
                                {/* Watermark pattern */}
                                <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                                     style={{ backgroundImage: `url(${isLight ? '/goblogo.png' : '/gowlogo.png'})`, backgroundSize: '30px 30px', backgroundRepeat: 'repeat', transform: 'rotate(-15deg) scale(1.6)' }} />
                                {/* Gradient glow top-right */}
                                <div className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(26, 97, 64,0.15) 0%, transparent 70%)' }} />
                                {/* Gradient glow bottom-left */}
                                <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(26, 97, 64,0.08) 0%, transparent 70%)' }} />

                                <div className="relative z-10 flex flex-row items-stretch p-6 gap-5">
                                    {/* LEFT: Avatar + Identity */}
                                    <div className="flex flex-col items-center justify-center gap-3 min-w-[120px]">
                                        <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center overflow-hidden border-[3px] border-[#1A6140]/60 shadow-[0_0_20px_rgba(26, 97, 64,0.3)]">
                                            {(userProfile?.avatar || userProfile?.xProfileImage) ? (
                                                <img src={userProfile?.avatar || userProfile?.xProfileImage} alt="avatar" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="w-full h-full bg-[#1A6140]/15 flex items-center justify-center">
                                                    <User size={30} className="text-[#1A6140]/60" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="text-center">
                                            <h3 className={`text-sm font-black uppercase tracking-[0.15em] leading-tight ${isLight ? 'text-[#133a2a]' : 'text-white'}`}>
                                                {userProfile?.username || 'Trader'}
                                            </h3>
                                            <p className={`text-[8px] font-mono mt-1 ${isLight ? 'text-[#133a2a]/40' : 'text-white/30'}`}>
                                                {address ? `${address.slice(0,6)}...${address.slice(-4)}` : '---'}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Vertical divider */}
                                    <div className="w-px self-stretch bg-gradient-to-b from-transparent via-[#1A6140]/30 to-transparent flex-none" />

                                    {/* RIGHT: Stats */}
                                    <div className="flex-1 flex flex-col justify-between gap-2.5 min-w-0">
                                        {/* Row 1: Win Rate + Trades */}
                                        <div className="flex gap-2.5">
                                            <div className={`flex-1 rounded-2xl p-3 ${isLight ? 'bg-black/[0.02] border border-black/[0.05]' : 'bg-white/[0.04] border border-white/[0.06]'}`}>
                                                <div className={`text-[7px] font-black uppercase tracking-[0.2em] mb-1 ${isLight ? 'text-[#133a2a]/40' : 'text-white/30'}`}>Win Rate</div>
                                                <div className="text-xl font-black text-[#1A6140] leading-none">{derivedStats.winRate.toFixed(1)}%</div>
                                            </div>
                                            <div className={`flex-1 rounded-2xl p-3 ${isLight ? 'bg-black/[0.02] border border-black/[0.05]' : 'bg-white/[0.04] border border-white/[0.06]'}`}>
                                                <div className={`text-[7px] font-black uppercase tracking-[0.2em] mb-1 ${isLight ? 'text-[#133a2a]/40' : 'text-white/30'}`}>Trades</div>
                                                <div className={`text-xl font-black leading-none ${isLight ? 'text-[#133a2a]' : 'text-white'}`}>{derivedStats.totalTrades}</div>
                                            </div>
                                        </div>
                                        {/* Row 2: Wins + PnL */}
                                        <div className="flex gap-2.5">
                                            <div className={`flex-1 rounded-2xl p-3 ${isLight ? 'bg-black/[0.02] border border-black/[0.05]' : 'bg-white/[0.04] border border-white/[0.06]'}`}>
                                                <div className={`text-[7px] font-black uppercase tracking-[0.2em] mb-1 ${isLight ? 'text-[#133a2a]/40' : 'text-white/30'}`}>Wins</div>
                                                <div className="text-xl font-black text-[#1A6140] leading-none">{derivedStats.totalWins}</div>
                                            </div>
                                            <div className={`flex-1 rounded-2xl p-3 ${isLight ? 'bg-black/[0.02] border border-black/[0.05]' : 'bg-white/[0.04] border border-white/[0.06]'}`}>
                                                <div className={`text-[7px] font-black uppercase tracking-[0.2em] mb-1 ${isLight ? 'text-[#133a2a]/40' : 'text-white/30'}`}>All-Time PnL</div>
                                                <div className={`text-xl font-black leading-none ${pnlStats.netPnl >= 0 ? 'text-[#1A6140]' : 'text-[#FF6B6B]'}`}>
                                                    {pnlStats.netPnl >= 0 ? '+' : ''}{pnlStats.netPnl.toFixed(2)}
                                                </div>
                                            </div>
                                        </div>
                                        {/* Footer Bar */}
                                        <div className="flex items-center justify-between mt-1">
                                            <img src={isLight ? '/goblogo.png' : '/gowlogo.png'} alt="15market" className="h-5 w-auto opacity-60" />
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-1 h-1 rounded-full bg-[#1A6140] animate-pulse" />
                                                <span className={`text-[7px] font-black uppercase tracking-[0.15em] ${isLight ? 'text-[#133a2a]/40' : 'text-white/25'}`}>ARC TESTNET</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* The HIDDEN export card (Always Carbon Black / gowlogo) */}
                            <div className="absolute top-0 left-0 w-full overflow-hidden opacity-0 pointer-events-none -z-50 rounded-[28px]" style={{ width: '560px' }}>
                                <div ref={profileCardRef} className="w-full rounded-[28px] overflow-hidden relative" style={{ background: '#0a0a0a', fontFamily: '"Comfortaa", cursive' }}>
                                    {/* Watermark pattern */}
                                    <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
                                         style={{ backgroundImage: `url('/gowlogo.png')`, backgroundSize: '30px 30px', backgroundRepeat: 'repeat', transform: 'rotate(-15deg) scale(1.6)' }} />
                                    {/* Gradient glow top-right */}
                                    <div className="absolute top-0 right-0 w-40 h-40 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(26, 97, 64,0.15) 0%, transparent 70%)' }} />
                                    {/* Gradient glow bottom-left */}
                                    <div className="absolute bottom-0 left-0 w-32 h-32 rounded-full pointer-events-none" style={{ background: 'radial-gradient(circle, rgba(26, 97, 64,0.08) 0%, transparent 70%)' }} />

                                    <div className="relative z-10 flex flex-row items-stretch p-6 gap-5">
                                        {/* LEFT: Avatar + Identity */}
                                        <div className="flex flex-col items-center justify-center gap-3 min-w-[120px]">
                                            <div className="w-[72px] h-[72px] rounded-full flex items-center justify-center overflow-hidden border-[3px] border-[#1A6140]/60 shadow-[0_0_20px_rgba(26, 97, 64,0.3)]">
                                                {(userProfile?.avatar || userProfile?.xProfileImage) ? (
                                                    <img src={userProfile?.avatar || userProfile?.xProfileImage} alt="avatar" className="w-full h-full object-cover" />
                                                ) : (
                                                    <div className="w-full h-full bg-[#1A6140]/15 flex items-center justify-center">
                                                        <User size={30} className="text-[#1A6140]/60" />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-center">
                                                <h3 className="text-sm font-black uppercase tracking-[0.15em] text-white leading-tight">
                                                    {userProfile?.username || 'Trader'}
                                                </h3>
                                                <p className="text-[8px] font-mono text-white/30 mt-1">
                                                    {address ? `${address.slice(0,6)}...${address.slice(-4)}` : '---'}
                                                </p>
                                            </div>
                                        </div>

                                        {/* Vertical divider */}
                                        <div className="w-px self-stretch bg-gradient-to-b from-transparent via-[#1A6140]/30 to-transparent flex-none" />

                                        {/* RIGHT: Stats */}
                                        <div className="flex-1 flex flex-col justify-between gap-2.5 min-w-0">
                                            {/* Row 1: Win Rate + Trades */}
                                            <div className="flex gap-2.5">
                                                <div className="flex-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] p-3">
                                                    <div className="text-[7px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">Win Rate</div>
                                                    <div className="text-xl font-black text-[#1A6140] leading-none">{derivedStats.winRate.toFixed(1)}%</div>
                                                </div>
                                                <div className="flex-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] p-3">
                                                    <div className="text-[7px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">Trades</div>
                                                    <div className="text-xl font-black text-white leading-none">{derivedStats.totalTrades}</div>
                                                </div>
                                            </div>
                                            {/* Row 2: Wins + PnL */}
                                            <div className="flex gap-2.5">
                                                <div className="flex-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] p-3">
                                                    <div className="text-[7px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">Wins</div>
                                                    <div className="text-xl font-black text-[#1A6140] leading-none">{derivedStats.totalWins}</div>
                                                </div>
                                                <div className="flex-1 rounded-2xl bg-white/[0.04] border border-white/[0.06] p-3">
                                                    <div className="text-[7px] font-black uppercase tracking-[0.2em] text-white/30 mb-1">All-Time PnL</div>
                                                    <div className={`text-xl font-black leading-none ${pnlStats.netPnl >= 0 ? 'text-[#1A6140]' : 'text-[#FF6B6B]'}`}>
                                                        {pnlStats.netPnl >= 0 ? '+' : ''}{pnlStats.netPnl.toFixed(2)}
                                                    </div>
                                                </div>
                                            </div>
                                            {/* Footer Bar */}
                                            <div className="flex items-center justify-between mt-1">
                                                <img src="/gowlogo.png" alt="15market" className="h-5 w-auto opacity-60" />
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-1 h-1 rounded-full bg-[#1A6140] animate-pulse" />
                                                    <span className="text-[7px] font-black uppercase tracking-[0.15em] text-white/25">ARC TESTNET</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Action buttons (outside the card so they don't get saved) */}
                            <div className="flex items-center gap-3 w-full">
                                <button
                                    onClick={async () => {
                                        if (!profileCardRef.current) return;
                                        try {
                                            const dataUrl = await toPng(profileCardRef.current, {
                                                cacheBust: true,
                                                quality: 1,
                                                pixelRatio: 3,
                                                backgroundColor: '#0a0a0a'
                                            });
                                            const link = document.createElement('a');
                                            link.download = `15market-${userProfile?.username || 'trader'}-card.png`;
                                            link.href = dataUrl;
                                            link.click();
                                            setToast('Card Saved!');
                                        } catch (err) {
                                            console.error('Failed to save:', err);
                                            setToast('Save Failed');
                                        }
                                    }}
                                    className="flex-1 py-3.5 bg-[#1A6140] text-white text-[10px] font-black uppercase tracking-widest rounded-full hover:brightness-110 active:scale-[0.98] transition-all shadow-[0_4px_20px_rgba(26, 97, 64,0.3)] flex items-center justify-center gap-2"
                                >
                                    <Download size={14} /> Save Card
                                </button>
                                <button
                                    onClick={() => setIsProfileCardOpen(false)}
                                    className={`flex-1 py-3.5 ${isLight ? 'bg-white/80 text-[#133a2a] hover:bg-white' : 'bg-white/10 text-white hover:bg-white/20'} text-[10px] font-black uppercase tracking-widest rounded-full transition-all flex items-center justify-center gap-2`}
                                >
                                    <X size={14} /> Close
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {modalConfig && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/30 backdrop-blur-sm">
                    <motion.div initial={{opacity:0,scale:0.9,y:20}} animate={{opacity:1,scale:1,y:0}}
                        className={`w-full max-w-md ${isLight ? 'bg-white border-[#e2ece5]' : 'bg-[#1a1a1a] border-white/10'} border shadow-2xl rounded-[32px] p-8`}>
                        <div className="flex flex-col items-center text-center">
                            <div className={`w-16 h-16 rounded-2xl ${isLight ? 'bg-[#eef5f1]' : 'bg-white/5'} flex items-center justify-center mb-6`}>
                                {modalConfig.type==='alert'?<AlertCircle size={32} className="text-[#1A6140]"/>:<Zap size={32} className="text-[#1A6140]"/>}
                            </div>
                            <h3 className={`text-2xl font-black ${isLight ? 'text-[#133a2a]' : 'text-white'} mb-2 uppercase`}>{modalConfig.title}</h3>
                            <p className={`text-sm font-medium ${isLight ? 'text-[#133a2a]/50' : 'text-white/50'} mb-8 whitespace-pre-line`}>{modalConfig.message}</p>
                            <div className="grid grid-cols-2 gap-4 w-full">
                                {modalConfig.type==='confirm' && (
                                    <button onClick={() => setModalConfig(null)} className={`py-4 ${isLight ? 'bg-[#eef5f1] text-[#133a2a] hover:bg-[#e2ece5]' : 'bg-white/10 text-white hover:bg-white/20'} text-xs font-black uppercase tracking-widest rounded-full transition-all`}>Cancel</button>
                                )}
                                <button onClick={() => { if(modalConfig.onConfirm) modalConfig.onConfirm(); setModalConfig(null); }}
                                    className={`py-4 ${isLight ? 'bg-[#133a2a] hover:bg-[#1a4a37]' : 'bg-white/10 hover:bg-white/20'} text-white text-xs font-black uppercase tracking-widest rounded-full transition-all ${modalConfig.type==='alert'?'col-span-2':''}`}>
                                    {modalConfig.confirmText||"OK"}
                                </button>
                            </div>
                            {modalConfig.footer && <div className="mt-6 w-full">{modalConfig.footer}</div>}
                        </div>
                    </motion.div>
                </div>
            )}

            {promptConfig && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center px-4 bg-black/30 backdrop-blur-sm">
                    <motion.div initial={{opacity:0,scale:0.9,y:20}} animate={{opacity:1,scale:1,y:0}}
                        className={`w-full max-w-md ${isLight ? 'bg-white border-[#e2ece5]' : 'bg-[#1a1a1a] border-white/10'} border shadow-2xl rounded-[32px] p-8`}>
                        <div className="flex flex-col">
                            <h3 className={`text-2xl font-black ${isLight ? 'text-[#133a2a]' : 'text-white'} mb-6 uppercase text-center`}>{promptConfig.title}</h3>
                            <input type={promptConfig.inputType||"text"} autoFocus placeholder={promptConfig.placeholder} value={promptValue}
                                onChange={(e) => setPromptValue(e.target.value)}
                                className={`w-full ${isLight ? 'bg-[#f0f6f2] border-[#e2ece5] text-[#133a2a] placeholder:text-[#133a2a]/30' : 'bg-white/5 border-white/10 text-white placeholder:text-white/30'} border rounded-2xl py-4 px-6 font-bold text-center focus:border-[#1A6140]/50 outline-none transition-all mb-6`}
                                onKeyDown={(e) => { if(e.key==='Enter'){promptConfig.onConfirm(promptValue);setPromptConfig(null);} }}/>
                            <div className="grid grid-cols-2 gap-4 w-full">
                                <button onClick={() => {setPromptConfig(null);setPromptValue("");}} className={`py-4 ${isLight ? 'bg-[#eef5f1] text-[#133a2a] hover:bg-[#e2ece5]' : 'bg-white/10 text-white hover:bg-white/20'} text-xs font-black uppercase tracking-widest rounded-full transition-all`}>Cancel</button>
                                <button onClick={() => {promptConfig.onConfirm(promptValue);setPromptConfig(null);setPromptValue("");}} className={`py-4 ${isLight ? 'bg-[#133a2a] hover:bg-[#1a4a37]' : 'bg-white/10 hover:bg-white/20'} text-white text-xs font-black uppercase tracking-widest rounded-full transition-all`}>Confirm</button>
                            </div>
                            {promptConfig.footer && <div className="mt-6 w-full">{promptConfig.footer}</div>}
                        </div>
                    </motion.div>
                </div>
            )}

            <AnimatePresence>
                {isMobileMenuOpen && (
                    <>
                        {/* Dark Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setIsMobileMenuOpen(false)}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[9998]"
                        />
                        {/* Side Drawer Menu */}
                        <motion.div
                            initial={{ x: '100%' }}
                            animate={{ x: 0 }}
                            exit={{ x: '100%' }}
                            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                            className={`fixed top-0 right-0 w-[65%] max-w-[300px] h-full z-[9999] rounded-l-[32px] flex flex-col gap-3 p-6 pt-24 ${isLight ? 'bg-white border-l border-[#1A6140]/20' : 'bg-[#0a0a0a] border-l border-white/10'} overflow-hidden`}
                            style={{ boxShadow: isLight ? '0 0 50px rgba(0, 0, 0, 0.18), 0 0 80px rgba(26, 97, 64, 0.20)' : '0 0 60px rgba(0, 0, 0, 0.65), 0 0 90px rgba(26, 97, 64, 0.35)' }}
                        >
                            {isLight && (
                                <div className="absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
                            )}
                            
                            {/* Close — pulled lower so it clears the phone status bar */}
                            <button onClick={() => setIsMobileMenuOpen(false)} className={`absolute right-6 z-10 p-2 rounded-xl border ${isLight ? 'bg-white/50 border-[#1A6140]/20 text-[#0a261a] shadow-sm hover:bg-white' : 'bg-white/5 border-white/10 text-white'}`}
                                style={{ top: 'calc(env(safe-area-inset-top) + 3.5rem)' }}>
                                <X size={16} />
                            </button>

                            <button onClick={() => { setIsMobileMenuOpen(false); onDocs(); }} className={`flex items-center gap-4 w-full p-4 rounded-2xl relative z-10 ${isLight ? 'bg-white shadow-[0_4px_12px_rgba(26, 97, 64,0.15)] border border-[#1A6140]/10 hover:bg-[#f0f6f2] text-[#0a261a]' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all`}>
                                <BookOpen size={16} className="text-[#1A6140]"/> <span className="text-[10px] font-black uppercase tracking-widest">Docs</span>
                            </button>
                            <button onClick={() => { setIsMobileMenuOpen(false); onCampaign(); }} className={`flex items-center gap-4 w-full p-4 rounded-2xl relative z-10 ${isLight ? 'bg-white shadow-[0_4px_12px_rgba(26, 97, 64,0.15)] border border-[#1A6140]/10 hover:bg-[#f0f6f2] text-[#0a261a]' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all`}>
                                <Trophy size={16} className="text-[#1A6140]"/> <span className="text-[10px] font-black uppercase tracking-widest">Campaign</span>
                            </button>
                            <button onClick={() => { setIsMobileMenuOpen(false); onTransferHub?.() || onOpenCircleWallet?.(null); }} className={`flex items-center gap-4 w-full p-4 rounded-2xl relative z-10 ${isLight ? 'bg-white shadow-[0_4px_12px_rgba(26, 97, 64,0.15)] border border-[#1A6140]/10 hover:bg-[#f0f6f2] text-[#0a261a]' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all`}>
                                <Send size={16} className={isLight ? 'text-[#0a261a]/70' : 'text-white/70'}/> <span className="text-[10px] font-black uppercase tracking-widest">Transfer Hub</span>
                            </button>
                            <button onClick={() => { setIsMobileMenuOpen(false); setIsNotificationsOpen(true); }} className={`flex items-center gap-4 w-full p-4 rounded-2xl relative z-10 ${isLight ? 'bg-white shadow-[0_4px_12px_rgba(26, 97, 64,0.15)] border border-[#1A6140]/10 hover:bg-[#f0f6f2] text-[#0a261a]' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all`}>
                                <Bell size={16} className={isLight ? 'text-[#0a261a]/70' : 'text-white/70'}/> <span className="text-[10px] font-black uppercase tracking-widest">Notifications</span>
                            </button>
                            <button onClick={() => { setIsMobileMenuOpen(false); setNewUsername(userProfile?.username || ''); setLinkedEmail(userProfile?.email || ''); setIsSettingsOpen(true); }} className={`flex items-center gap-4 w-full p-4 rounded-2xl relative z-10 ${isLight ? 'bg-white shadow-[0_4px_12px_rgba(26, 97, 64,0.15)] border border-[#1A6140]/10 hover:bg-[#f0f6f2] text-[#0a261a]' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all`}>
                                <Settings size={16} className={isLight ? 'text-[#0a261a]/70' : 'text-white/70'}/> <span className="text-[10px] font-black uppercase tracking-widest">Settings</span>
                            </button>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {toast && (
                <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[300]">
                    <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} exit={{opacity:0,y:20}}
                        className="bg-[#133a2a] text-white px-6 py-3 rounded-2xl shadow-2xl text-xs font-black uppercase tracking-widest">
                        {toast}
                    </motion.div>
                </div>
            )}
        </div>
    );
};


