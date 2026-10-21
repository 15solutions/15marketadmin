import { useEffect, useState, useCallback, useRef, useMemo, Component, Suspense, lazy } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAccount, useWalletClient, useSwitchChain } from "wagmi";
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { useTradingWallet } from './hooks/useTradingWallet';
import { GlobalTradeScroller } from "./components/GlobalTradeScroller";
import {
  MessageSquare, User, Trophy, Calendar, CheckCircle, ChevronRight,
  Image as ImageIcon, PartyPopper, Settings, LogOut, Coins, Menu, X, Shield, Lock,
  History, ChevronUp, ChevronDown, Share2, ExternalLink, Zap, Activity, TrendingUp,
  Layers, Sun, Moon, AlertTriangle
} from "lucide-react";
import { Stamp } from "./components/Stamp";
import { isTradeInFlight, isTradeSettled, isTradeOverdue } from "./utils/tradeStatus";
import { parseEther, parseUnits } from "viem";
// Solana imports removed

import * as ethers from "ethers";
import { publicClient } from "./client";

import { WalletBalance } from "./components/WalletBalance";
import { LandingPage } from "./components/LandingPage";
import { DashboardPage } from "./components/DashboardPage";
import ComingSoonPage from "./components/ComingSoonPage";
import { CircleWalletPage } from "./components/CircleWalletPage";
import { ReferralHub } from "./components/ReferralHub";

import HelpPage from "./components/HelpPage";

// Lazy load conditionally rendered components
const ProfileModal = lazy(() => import("./components/ProfileModal").then(m => ({ default: m.ProfileModal })));
const PnLModal = lazy(() => import("./components/PnLModal").then(m => ({ default: m.PnLModal })));
// const TransactionReceiptModal = lazy(() => import("./components/TransactionReceiptModal").then(m => ({ default: m.TransactionReceiptModal })));
const TradeShareCard = lazy(() => import("./components/TradeShareCard"));
const OnboardingFlow = lazy(() => import("./components/OnboardingFlow").then(m => ({ default: m.OnboardingFlow })));
const MessagingSystem = lazy(() => import("./components/MessagingSystem"));
import { ARC_CONTRACT_ADDRESS, ARC_USDC_ADDRESS, KEEPER_URL, KEEPER_URL_ARC, ADMIN_TOKEN, ARC_RPC, ARC_RPC_BACKUP, ARC_CHAIN_ID } from "./constants";


// Memoized Sub-components
import { TradeTerminal } from "./components/TradeTerminal";
import { LiveExecution } from "./components/LiveExecution";
import { TradeHistory } from "./components/TradeHistory";
import { UnifiedWalletButton } from "./components/UnifiedWalletButton";
import { OrderBook } from "./components/OrderBook";
import { ActiveTradesSidebar } from "./components/ActiveTradesSidebar";
import { MascotLoader } from "./components/MascotLoader";
import CustomChart from './components/CustomChart';
import MobileTradeView from './components/MobileTradeView';
import Toast from "./components/Toast";
import SuccessOverlay from "./components/SuccessOverlay";
import { ThemeToggle } from "./components/ThemeToggle";
import SideHistoryPane from "./components/SideHistoryPane";
import WalletConnectionLoading from "./components/WalletConnectionLoading";
import GlobalLoader from "./components/GlobalLoader";

import LeftSidebar from './components/LeftSidebar';
import TradingWidget from './components/TradingWidget';
import TradeHistoryTable from './components/TradeHistoryTable';
// Rounds chart logic merged into LiveStreamingChart/CustomChart for performance
import { socketService } from './utils/socket';
import { priceSocketService } from './utils/priceSocket';

// Robust Error Boundary to prevent platform-wide crashes
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, errorInfo) { console.error("Platform Error caught by Boundary:", error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[1000] bg-[#050505] flex flex-col items-center justify-center p-8 text-center text-white">
          <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mb-6 border border-red-500/20">
            <Shield className="text-red-500" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tighter mb-2">Platform Interrupted</h1>
          <p className="text-xs text-white/40 mb-8 max-w-xs">{this.state.error?.message || "An unexpected error occurred in the UI layer."}</p>
          <button onClick={() => window.location.reload()} className="px-8 py-3 bg-[#1A6140] rounded-xl font-black uppercase text-xs tracking-widest">Restart Terminal</button>
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Mobile Bottom History Pane for V2 (Slide-up drawer style)
 */
const MobileBottomHistoryPane = ({ isOpen, onToggle, tradeHistory, theme, onViewReceipt, userProfile }) => {
  const isDark = theme !== 'light';

  return (
    <motion.div
      initial={false}
      animate={{
        y: isOpen ? 0 : 'calc(100% - 48px + 1%)',
      }}
      transition={{ type: 'spring', damping: 28, stiffness: 220 }}
      className="fixed inset-x-0 bottom-0 z-[110] flex flex-col pointer-events-none"
      style={{ height: '279px' }}
    >
      <div className={`
        w-full h-full pointer-events-auto
        backdrop-blur-xl border-t rounded-t-[40px]
        flex flex-col overflow-hidden
        ${isDark
          ? 'bg-[#0D2B1D]/80 shadow-[0_-20px_60px_rgba(0,0,0,0.5)] border-white/10'
          : 'bg-white/80 shadow-2xl border-t-[2px] border-[#1A6140]'}
      `}>
        {/* Horizontal Toggle Handle Bar */}
        <div
          onClick={onToggle}
          className={`
            w-full h-12 flex items-center justify-center cursor-pointer 
            transition-all duration-300 relative shrink-0
            ${isDark
              ? 'bg-white/5 border-b border-white/5'
              : 'bg-[#1A6140] border-b border-[#1A6140]/20'}
          `}
        >
          {/* Branded "Glow Line" at the top edge */}
          {isDark && <div className="absolute top-0 left-0 right-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#1A6140] to-transparent opacity-90" />}

          <div className="flex items-center justify-center gap-3 w-full">
            <History size={14} className={isDark ? "text-white" : "text-white"} style={isDark ? { filter: 'drop-shadow(0 0 8px rgba(255,255,255,0.8))' } : {}} />
            <span className={`text-[11px] font-bold uppercase tracking-[0.25em] ${isDark ? "text-white" : "text-white"}`}
              style={{ fontFamily: '"Comfortaa", cursive' }}>
              TRADE HISTORY ({userProfile?.stats?.totalTrades || tradeHistory.length})
            </span>
            {isOpen ? <ChevronDown size={12} className={isDark ? "text-white/80" : "text-white/80"} /> : <ChevronUp size={12} className={isDark ? "text-white/80" : "text-white/80"} />}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 pb-12 flex flex-col gap-2">
          {tradeHistory.length === 0 ? (
            <div className={`h-full flex flex-col items-center justify-center opacity-20 text-center p-8 ${isDark ? 'text-white' : 'text-[#0f2618]'}`}>
              <History size={48} className="mb-4" />
              <p className="text-[10px] font-black uppercase tracking-widest">No history yet</p>
            </div>
          ) : (
            tradeHistory.slice(0, 50).map((trade) => {
              const isWin = trade.status === 'WON' || trade.status === 'PAID';
              const isLoss = trade.status === 'LOST';

              return (
                <div
                  key={trade.id}
                  className={`
                    p-4 rounded-2xl border transition-all active:scale-[0.98]
                    ${isDark ? 'bg-white/5 border-white/5' : 'bg-white/40 border-[#1A6140]/20 shadow-sm'}
                  `}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`
                        text-[9px] font-black px-2 py-0.5 rounded uppercase tracking-tighter
                        ${trade.direction === 'UP' ? 'bg-[#1A6140]/20 text-[#1A6140]' : 'bg-[#EF5350]/20 text-[#EF5350]'}
                      `}>
                        {trade.direction === 'UP' ? 'LONG' : (trade.direction === 'DOWN' ? 'SHORT' : trade.direction)}
                      </div>
                      <span className={`text-xs font-bold uppercase tracking-widest ${isDark ? 'text-white' : 'text-[#0a261a]'}`}>
                        {trade.symbol?.toUpperCase() || 'BTC'}
                      </span>
                    </div>
                    <div className="flex flex-col items-end">
                      <span className={`text-xs font-black uppercase ${isWin ? 'text-[#1A6140]' : isLoss ? 'text-[#EF5350]' : (isDark ? 'text-white/40' : 'text-[#0a261a]/40')}`}>
                        {isWin ? `+$${Number(trade.payout || 0).toFixed(2)}` : trade.status}
                      </span>
                      {isWin && (trade.payoutSettled || trade.status === 'PAID') && (
                        <span className="text-[10px] font-bold italic text-yellow-400 tracking-wider">
                          paid
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <div className={`text-[10px] font-medium ${isDark ? 'opacity-40 text-white' : 'text-[#0a261a]/60'}`}>
                      ${Number(trade.entryPrice).toFixed(2)} • {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                      <div className="flex items-center gap-2">
                        {isTradeSettled(trade) && (
                        <button
                          onClick={() => onViewReceipt(trade)}
                          className={`p-1.5 rounded-full border transition-all ${isDark ? 'bg-white/5 border-transparent text-white/40 hover:text-white' : 'bg-transparent border-[#1A6140]/20 text-[#0a261a]/40 hover:text-[#0a261a]/60 hover:bg-[#1A6140]/5'}`}
                        >
                          <Share2 size={12} />
                        </button>
                        )}
                      <a
                        href={`https://testnet.arcscan.app/tx/${trade.tx}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`p-1.5 rounded-full border transition-all ${isDark ? 'bg-white/5 border-transparent text-white/40 hover:text-white' : 'bg-transparent border-[#1A6140]/20 text-[#0a261a]/40 hover:text-[#0a261a]/60 hover:bg-[#1A6140]/5'}`}
                      >
                        <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </motion.div>
  );
};


// Onboarding is for first-time visitors only. A profile that already existed,
// or any local record of a previous session, means the user is returning and
// must go straight into the app. A missing or failed profile lookup is treated
// as returning too, so a network hiccup can never re-trigger onboarding.
function needsOnboarding(profile, addr) {
  const key = (addr || '').toLowerCase();
  if (!key) return true;
  try {
    if (localStorage.getItem(`15market_onboarded_${key}`) === 'true') return false;
    if (localStorage.getItem(`15market_profile_exists_${key}`) === 'true') return false;
  } catch { /* storage unavailable */ }
  if (!profile || profile.error) return false;
  if (profile.onboarded === true || profile.onboardedAt || profile.username) return false;
  const createdAt = Number(profile.createdAt || 0);
  if (!createdAt) return false;
  return Date.now() - createdAt < 60 * 60 * 1000;
}

const DissolveTransition = ({ isAnimating, targetTheme }) => {
  if (!isAnimating) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{
        duration: 0.8,
        times: [0, 0.4, 0.6, 1],
        ease: "easeInOut"
      }}
      className="fixed inset-0 z-[10000] pointer-events-none"
      style={{
        backgroundColor: targetTheme === 'light' ? '#8CB09D' : '#030303',
      }}
    />
  );
};

export default function UserApp() {
  const { isConnected, address: wagmiAddress, chainId: connectedChainId, status } = useAccount();
  const { switchChain, switchChainAsync } = useSwitchChain();
  const { data: walletClient } = useWalletClient();
  const { user, authenticated, ready: privyReady } = usePrivy();
  const { wallets } = useWallets();

  // Smart wallet (ERC-4337 via Pimlico) — used for CCTP source-chain gas
  const { smartWalletAddress, isSmartWalletReady } = useTradingWallet();

  // Authoritative address derivation: Prioritize Wagmi (External), then Smart Wallet, then EOA
  const address = useMemo(() => {
    if (wagmiAddress) return wagmiAddress;
    if (smartWalletAddress) return smartWalletAddress;
    if (user?.wallet?.address) return user.wallet.address;
    return null;
  }, [smartWalletAddress, wagmiAddress, user]);

  const embeddedWallet = useMemo(() => {
    if (!wallets || !Array.isArray(wallets)) return null;
    return wallets.find((w) => w.walletClientType === 'privy');
  }, [wallets]);

  const [theme, setTheme] = useState(() => localStorage.getItem('15market_theme') || 'dark');
  const [isAnimatingTheme, setIsAnimatingTheme] = useState(false);
  const [targetTheme, setTargetTheme] = useState(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('15market_theme', theme);
  }, [theme]);

  const isLight = theme === 'light';

  const toggleTheme = useCallback(() => {
    if (isAnimatingTheme) return;
    const nextTheme = theme === 'dark' ? 'light' : 'dark';

    // Show the branded loading modal during the switch
    setIsGlobalLoading(true);

    setTargetTheme(nextTheme);
    setIsAnimatingTheme(true);

    // Sync theme swap with the mid-point of the transition
    setTimeout(() => {
      setTheme(nextTheme);
    }, 450);

    // Complete the transition and hide the loader
    setTimeout(() => {
      setIsAnimatingTheme(false);
      setTargetTheme(null);
      setIsGlobalLoading(false);
    }, 1800);
  }, [theme, isAnimatingTheme]);

  // Keep-Alive Heartbeat (Prevents Backend from Sleeping while user is active)
  useEffect(() => {
    const isLocal = window.location.hostname === 'localhost';
    if (isLocal) return;

    const pulse = async () => {
      try {
        // Ping the health endpoint to keep the server warm
        await fetch(`${KEEPER_URL_ARC}/health`).catch(() => { });
        // Also ping the stats endpoint as a fallback
        await fetch(`${KEEPER_URL_ARC}/protocol-stats`).catch(() => { });
      } catch (e) { }
    };

    pulse(); // Initial ping
    const interval = setInterval(pulse, 120000); // 2 minute interval
    return () => clearInterval(interval);
  }, []);

  const [price, setPrice] = useState("0.00");
  const staticPriceFails = useRef(0);
  const [amount, setAmount] = useState("");
  const [sliderValue, setSliderValue] = useState(0);
  // const [balance, setBalance] = useState(0); // Removed in favor of evmBalance/sessionBalance logic
  const [direction, setDirection] = useState("DOWN");
  const [tradeHistory, setTradeHistory] = useState([]);
  const [activeTrades, setActiveTrades] = useState([]);

  const lastAddressRef = useRef(address);

  useEffect(() => {
    if (address && address !== lastAddressRef.current) {
      setTradeHistory([]);
      setActiveTrades([]);
      lastAddressRef.current = address;
    }
  }, [address]);

  useEffect(() => {
    tradeHistoryRef.current = tradeHistory;
  }, [tradeHistory]);

  useEffect(() => {
    activeTradesRef.current = activeTrades;
  }, [activeTrades]);

  const [timerActive, setTimerActive] = useState(false);
  const [duration, setDuration] = useState(15);
  const [timeLeft, setTimeLeft] = useState(15);

  // Show the branded splash on initial page load, cleared after health check passes
  const [isGlobalLoading, setIsGlobalLoading] = useState(true);
  const [globalLoadingProgress, setGlobalLoadingProgress] = useState(0);
  const [isAppReady, setIsAppReady] = useState(false);
  const [backendReady, setBackendReady] = useState(false);
  const [healthProgress, setHealthProgress] = useState(0);
  const isInitializing = status === 'reconnecting' || (status === 'connecting' && !isConnected);

  const [loadingProgress, setLoadingProgress] = useState(0);

  // Latch to the first LIVE trade (PENDING/RESOLVING) so a lingering settled or
  // PAYOUT_FAILED card at index 0 can never hide the next trade's countdown.
  // Fall back to the newest trade so a just-settled outcome flash still renders
  // during its ~1s cleanup window.
  //
  // An OVERDUE unsettled trade is deliberately not latched. The trading widget
  // replaces its controls with the active-trade animation for as long as
  // `activeTrade` exists, so a trade the backend failed to settle left the user
  // unable to place any trade at all. The trade itself is untouched and still
  // renders as PENDING in the history - overdue only decides whether it keeps
  // holding the controls, never what verdict it gets.
  const activeTrade =
    activeTrades.find(t => ['PENDING', 'RESOLVING'].includes(t.status) && !isTradeOverdue(t)) ||
    // The fallback must skip overdue trades too, or a single unsettled trade
    // would be excluded above and then immediately re-selected here, leaving the
    // widget blocked exactly as before.
    activeTrades.find(t => !isTradeOverdue(t)) ||
    null;

  // Backend Health Gate: Poll /health until backend responds, progress drives the three dots
  useEffect(() => {
    if (backendReady) return;

    let cancelled = false;
    let attempt = 0;
    const maxAttempts = 10;
    const healthUrl = `${KEEPER_URL_ARC}/health`;
    console.log(`[HealthGate] Starting health check: ${healthUrl}`);

    const checkHealth = async () => {
      if (cancelled) return;
      try {
        const res = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const data = await res.json();
          if (data.status === 'OK' && !cancelled) {
            console.log('[HealthGate] Backend ready');
            setHealthProgress(1);
            setBackendReady(true);
            setTimeout(() => {
              setIsGlobalLoading(false);
              setIsAppReady(true);
            }, 400);
            return;
          }
        }
      } catch (e) {
        console.warn(`[HealthGate] Attempt ${attempt + 1} failed:`, e.message);
      }

      if (cancelled) return;
      attempt++;
      setHealthProgress(Math.min(0.1 + (attempt / maxAttempts) * 0.85, 0.95));
      const delay = Math.min(1500 + attempt * 500, 6000);
      setTimeout(checkHealth, delay);
    };

    checkHealth();
    return () => { cancelled = true; };
  }, [backendReady]);

  // Loading progress animation
  useEffect(() => {
    if (!isAppReady) {
      const interval = setInterval(() => {
        setLoadingProgress(prev => (prev < 98 ? prev + (100 - prev) * 0.1 : prev));
      }, 100);
      return () => clearInterval(interval);
    } else {
      setLoadingProgress(100);
    }
  }, [isAppReady]);


  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [userProfile, setUserProfile] = useState(null);
  const [profileChecked, setProfileChecked] = useState(false);
  const [showActiveExpanded, setShowActiveExpanded] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_transactions_v1");
      const parsed = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(parsed)) return [];
      // Filter out invalid items to prevent rendering crashes
      return parsed.filter(tx =>
        tx &&
        typeof tx === 'object' &&
        (typeof tx.amount === 'string' || typeof tx.amount === 'number')
      );
    } catch (e) { return []; }
  });
  const [isPnLOpen, setIsPnLOpen] = useState(false);
  const [showSideHistory, setShowSideHistory] = useState(false);
  const [showMobileHistory, setShowMobileHistory] = useState(false);
  const [showFullHistory, setShowFullHistory] = useState(false);

  // Escape key collapses expanded history
  useEffect(() => {
    if (!showFullHistory) return;
    const onKey = (e) => { if (e.key === 'Escape') setShowFullHistory(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showFullHistory]);
  const [selectedPnLTrade, setSelectedPnLTrade] = useState(null);
  const [isShareCardOpen, setIsShareCardOpen] = useState(false);
  const [shareTrade, setShareTrade] = useState(null);
  const [view, setView] = useState("trading"); // "trading", "dashboard", "history", or "circle_wallet"
  const [circleWalletMode, setCircleWalletMode] = useState(null); // 'send' or 'receive'
  const [showCircleWallet, setShowCircleWallet] = useState(false);

  // WalletConnectionLoading disabled — Turnkey modal now opens instantly on click.
  // The branded splash runs on page load instead (isGlobalLoading above).
  const [isWalletLoading, setIsWalletLoading] = useState(false);
  const wasConnectedRef = useRef(isConnected);

  // PERSISTENCE: Transaction History

  // PERSISTENCE: Transaction History
  useEffect(() => {
    localStorage.setItem("15market_transactions_v1", JSON.stringify(transactionHistory));
  }, [transactionHistory]);

  // LOCK SCROLL for Mobile History Drawer
  useEffect(() => {
    if (showMobileHistory) {
      document.body.style.overflow = 'hidden';
      document.body.style.height = '100vh';
    } else {
      document.body.style.overflow = '';
      document.body.style.height = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.height = '';
    };
  }, [showMobileHistory]);

  const [userLocation, setUserLocation] = useState(null); // { country, countryCode, lat, lng }

  // Main Network State
  const [network, setNetwork] = useState("arc");
  const uiVersion = "v2"; // Sunsetting v1, V2 is now the only authoritative UI
  const [platformSettings, setPlatformSettings] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_citadel_settings");
      if (saved) return JSON.parse(saved);
    } catch (e) { }
    return {
      minBet: 1.0,
      maxBet: 1000000.0,
      maintenanceMode: false,
      tradingHalted: false,
      systemBanner: "",
      bannerLevel: "info"
    };
  });

  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [liveOdds, setLiveOdds] = useState(null);
  const [changes24h, setChanges24h] = useState({});

const performStealthChecks = useCallback(async (addr) => {
    if (!addr) return;

    // Don't re-show loader if backend is already confirmed ready
    if (!backendReady) {
      setIsGlobalLoading(true);
    }
    setGlobalLoadingProgress(0);
    setIsOffline(!navigator.onLine);

    // Adaptive timeout based on network conditions
    const getTimeout = () => {
        // Try to get network information if available
        if (navigator.connection && navigator.connection.effectiveType) {
            switch (navigator.connection.effectiveType) {
                case 'slow-2g':
                    return 8000; // 8 seconds for slow 2G
                case '2g':
                    return 6000; // 6 seconds for 2G
                case '3g':
                    return 4000; // 4 seconds for 3G
                default:
                    return 3000; // 3 seconds for 4G or better
            }
        }
        return 3000; // Default 3 seconds
    };

    const progressInterval = setInterval(() => {
        setGlobalLoadingProgress(prev => {
            if (prev < 90) return prev + (Math.random() * 10);
            return prev;
        });
    }, 100);

    const runChecks = async () => {
        try {
            if (!navigator.onLine) {
                setIsOffline(true);
                return false;
            }
            setIsOffline(false);

            // Timeout helper to prevent infinite loading if backend hangs
            const fetchWithTimeout = async (url, options = {}) => {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), getTimeout());
                try {
                    const res = await fetch(url, { ...options, signal: controller.signal });
                    clearTimeout(id);
                    return res;
                } catch (e) {
                    clearTimeout(id);
                    throw e;
                }
            };

            // Run checks in parallel to reduce total time
            const [profileRes, sessionRes] = await Promise.all([
                fetchWithTimeout(`${KEEPER_URL_ARC}/profiles/${addr.toLowerCase()}`).catch(() => null),
                fetchWithTimeout(`${KEEPER_URL_ARC}/session/init`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ address: addr.toLowerCase() })
                }).catch(() => null),
            ]);

            // Process profile result
            if (profileRes && profileRes.ok) {
              const pData = await profileRes.json();
              setUserProfile(pData);
              const mustOnboard = needsOnboarding(pData, addr);
              setShowOnboarding(mustOnboard);
              if (!mustOnboard) {
                localStorage.setItem(`15market_onboarded_${addr.toLowerCase()}`, 'true');
                localStorage.setItem(`15market_profile_exists_${addr.toLowerCase()}`, 'true');
              }
            } else {
              setShowOnboarding(false);
            }

            // Process session result
            if (sessionRes && sessionRes.ok) {
                const sData = await sessionRes.json();
                setSessionBalance(parseFloat(sData.balance || 0));
            }

            return true;
        } catch (e) {
            console.warn("[StealthChecks] Attempt failed:", e.message);
            return false;
        }
    };

    // Retry loop with exponential backoff for poor networks
    let success = await runChecks();
    let retryCount = 0;
    const maxRetries = navigator.onLine ? 3 : 0; // Fewer retries if initially offline
    
    while (!success && retryCount < maxRetries) {
        retryCount++;
        // Exponential backoff: 1s, 2s, 4s, etc. but cap at 10s
        const delay = Math.min(1000 * Math.pow(2, retryCount), 10000);
        
        await new Promise(resolve => setTimeout(resolve, delay));
        
        if (navigator.onLine) {
            success = await runChecks();
            if (success) break;
        } else {
            setIsOffline(true);
        }
    }

    // Stealth checks populate profile/session data in the background.
    // Only dismiss the loader if these checks were the ones that showed it
    // (i.e. backend was not yet ready when stealth checks started).
    clearInterval(progressInterval);
    setGlobalLoadingProgress(100);
    if (!backendReady) {
      // Health gate hasn't passed yet, these checks confirmed backend is reachable
      setHealthProgress(1);
      setBackendReady(true);
      setTimeout(() => {
        setIsGlobalLoading(false);
        setIsAppReady(true);
      }, 400);
    }
}, [address, backendReady]);

  // Trigger stealth checks when wallet connects or changes
  useEffect(() => {
    if (address) {
      performStealthChecks(address);
    } else {
      setIsGlobalLoading(false);
    }
  }, [address, performStealthChecks]);

  const fetchGlobalSettings = useCallback(async () => {
    try {
      const res = await fetch(`${KEEPER_URL_ARC}/settings`); // Uses normalized endpoint
      if (res.ok) {
        const data = await res.json();
        // Update both React state and localStorage
        setPlatformSettings(prev => {
          const updated = { ...prev, ...data };
          if (JSON.stringify(prev) !== JSON.stringify(updated)) {
            localStorage.setItem("15market_citadel_settings", JSON.stringify(updated));
            window.dispatchEvent(new Event('storage')); // Notify other tabs
          }
          return updated;
        });
      }
    } catch (e) {
    }
  }, []);

  useEffect(() => {
    fetchGlobalSettings();

    const syncLocal = () => {
      try {
        const loaded = JSON.parse(localStorage.getItem('15market_citadel_settings'));
        if (loaded) setPlatformSettings(loaded);
      } catch (e) { }
    };
    window.addEventListener('storage', syncLocal);

    return () => {
      window.removeEventListener('storage', syncLocal);
    };
  }, [fetchGlobalSettings]);

  // Apply theme to html and body elements
  useEffect(() => {
    const htmlElement = document.documentElement;
    const bodyElement = document.body;
    const rootElement = document.getElementById('root');

    if (theme === 'light') {
      htmlElement.classList.add('light');
      bodyElement.classList.add('light');
      if (rootElement) rootElement.classList.add('light');
    } else {
      htmlElement.classList.remove('light');
      bodyElement.classList.remove('light');
      if (rootElement) rootElement.classList.remove('light');
    }

    // Apply network-specific theme class
    if (network === 'arc') {
      htmlElement.classList.add('theme-arc');
      bodyElement.classList.add('theme-arc');
      if (rootElement) rootElement.classList.add('theme-arc');
    } else {
      htmlElement.classList.remove('theme-arc');
      bodyElement.classList.remove('theme-arc');
      if (rootElement) rootElement.classList.remove('theme-arc');
    }

    localStorage.setItem("15market_theme", theme);
  }, [theme, network]);

  const [showOnboarding, setShowOnboarding] = useState(false);

  // Auto-switch to Arc Testnet if wallet is on the wrong network (unless bridging)
  useEffect(() => {
    if (view !== 'circle_wallet' && isConnected && connectedChainId && connectedChainId !== ARC_CHAIN_ID) {
      switchChain?.({ chainId: ARC_CHAIN_ID });
    }
  }, [isConnected, connectedChainId, switchChain, view]);

  const [evmBalance, setEvmBalance] = useState("0");
  const [pendingStakes, setPendingStakes] = useState({}); // Tracking hash -> amount
  const [sessionMode, setSessionMode] = useState(true);
  const [evmSessionWallet, setEvmSessionWallet] = useState(null);
  const [sessionBalance, setSessionBalance] = useState(0);
  // Ref that always mirrors sessionBalance — used by async callbacks to avoid stale closures
  const sessionBalanceRef = useRef(0);
  const [depositAmount, setDepositAmount] = useState("0.1");
  const [isSessionSynced, setIsSessionSynced] = useState(() => localStorage.getItem("15market_session_synced") === "true");
  const [isSignerInitializing, setIsSignerInitializing] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isMessagingOpen, setIsMessagingOpen] = useState(false);

  // Security Handshake Purged

  const [treasuryBalance, setTreasuryBalance] = useState(0);
  const [toast, setToast] = useState(null); // { message, type, onClick }
  const [successOverlay, setSuccessOverlay] = useState(null); // { title }

  const notify = useCallback((message, type = 'success', onClick = null) => {
    setToast({ id: Date.now() + Math.random(), message, type, onClick });
  }, []);

  // Synchronous submit lock for executeTrade. isExecuting is React state, so
  // within one tick it still holds the previous value: two clicks in the same
  // tick both read false and both fire, sending two /session/execute calls with
  // two distinct bet ids. That is how a phantom bet got placed next to the real
  // one. A ref updates immediately, so it is the actual guard.
  const executeLockRef = useRef(false);

  // A submit whose HTTP response never arrived. The backend may still have
  // broadcast it, so we must not let the user fire a NEW bet id: that is a
  // second real stake. While this is set, new submits are refused and we poll
  // the read-only history endpoint until the bet's fate is known.
  const unresolvedSubmitRef = useRef(null);
  const unresolvedWatchRef = useRef(false);

  // Tapping a trade always opens the card. An unsettled trade shows a PENDING
  // card with a "check back later" disclaimer rather than being blocked, so
  // the user can see the stake and trade id while it is still live.
  // Receipt cards only exist for a settled result. A trade that is still open
  // (PENDING, RESOLVING, LOCKED, TIMEOUT, or any status the backend adds later)
  // has no verdict to share, so it shows a disclaimer dialog instead of a card.
  // See src/utils/tradeStatus.js for why this enumerates settled states.
  const [pendingTradeNotice, setPendingTradeNotice] = useState(null);

  const handleViewReceipt = useCallback((trade) => {
    if (!trade) return;
    if (isTradeInFlight(trade)) {
      setPendingTradeNotice(trade);
      return;
    }
    setShareTrade(trade);
    setIsShareCardOpen(true);
  }, []);

  const resolvingInProgress = useRef(new Set()); // Tracks IDs of trades currently being resolved
  // Authoritative lock echo: backend verdict (status + settlementPrice) per betId.
  // Written by trade_settled / trade_expired socket handlers so any downstream
  // logic (reconcile, UI reveal) can trust the backend's lock without re-guessing.
  const lockedResults = useRef(new Map());
  const activeTradesRef = useRef([]);
  const notifiedBackendDown = useRef(false); // Toast once per session per outage
  const tradeHistoryRef = useRef([]);
  const priceRef = useRef("0.00");
  const lastPriceUpdateRef = useRef(Date.now());
  const priceHistoryRef = useRef([]);
  const lastOptimisticActionTime = useRef(0);
  // 🗑️ REMOVED TRADES: IDs of trades that have been fully removed from activeTrades.
  // Prevents the reconciler from re-inserting them from backend data.
  const removedTradeIds = useRef(new Set());
  const cleanupTimers = useRef({});

  // Orientation & Device Detection (Decoupled & Robust)
  const [isSmallScreen, setIsSmallScreen] = useState(
    typeof window !== 'undefined' ? window.innerWidth < 1024 : false
  );
  const [isLandscapeBlocked, setIsLandscapeBlocked] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isMobileDevice = () => {
      const ua = navigator.userAgent || '';
      const touch = (navigator.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
      const mobileUa = /Mobi|Android|iPhone|iPad|iPod|Windows Phone|BlackBerry|Opera Mini|IEMobile/i.test(ua);
      // Touch + small viewport = phone/tablet. Touch on a large screen is a
      // touchscreen laptop and keeps the desktop layout.
      const touchHandheld = touch && Math.min(window.innerWidth, window.innerHeight) < 820;
      return mobileUa || touchHandheld;
    };

    // Best-effort OS-level lock. Unsupported browsers simply ignore this,
    // the rotate-back gate below still guarantees the disclaimer page.
    const requestPortraitLock = () => {
      try {
        const orientation = window.screen && window.screen.orientation;
        if (orientation && typeof orientation.lock === 'function') {
          const result = orientation.lock('portrait');
          if (result && typeof result.catch === 'function') result.catch(() => {});
        }
      } catch (_) { /* not supported */ }
    };

    const handleResize = () => {
      const portrait = window.innerHeight > window.innerWidth;
      const small = window.innerWidth < 1024;
      const mobile = isMobileDevice();
      setIsSmallScreen(small && portrait);
      // Portrait-only on mobile-class devices (phones + tablets). Desktop
      // browsers, including narrow windows, keep the full layout.
      setIsLandscapeBlocked(!portrait && mobile);
      if (portrait && mobile) requestPortraitLock();
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    if (window.screen && window.screen.orientation && window.screen.orientation.addEventListener) {
      window.screen.orientation.addEventListener('change', handleResize);
    }
    handleResize();
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      if (window.screen && window.screen.orientation && window.screen.orientation.removeEventListener) {
        window.screen.orientation.removeEventListener('change', handleResize);
      }
    };
  }, []);

  // Custom balance fetcher (Replaces Wagmi useBalance)
  // 1. Core Balance Fetchers
  const refetchEvmBalance = useCallback(async (force = false) => {
    if (!address) return;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${KEEPER_URL_ARC}/balance/${address}`, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        const formatted = data.balance;
        if (force) {
          setEvmBalance(formatted);
        } else {
          const msSinceLastAction = Date.now() - lastOptimisticActionTime.current;
          if (msSinceLastAction < 20000) return;
          setEvmBalance(prev => {
            const current = parseFloat(prev || '0');
            const newBal = parseFloat(formatted || '0');
            return Math.abs(newBal - current) > 0.000001 ? formatted : prev;
          });
        }
      }
    } catch (e) { }
  }, [address]);

  // Keep sessionBalanceRef in sync with sessionBalance state so async
  // callbacks always read the live value without stale closures.
  //
  // NOTE: the balance is deliberately NOT cached in localStorage. It was, and
  // that was wrong: localStorage is per-device, so a phone and a desktop each
  // kept their own number and disagreed with each other until the next server
  // response - the same cross-device divergence that made the mobile balance
  // look stuck. The server writes one shared snapshot to Redis and answers
  // /session/balance from it, so there is a single value every device agrees on.
  useEffect(() => {
    sessionBalanceRef.current = sessionBalance;
  }, [sessionBalance]);


  const updateEvmSessionBal = useCallback(async (force = false) => {
    if (!address) return;

    let timeoutId = null;
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${KEEPER_URL_ARC}/session/balance/${address}`, { signal: controller.signal });
      if (!res.ok) {
        // A non-2xx here means the backend answered but refused (e.g. 503 while
        // idempotency is unavailable). Previously this fell through silently and
        // the user just saw no balance with no clue why.
        console.warn(`[Balance] ${KEEPER_URL_ARC}/session/balance/${address} -> ${res.status} ${res.statusText}`);
        return;
      }
      const data = await res.json();
      const bal = parseFloat(data.balance);
      if (isNaN(bal)) {
        console.warn('[Balance] backend returned a non-numeric balance:', data?.balance);
        return;
      }
      setSessionBalance(bal);
    } catch (err) {
      // Previously an empty catch, so an unreachable backend was completely
      // invisible: the UI silently showed no balance. Surface it instead.
      const reason = err?.name === 'AbortError' ? 'timed out after 8s' : (err?.message || 'network/CORS failure');
      console.error(`[Balance] FAILED to reach ${KEEPER_URL_ARC}/session/balance/${address}: ${reason}`);
    } finally {
      // Was only cleared on the success path, so every failed request leaked
      // its abort timer.
      if (timeoutId) clearTimeout(timeoutId);
    }
  }, [address]);

  const triggerGlobalRefresh = useCallback((force = false) => {
    refetchEvmBalance(force);
    updateEvmSessionBal(force);
  }, [refetchEvmBalance, updateEvmSessionBal]);

  const handleShare = useCallback((trade) => handleViewReceipt(trade), [handleViewReceipt]);

  // 2. Authoritative Profile & History Sync
  // 2. Authoritative Profile & History Sync (Unified Reconciler)
  const reconcileTrades = useCallback((backendAllRaw) => {
    if (!backendAllRaw) return;

    // 1. DEDUPLICATE: Only process the most 'final' version of each trade from backend
    // Since backend now returns both Active and History in the same list, they may duplicate.
    const uniqueBackendById = new Map();
    const backendTradeKey = (t) => String(t.id || t.betId || t.nonce || t.tx || t.txHash || '');
    backendAllRaw.forEach(t => {
      const id = backendTradeKey(t);
      if (!id) return;
      const existing = uniqueBackendById.get(id);
      const statusOrder = { "PAID": 5, "WON": 5, "LOST": 5, "PAYOUT_FAILED": 5, "CANCELLED": 4, "DISPUTE": 3, "RESOLVING": 2, "PENDING": 1, "TIMEOUT": 0 };
      const newStatus = t.status || (t.settled ? (t.won ? "WON" : "LOST") : "PENDING");

      if (!existing || statusOrder[newStatus] > statusOrder[existing.status]) {
        const isUpTrade = (t.direction === 1 || String(t.direction) === "1" || t.direction === "UP" || t.direction === "buy");
        uniqueBackendById.set(id, {
          ...t,
          direction: isUpTrade ? "UP" : "DOWN",
          status: newStatus,
          owner: t.owner || t.user || t.userPublicKey || t.userAddress
        });
      }
    });

    const backendAll = Array.from(uniqueBackendById.values());

    // 2. NO FORCED REFRESH: Optimistic balance injection is handled by checkAndResolve.
    // We let the natural polling handle on-chain sync AFTER the guard period (30s) expires.
    // This prevents old on-chain balances from overwriting our instant winning credits.

    // 3. Absolute Sync: Use backend as source of truth for settled trades
    setTradeHistory(prev => {
      const mergedMap = new Map();

      // Helper to get a canonical ID for a trade
      const getTradeKey = (t) => String(t.id || t.betId || t.nonce || t.tx || t.txHash || "");

      // First, populate with backend trades (Source of Truth)
      backendAll.forEach(bt => {
        const key = getTradeKey(bt);
        if (key) mergedMap.set(key, bt);
      });

      // Then, merge with local trades, preserving authoritative fields
      prev.forEach(local => {
        const key = getTradeKey(local);
        if (!key) return;

        const bt = mergedMap.get(key);
        if (bt) {
          // If in both, merge them with a status hierarchy
const statusOrder = { "PAID": 5, "WON": 5, "LOST": 5, "PAYOUT_FAILED": 5, "CANCELLED": 4, "DISPUTE": 3, "RESOLVING": 2, "PENDING": 1, "TIMEOUT": 0 };
          const finalStatus = (statusOrder[local.status] || 0) > (statusOrder[bt.status] || 0) ? local.status : bt.status;

          mergedMap.set(key, {
            ...bt,
            ...local, // Prefer local fields for UI state (optimistic, etc)
            status: finalStatus,
            // But prefer backend for finalized result fields
            won: bt.won !== undefined ? bt.won : local.won,
            isWinning: bt.isWinning !== undefined ? bt.isWinning : local.isWinning,
            exitPrice: bt.exitPrice || local.exitPrice,
            payout: bt.payout || local.payout,
          });
        } else {
          // Retain all existing local history items (both settled and optimistic/pending)
          mergedMap.set(key, local);
        }
      });

      return Array.from(mergedMap.values())
        .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
        .slice(0, 100);
    });

    // 4. Update Active Trades (Monotonic Status)
    setActiveTrades(prev => {
      const now = Date.now();
      const GHOST_GRACE = 5000;
      const mergedMap = new Map();
      const getTradeKey = (t) => String(t.id || t.betId || t.nonce || t.tx || t.txHash || "");
      const finalBackendKeys = new Set(
        backendAll
          .filter(t => !['PENDING', 'RESOLVING'].includes(t.status))
          .map(getTradeKey)
      );

      // 1. Process Backend Active Trades
      backendAll.filter(t => {
        const tid = getTradeKey(t);
        if (removedTradeIds.current.has(tid)) return false;
        return ["PENDING", "RESOLVING", "WON", "LOST"].includes(t.status);
      }).forEach(t => {
        const key = getTradeKey(t);
        const local = prev.find(p => getTradeKey(p) === key);

        const startTime = (t.timestamp || t.startTime || local?.startTime || now);
        const normStart = startTime > 1000000000000 ? startTime : startTime * 1000;
        const expiryMs = local?.expiryMs || t.expiryMs || (normStart + ((t.duration || 15) * 1000));

        // Only keep in active view if not too old
        const maxAge = ((t.duration || 15) + 60) * 1000;
        if (now <= (expiryMs + GHOST_GRACE) && (now - normStart) <= maxAge) {
          // Monotonic: a poll must never downgrade a settled verdict. The
          // backend row can lag the socket (a Supabase write that failed and
          // is still in the outbox), so a stale PENDING here would flip a WON
          // card back to settling mid-reveal — or kill it entirely.
          const rank = { PAID: 5, WON: 5, LOST: 5, PAYOUT_FAILED: 5, CANCELLED: 4, DISPUTE: 3, RESOLVING: 2, PENDING: 1, TIMEOUT: 0 };
          const keepLocal = !!local && (rank[local.status] || 0) > (rank[t.status] || 0);
          mergedMap.set(key, {
            ...local,
            ...t,
            ...(keepLocal ? {
              status: local.status,
              won: local.won,
              exitPrice: local.exitPrice ?? t.exitPrice,
              payout: local.payout ?? t.payout
            } : null),
            startTime: normStart,
            expiryMs,
            confirmed: true
          });
        }
      });

      // 2. Process Local Active Trades (might be optimistic)
      prev.forEach(local => {
        const key = getTradeKey(local);
        if (!key || mergedMap.has(key) || finalBackendKeys.has(key) || removedTradeIds.current.has(key)) return;
        if (!['PENDING', 'RESOLVING'].includes(local.status)) return;

        const startTime = local.timestamp || local.startTime || now;
        const normExp = local.expiryMs || (startTime + ((local.duration || 15) * 1000));
        const maxAge = ((local.duration || 15) + 30) * 1000;
        if (now <= (normExp + GHOST_GRACE) && (now - startTime) <= maxAge) {
          mergedMap.set(key, { ...local, expiryMs: normExp });
        }
      });

      return Array.from(mergedMap.values());
    });
  }, [triggerGlobalRefresh]);

  /**
   * Initialize Server-Side Session Wallet (Stateless & Secure)
   *
   * Owns its own retry, with backoff and a cap. Retry used to be driven by
   * re-rendering: the failure path cleared the per-address "already attempted"
   * guard, and flipping isSignerInitializing re-ran the effect that reads that
   * guard, so a slow or failing /session/init restarted itself every timeout
   * period, forever. The UI never left "Syncing...", and the wallet was never
   * handed back as ready. Nothing about a retry should depend on when React
   * happens to render, so it lives here.
   */
  const initializeSessionWallet = useCallback(async () => {
    if (!address) return;

    // Every other balance fetch in this file aborts at 8s (see updateEvmSessionBal
    // and refetchEvmBalance). This one had no AbortController, so a hung request
    // left isSignerInitializing stuck true - and that flag is what renders
    // "Syncing..." in place of the wallet address.
    setIsSignerInitializing(true);

    const MAX_ATTEMPTS = 3;
    let lastError = null;

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        // 1s then 2s. Short enough to feel instant on a flaky phone network,
        // bounded so a genuinely down backend fails fast instead of hanging.
        await new Promise((r) => setTimeout(r, 1000 * attempt));
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(`${KEEPER_URL_ARC}/session/init`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: address.toLowerCase() }),
          signal: controller.signal
        });

        if (!res.ok) throw new Error(`Backend init failed (${res.status})`);

        const data = await res.json();
        if (!data.sessionAddress) throw new Error("No session address returned");

        setEvmSessionWallet({ address: data.sessionAddress, isRemote: true });
        setSessionBalance(parseFloat(data.balance) || 0);
        setIsSessionSynced(true);
        setSessionMode(true);
        localStorage.setItem(`15market_session_addr_${address.toLowerCase()}`, data.sessionAddress);

        setIsSignerInitializing(false);
        return;
      } catch (err) {
        lastError = err;
        console.warn(`[SessionInit] attempt ${attempt + 1}/${MAX_ATTEMPTS} failed:`, err.message);
      } finally {
        clearTimeout(timeoutId);
      }
    }

    // Out of attempts. Deliberately NOT clearing hasInitAttempted here: that
    // guard is per-address and is what stops this function from re-entering
    // itself via the effect. It is reset on an address change, and by the
    // explicit "Not Ready (Retry)" affordance in the dashboard.
    setIsSignerInitializing(false);
    console.warn('[SessionInit] giving up for this address:', lastError?.message);

    // The balance never depended on this call. /session/balance answers from the
    // reconciled ledger, and its own 5s poller keeps converging - so a failed
    // init costs an address confirmation, not the user's balance.
    updateEvmSessionBal(true);
  }, [address, updateEvmSessionBal]);

  const fetchMyProfile = useCallback(async () => {
    if (!address) return;
    try {
      const res = await fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`);
      if (res.ok) {
        const data = await res.json();
        if (data && !data.error) {
          setUserProfile(data);
          const mustOnboard = needsOnboarding(data, address);
          setShowOnboarding(mustOnboard);
          if (!mustOnboard) {
            localStorage.setItem(`15market_profile_exists_${address.toLowerCase()}`, "true");
            localStorage.setItem(`15market_onboarded_${address.toLowerCase()}`, "true");
          }

          if (Array.isArray(data.trades)) {
            reconcileTrades(data.trades);
          }
          // Safety net for the session wallet, routed through the same
          // per-address guard as the auto-init effect. This used to call
          // initializeSessionWallet() directly whenever no wallet was present,
          // so a backend that kept failing to return one had this re-arming the
          // whole init sequence on every profile poll - a second, slower version
          // of the "Syncing..." loop.
          if (!evmSessionWallet && !hasInitAttempted.current) {
            hasInitAttempted.current = true;
            initializeSessionWallet();
          }
        }
      } else if (res.status === 404) {
        // No profile row: only a genuinely new address gets onboarding. The
        // local markers are never cleared here, otherwise a transient 404 would
        // erase the evidence that this address has been here before.
        const returning = localStorage.getItem(`15market_profile_exists_${address.toLowerCase()}`) === "true"
          || localStorage.getItem(`15market_onboarded_${address.toLowerCase()}`) === "true";
        setShowOnboarding(!returning);
      }
    } catch (e) {
      console.error("Profile fetch error:", e);
      if (localStorage.getItem(`15market_profile_exists_${address.toLowerCase()}`) === "true") {
        setShowOnboarding(false);
      }
    } finally {
      setProfileChecked(true);
    }
  }, [address, initializeSessionWallet]);

  const hasInitAttempted = useRef(false);
  useEffect(() => { hasInitAttempted.current = false; }, [address]);

  // The session wallet is derived deterministically from the user's address, and
  // the backend derives the same value on every call - so for a returning user
  // the cached address IS the live address, and the wallet is tradeable the
  // instant it is restored. Nothing about being ready to trade should wait on a
  // network round trip.
  //
  // Read during render, not in an effect. Restoring it in an effect meant the
  // first frame after the address landed had no wallet at all, so the UI flashed
  // "Not Ready" for a frame (longer on a phone, whose main thread is busy with
  // the chart loop) before the effect caught up. localStorage is synchronous, so
  // the very first paint already has it.
  const cachedSessionAddr = address
    ? localStorage.getItem(`15market_session_addr_${address.toLowerCase()}`)
    : null;
  const resolvedSessionWallet = evmSessionWallet
    || (cachedSessionAddr ? { address: cachedSessionAddr, isRemote: true, cached: true } : null);

  // This is what the "Syncing..." placeholder is allowed to mean. It used to be
  // driven by isSignerInitializing - "is a request in flight" - which is a
  // different question, and on a phone that request was the first thing to
  // arrive. A user who already had a wallet sat behind a syncing label for a
  // wallet that was ready the whole time.
  const isSessionWalletReady = !!resolvedSessionWallet?.address;
  const isSessionWalletPending = !isSessionWalletReady && isSignerInitializing;

  // AUTO-INITIALIZE Session Wallet as soon as any address is available.
  // FAST PATH: Restore cached session address AND balance immediately so the UI
  // shows real values right away, before any network call completes.
  useEffect(() => {
    if (!address) return;
    const key = address.toLowerCase();

    // Instantly restore cached address for returning users
    const cachedAddr = localStorage.getItem(`15market_session_addr_${key}`);
    if (cachedAddr && !evmSessionWallet) {
      setEvmSessionWallet({ address: cachedAddr, isRemote: true, cached: true });
    }

    // One init attempt per address. hasInitAttempted is NOT cleared on failure -
    // clearing it here used to re-arm the call from inside its own failure path,
    // which is what turned one slow request into an endless "Syncing..." loop.
    // An address change resets it; so does the dashboard's explicit Retry.
    if (!hasInitAttempted.current) {
      hasInitAttempted.current = true;
      initializeSessionWallet();
    }
  }, [address, evmSessionWallet, initializeSessionWallet]);

  // 3. Aggressive Logic (Optimized: fewer redundant refreshes)
  const aggressiveRefresh = useCallback((force = false) => {
    triggerGlobalRefresh(force);
    setTimeout(() => triggerGlobalRefresh(force), 1000);
    fetchMyProfile();
  }, [triggerGlobalRefresh, fetchMyProfile]);

  // 4. Derived State
  const displayEvmBalance = useMemo(() => {
    let bal = parseFloat(evmBalance || "0");
    if (isNaN(bal)) bal = 0;
    Object.values(pendingStakes || {}).forEach(amt => { bal -= (amt || 0); });
    return Math.max(0, bal);
  }, [evmBalance, pendingStakes]);

  const balance = useMemo(() => parseFloat(displayEvmBalance || "0"), [displayEvmBalance]);

  // 5. Lifecycle Effects
  useEffect(() => {
    if (address) triggerGlobalRefresh(true);
  }, [address, triggerGlobalRefresh]);

  // Periodic session balance refresh (every 5s) — always sync with backend.
  useEffect(() => {
    if (!address) return;
    const interval = setInterval(() => {
      updateEvmSessionBal(true);
    }, 5000);
    return () => clearInterval(interval);
  }, [address, updateEvmSessionBal]);

  // Real-time Balance Sync
  useEffect(() => {
    if (!address) return;
    // JOIN room once per address change (socketService re-joins automatically
    // after every reconnect so settlement events are never emitted into the void).
    socketService.joinUser(address.toLowerCase());
  }, [address]);

  useEffect(() => {
    if (!address) return;

    // Bind Socket listeners
    const unbindBal = socketService.on('balance_update', (data) => {
      // Always accept balance updates from the backend — it is the source of truth.
      const val = data.balance || data.available;
      if (val !== undefined && val !== null) {
        const parsed = parseFloat(val);
        if (!isNaN(parsed) && parsed >= 0) {
          setSessionBalance(parsed);
        }
      }

      if (data.reason === 'DEPOSIT_DETECTED') {
        const amt = parseFloat(data.amount || 0);
        if (amt > 0) {
          notify(`${amt.toFixed(4)} USDC received in your trading wallet`, "success");
        }
      }

      if (data.reason === 'WIN' || data.reason === 'WIN_PAYOUT' || data.reason === 'WIN_PAYOUT_SETTLED') {
        const payoutAmt = parseFloat(data.payout || 0);
        const reasonLabel = data.reason === 'WIN_PAYOUT_SETTLED' ? 'Confirmed' : 'Received';

        notify(`$${payoutAmt.toFixed(2)} has been added to your balance`, "success", () => {
          // Find the trade in history or active to show receipt
          const tid = String(data.betId || "");
          const tx = String(data.txHash || "");
          const trade = [...activeTrades, ...tradeHistory].find(t =>
            (tid && String(t.id || t.nonce) === tid) ||
            (tx && String(t.tx || t.txHash) === tx)
          );
          if (trade) {
            setShareTrade({
              ...trade,
              tx: data.txHash || trade.tx
            });
            setIsShareCardOpen(true);
          }
        });

        if (data.reason === 'WIN_PAYOUT_SETTLED') {
          const tid = String(data.betId || "");
          const tx = String(data.txHash || "");
          const matchFn = t => (tid && String(t.id || t.nonce) === tid) || (tx && String(t.tx || t.txHash) === tx);
          setActiveTrades(prev => prev.map(t => matchFn(t) ? { ...t, payoutSettled: true, payout: payoutAmt > 0 ? payoutAmt : t.payout, tx: data.txHash || t.tx } : t));
          setTradeHistory(prev => prev.map(t => matchFn(t) ? { ...t, payoutSettled: true, payout: payoutAmt > 0 ? payoutAmt : t.payout, tx: data.txHash || t.tx } : t));
        }
        // Also write payout to trade record on WIN_PAYOUT (instant credit)
        if (data.reason === 'WIN_PAYOUT' && payoutAmt > 0) {
          const tid = String(data.betId || "");
          const matchFn = t => (tid && String(t.id || t.nonce) === tid);
          setActiveTrades(prev => prev.map(t => matchFn(t) ? { ...t, payout: payoutAmt } : t));
          setTradeHistory(prev => prev.map(t => matchFn(t) ? { ...t, payout: payoutAmt } : t));
        }
        triggerGlobalRefresh(true);
      }
    });

    // trade_tick and trade_expired handlers consolidated in authoritative block (line ~2130)

    const unbindSettled = socketService.on('trade_settled', (data) => {
      console.log("[Socket] Trade Settled:", data);
      const tid = String(data.betId || data.tradeId);
      const updateFn = (t) => {
        if (String(t.id || t.nonce) === tid) {
          return {
            ...t,
            status: data.won ? 'WON' : 'LOST',
            won: data.won,
            confirmed: true,
            payoutPending: data.won && t.status !== 'PAID',
            payout: data.payout !== undefined ? parseFloat(data.payout) : t.payout,
            exitPrice: data.exitPrice || t.exitPrice,
            settlementPrice: data.exitPrice || t.settlementPrice,
            amount: data.amount || t.amount,
          };
        }
        return t;
      };
      setActiveTrades(prev => prev.map(updateFn));
      setTradeHistory(prev => prev.map(updateFn));
    });

    // Redundant trade_settled listener removed. Consolidation into the main listener below.

    const unbindPayout = socketService.on('payout_completed', (data) => {
      console.log("[Socket] Payout Completed:", data);
      const tid = String(data.betId || data.tradeId);
      const payoutAmt = parseFloat(data.payout || 0);

      const updateFn = (t) => {
        if (String(t.id || t.tx || t.nonce) === tid) {
          return {
            ...t,
            status: 'PAID',
            payoutTx: data.txHash || data.tx,
            tx: data.txHash || data.tx,
            payoutPending: false,
            confirmed: true,
            payout: payoutAmt > 0 ? payoutAmt : t.payout,
          };
        }
        return t;
      };

      setActiveTrades(prev => prev.map(updateFn));
      setTradeHistory(prev => prev.map(updateFn));
      if (payoutAmt > 0) {
        notify(`Payout Confirmed: +$${payoutAmt.toFixed(2)}`, "success");
      }
      triggerGlobalRefresh(true);
    });

    const unbindPayoutFailed = socketService.on('payout_failed', (data) => {
      console.warn("[Socket] Payout Failed:", data);
      const tid = String(data.betId || data.tradeId);

      const updateFn = (t) => {
        if (String(t.id || t.tx || t.nonce) === tid) {
          return {
            ...t,
            status: 'PAYOUT_FAILED',
            payoutPending: false,
            error: data.message || "On-chain payout failed"
          };
        }
        return t;
      };

      setActiveTrades(prev => prev.map(updateFn));
      setTradeHistory(prev => prev.map(updateFn));
      notify(`Payout Failed: ${data.message || "Network Error"}`, "error");
    });

    // Consolidated trade_tick and trade_expired listeners moved to authoritative block below.


    // Redundant trade_settled listener removed. Consolidation into the main listener below.


    const unbindErr = socketService.on('terminal_error', (data) => {
      notify(data.message, "error");
      console.error("[Terminal Error]", data);
    });

    return () => {
      unbindBal();
      unbindPayout();
      unbindPayoutFailed();
      unbindSettled();
      unbindErr();
    };
  }, [address, notify, triggerGlobalRefresh]);




  // Periodic Universal Sync (Optimized for Instant Pulse Mode)
  useEffect(() => {
    if (address) {
      // 1. Initial Fetch (Balance only syncs on Mount or Transaction)
      triggerGlobalRefresh(true);
      fetchMyProfile();

      // 2. Ensure session wallet is initialized immediately if missing
      // (Consolidated with the auto-init logic above to prevent loops)
    }
  }, [address, triggerGlobalRefresh, fetchMyProfile]);

  const closeToast = useCallback(() => {
    setToast(null);
  }, []);

  // Compatibility wrapper for legacy setBalance calls
  const setBalance = useCallback((val) => {
    if (typeof val === 'function') {
      setEvmBalance(prev => {
        const num = parseFloat(prev || "0");
        return val(num).toString();
      });
    } else {
      setEvmBalance(val.toString());
    }
  }, []);

  // Network Detection
  const [chainId, setChainId] = useState(null);
  useEffect(() => {
    const checkChain = async () => {
      try {
        const id = await publicClient.getChainId();
        setChainId(id);
      } catch (e) { }
    };
    checkChain();
  }, []);

  // Sticky Authentication: Prevent flicker on sync or chain switch

  const wallet = useMemo(() => {
    if (!address) return { connected: false };

    return {
      connected: true,
      address: address,
      publicKey: null
    };
  }, [isConnected, address]);

  const login = () => {
  };

  const userObj = useMemo(() => {
    if (isConnected && address) return { wallet: { address } };
    return null;
  }, [isConnected, address]);

  const GREEN = "#1A6140";
  const CORAL = "#FF4444";

  useEffect(() => {
    localStorage.setItem("15market_network", "arc");
  }, []);

  const themeClass = "theme-arc";

  const toggleSessionMode = () => {
    // Session mode is now the only mode. This just ensures we are synced.
    if (!evmSessionWallet) {
      initializeSessionWallet();
    }
  };

  // 15MARKET REVENUE TRACKER (Auto-Signer Fees)
  const [autoSignerFees, setAutoSignerFees] = useState(() => {
    const saved = localStorage.getItem("15market_autosigner_fees");
    return saved ? JSON.parse(saved) : { arc: 0 };
  });

  // Fetch Treasury (Contract) Balance
  useEffect(() => {
    const fetchTreasury = async () => {
      try {
        const provider = new ethers.JsonRpcProvider(ARC_RPC);
        const bal = await provider.getBalance(ARC_CONTRACT_ADDRESS);
        setTreasuryBalance(parseFloat(ethers.formatEther(bal)));
      } catch (e) {
        console.warn("Treasury fetch error:", e.message);
      }
    };
    fetchTreasury();
  }, []);

  // Execute trade
  const executeTrade = async (params = null) => {
    // Determines the trade type (only classic exists today; kept for future modes)
    const activeType = params?.type || 'classic';

    // Block double-submission. The ref is the real guard; isExecuting is kept
    // guard; isExecuting is kept only to drive the button's disabled styling.
    if (isExecuting || executeLockRef.current) return;
    // A previous submit timed out. Its outcome is still unknown, so placing a
    // new bet id here would risk a second real stake. Wait for the watcher.
    if (unresolvedSubmitRef.current) {
      return notify("Still confirming your previous trade. One moment...", "error");
    }
    executeLockRef.current = true;

    // Every one of these validations returns before the trade is actually sent,
    // so each must hand the submit lock back or the user is locked out of
    // trading for the rest of the session.
    const bail = (fn) => { executeLockRef.current = false; return fn; };

    if (platformSettings.tradingHalted) {
      return bail(() => notify("TRADING HALTED BY ADMIN - Operations Paused", "error"));
    }

    const activeDirection = params?.direction || direction;
    const activeAmount = params?.amount || amount;
    const activeDuration = params?.duration || duration;

    let activePrice = parseFloat(price);
    if (!activePrice || activePrice <= 0) {
      return bail(() => notify("Waiting for price feed sync...", "error"));
    }
    if (!activeDirection) return bail(() => notify("Select UP or DOWN first", "error"));
    if (!activeAmount || parseFloat(activeAmount) <= 0) return bail(() => notify("Enter a valid amount", "error"));

    // For the embedded session model, the stake comes from the session wallet balance.
    const currentBal = sessionBalance;
    const sanitizedAmount = (activeAmount || "0").toString().replace(',', '.');
    const stakeAmt = parseFloat(sanitizedAmount);
    if (isNaN(stakeAmt) || stakeAmt <= 0) {
      return bail(() => notify("Invalid trade amount", "error"));
    }

    // Reserve a tiny margin for gas (USDC is gas on Arc)
    const gasMargin = 0.001;

    if (stakeAmt + gasMargin > currentBal) {
      return bail(() => notify(`Insufficient Session Balance. Need at least ${(stakeAmt + gasMargin).toFixed(4)} USDC. Please Deposit.`, "error"));
    }

    if (Number(activeAmount) < parseFloat(platformSettings.minBet)) {
      return bail(() => notify(`Min trade: ${platformSettings.minBet} ${network === 'arc' ? 'USDC' : 'SOL'}`, "error"));
    }

    // Ensure active expansion pane is controlled if necessary
    if (typeof setShowActiveExpanded === 'function') setShowActiveExpanded(false);

    // Generate truly unique bet ID immediately
    const addressSuffix = address ? parseInt(address.slice(-4), 16) : 0;
    const tradeId = Date.now() * 1000 + Math.floor(Math.random() * 1000000) + addressSuffix;
    const dirVal = (activeDirection === "buy" || activeDirection === "UP") ? 1 : 0;
    const ASSET_ID_MAP = { 'eth': 0, 'btc': 1, 'sol': 2, 'mon': 3, 'jup': 4, 'xrp': 5 };
    const assetId = ASSET_ID_MAP[activeMarket?.id?.toLowerCase()] || 0;
    // Guard against NaN: if activePrice is invalid, abort early
    if (isNaN(activePrice) || activePrice <= 0) {
      return bail(() => notify("Price feed not ready. Please wait.", "error"));
    }
    const entryPriceParams = (assetId === 2) ? Math.floor(activePrice * 1000000) : Math.floor(activePrice * 100);
    const activeUserAddr = (sessionMode && evmSessionWallet) ? evmSessionWallet.address : address;
    const now = Date.now();
    const amtNum = parseFloat(activeAmount);

    // --- INSTANT UI START ---
    // Lock to prevent rapid-fire race conditions
    setIsExecuting(true);

    try {
      if (!address) {
        throw new Error("Please sign in or connect wallet to trade");
      }

      let txHash;

      // ─── CLASSIC TRADING — EMBEDDED WALLET MODEL ───────────────────────────────
      // Step 1: Frontend calls /session/execute
      // Step 2: Backend derivations session wallet and sends stake to treasury on-chain
      // Step 3: Backend returns the txHash and registers the trade

      // --- Show trade card as PENDING immediately (Optimistic) ---
      const confirmedNow = Date.now();
      const dedupeAndAdd = (prev, item) => [item, ...prev.filter(t => (
        String(t.id) !== String(item.id) &&
        (!item.tx || String(t.tx) !== String(item.tx)) &&
        (!item.nonce || String(t.nonce) !== String(item.nonce))
      ))];
      const exactEntryPrice = (assetId === 2) ? (entryPriceParams / 1000000) : (entryPriceParams / 100);
      const optimisticTrade = {
        id: tradeId,
        direction: dirVal === 1 ? 'UP' : 'DOWN',
        amount: Number(activeAmount).toFixed(3),
        entryPrice: exactEntryPrice.toString(),
        timestamp: confirmedNow,
        status: 'PENDING',
        tx: null,
        nonce: tradeId,
        userPublicKey: address,
        owner: address,
        duration: activeDuration,
        network: 'arc',
        startTime: confirmedNow,
        expiryMs: confirmedNow + (activeDuration * 1000),
        symbol: activeMarket?.symbol || 'ETH',
        confirmed: false,
        isOptimistic: true,
      };
      setActiveTrades(prev => dedupeAndAdd(prev, optimisticTrade));
      setTradeHistory(prev => dedupeAndAdd(prev, optimisticTrade));

      // Optimistic deduction for instant UI feel
      setSessionBalance(prev => Math.max(0, prev - amtNum));
      lastOptimisticActionTime.current = Date.now();

      // --- Execute Trade via Backend ---
      const backgroundTrade = async () => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30s — chain confirmation can take time
        try {
          const res = await fetch(`${KEEPER_URL_ARC}/session/execute`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
              address,
              tradeParams: {
                id: tradeId.toString(),
                direction: dirVal,
                duration: Number(activeDuration),
                entryPrice: entryPriceParams.toString(),
                marketId: assetId,
                amount: sanitizedAmount,
              }
            })
          });
          clearTimeout(timeoutId);
          const data = await res.json();

          if (!res.ok) {
            // Restore balance ONLY on definitive failure (not timeout)
            notify(data.error || 'Trade failed', 'error');
            setSessionBalance(prev => prev + amtNum);
            setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
            setTradeHistory(prev => prev.filter(t => t.id !== tradeId));
            setIsExecuting(false);
            executeLockRef.current = false;
            return;
          }

          // ✅ Trade Active (On-chain stake confirmed)
          const confirmedTradeId = data.tradeId || tradeId;
          const txHash = data.txHash;

          setActiveTrades(prev => prev.map(t =>
            t.id === tradeId
              ? { ...t, id: confirmedTradeId, tx: txHash, confirmed: true, status: 'PENDING' }
              : t
          ));
          setTradeHistory(prev => prev.map(t =>
            t.id === tradeId
              ? { ...t, id: confirmedTradeId, tx: txHash, confirmed: true, status: 'PENDING' }
              : t
          ));

          notify('Trade Active ✓', 'success');
          setIsExecuting(false);
          executeLockRef.current = false;

          // Re-pull both balances from source of truth so every device
          // (desktop/mobile) converges on the same numbers after this trade.
          refetchEvmBalance(true);
          updateEvmSessionBal(true);
        } catch (err) {
          clearTimeout(timeoutId);
          console.error('[Trade] Execution error:', err.message);
          // On timeout/abort, DON'T restore balance — the backend may still be processing.
          // The backend's balance_update event will reconcile the actual balance.
          // Only restore on definitive non-timeout errors.
          if (err.name !== 'AbortError') {
            setSessionBalance(prev => prev + amtNum);
            setActiveTrades(prev => prev.filter(t => t.id !== tradeId));
            setTradeHistory(prev => prev.filter(t => t.id !== tradeId));
            setIsExecuting(false);
            executeLockRef.current = false;
            notify(err.message, 'error');
            return;
          }

          // Timeout: the bet id may or may not have reached the chain. Release
          // neither the optimistic row nor the balance, and KEEP the submit lock
          // so the user cannot fire a different bet id and stake twice. The
          // watcher below frees the lock once the backend's history proves
          // whether this bet exists.
          unresolvedSubmitRef.current = { tradeId, amount: amtNum, at: Date.now() };
          watchUnresolvedSubmit(address, tradeId);
          setIsExecuting(false);
          notify('⏳ Trade processing — confirming on-chain. Trading locked until it resolves.', 'error');
        }
      };

      backgroundTrade();

    } catch (err) {
      notify(err.message, "error");
      setIsExecuting(false);
      executeLockRef.current = false;
    }
  };

  // Watches a timed-out submit until the backend's history proves it either
  // exists (it went on-chain) or never appeared (safe to trade again). Read-only
  // and self-stopping; the surrounding reconciler owns any balance repair.
  const watchUnresolvedSubmit = useCallback(async (userAddr, betId) => {
    if (unresolvedWatchRef.current) return;
    unresolvedWatchRef.current = true;
    const startedAt = Date.now();
    const MAX_WAIT_MS = 90000;
    const POLL_MS = 3000;
    try {
      while (Date.now() - startedAt < MAX_WAIT_MS) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        let rows = [];
        // Bounded fetch: without an abort a dead link hangs here past
        // MAX_WAIT_MS and the submit lock is held indefinitely instead of 90s.
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        try {
          const res = await fetch(`${KEEPER_URL_ARC}/history/${userAddr}`, { signal: controller.signal });
          if (res.ok) {
            const data = await res.json();
            rows = Array.isArray(data) ? data : (data?.trades || []);
          }
        } catch (_) { /* backend still down; keep waiting */ }
        finally { clearTimeout(timeoutId); }

        const found = rows.some((t) => String(t.id ?? t.betId ?? t.bet_id) === String(betId));
        if (found) {
          // It is on-chain. The normal history reconciler adopts the real verdict.
          notify('Trade confirmed on-chain ✓', 'success');
          break;
        }
      }
    } finally {
      // Either way the id is resolved: the reconciler owns the final status and
      // any balance correction, so it is safe to let the user trade again.
      unresolvedSubmitRef.current = null;
      unresolvedWatchRef.current = false;
      executeLockRef.current = false;
      setIsExecuting(false);
    }
  }, [notify]);


  // Fetch and Index Trade History — AUTHORITATIVE reconciliation.
  // Polls every 10s (fast). The backend is the single source of truth for every
  // trade status; the UI never guesses a result. A PENDING/RESOLVING trade past
  // its countdown that missed its socket settlement event is resolved here in
  // exactly one of four honest ways:
  //   1. Backend already settled it → /history has the verdict → reconcileTrades adopts it.
  //   2. Every other overdue bet → POST /trades/:id/settle is attempted whether
  //      the backend knows it or not: if it has the bet it force-locks NOW and
  //      returns the verdict (adopted instantly); if it has no record, that's an
  //      honest 'trade never happened' → TIMEOUT after 30s to release the gate.
  //   3. Backend is DOWN/unreachable → once a trade is >25s past its countdown
  //      (far beyond any legitimate settlement time) it is released honestly as
  //      TIMEOUT so the UI never sits in RESOLVING with no error. The record is
  //      kept and auto-corrects to the real WON/LOST verdict when the backend returns.
  useEffect(() => {
    if (!address) {
      // DONT clear it here, because Wagmi takes a moment to reconnect on refresh!
      // Runs for ANY connected account — including pure session-wallet (Privy)
      // users who are not wallet-connected — so authoritative settlement is never
      // gated behind a connected EOA.
      return;
    }

    const addr = address.toLowerCase();
    const settleCooldown = new Map(); // betId -> last force-settle attempt (ms)

    // A fetch that can't hang the reconcile loop forever when the backend goes
    // half-alive: aborts after 6s so the next 10s tick still runs.
    const fetchWithTimeout = (url, opts = {}, ms = 6000) => {
      const controller = new AbortController();
      const tid = setTimeout(() => controller.abort(), ms);
      return fetch(url, { ...opts, signal: controller.signal })
        .finally(() => clearTimeout(tid));
    };

    const fetchTradeHistory = async () => {
      const now = Date.now();
      let backendReachable = false;

      try {
        const res = await fetchWithTimeout(`${KEEPER_URL_ARC}/history/${addr}`);
        if (!res.ok) throw new Error(`history ${res.status}`);
        backendReachable = true;
        const backendAllRaw = await res.json();
        reconcileTrades(backendAllRaw);

        const current = activeTradesRef.current || [];
        const overdue = current.filter(t => {
          if (t.status !== 'PENDING' && t.status !== 'RESOLVING') return false;
          const exp = t.expiryMs || ((t.startTime || t.timestamp || now) + ((t.duration || 15) * 1000));
          return now > (exp + 5000); // past countdown end + small grace
        });

        for (const t of overdue) {
          const id = String(t.id || t.nonce || t.tx);
          if (!id) continue;
          const last = settleCooldown.get(id) || 0;
          if (now - last < 10000) continue;       // re-check at most every 10s per bet
          settleCooldown.set(id, now);

          try {
            const sr = await fetchWithTimeout(`${KEEPER_URL_ARC}/trades/${id}/settle`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address: addr }),
            });
            const sData = await sr.json().catch(() => null);

            if (sr.ok && sData && (sData.status === 'WON' || sData.status === 'LOST')) {
              // Adopt the backend verdict immediately — accurate, never client-guessed.
              const settledRec = {
                ...t,
                status: sData.status,
                won: sData.won,
                entryPrice: sData.entryPrice ?? t.entryPrice,
                exitPrice: sData.exitPrice,
                settlementPrice: sData.exitPrice,
                payout: sData.payout || '0.00',
                amount: sData.amount ?? t.amount,
                symbol: sData.symbol ?? t.symbol,
                settledAt: sData.settledAt || now,
                backendSettled: true,
                balanceApplied: true,
                isOptimistic: false,
              };
              const upd = (x) => (String(x.id || x.nonce || x.tx) === id) ? { ...x, ...settledRec } : x;
              setActiveTrades(prev => prev.map(upd));
              setTradeHistory(prev => prev.some(x => String(x.id || x.nonce || x.tx) === id)
                ? prev.map(upd)
                : [settledRec, ...prev]);
              if (t.status === 'RESOLVING' || sData.status === 'WON') {
                notify(
                  sData.status === 'WON' ? `✅ Trade Won +${sData.payout}` : '❌ Trade Lost',
                  sData.status === 'WON' ? 'success' : 'error'
                );
              }
            } else if (!sr.ok && sr.status === 404 && now - (t.startTime || t.timestamp || now) > 30000) {
              // Backend genuinely has no record of this bet (e.g. the placement
              // never completed or it restarted mid-trade). Honest TIMEOUT — never
              // a fabricated LOST — and TIMEOUT is in finalStatuses, so the card
              // leaves active view and the TradingWidget gate releases fast so the
              // next trade can be taken.
              setActiveTrades(prev => prev.map(x =>
                (String(x.id || x.nonce || x.tx) === id)
                  ? { ...x, status: 'TIMEOUT', won: undefined, payout: '0.00', backendSettled: false }
                  : x
              ));
            }
          } catch { /* backend unreachable — the 10s poll will retry */ }
        }
      } catch (e) {
        // /history itself failed: the backend is DOWN or unreachable. A trade
        // already well past its countdown can't get an authoritative answer until
        // the backend returns, so release it honestly instead of spinning in
        // RESOLVING forever with no error. It stays in tradeHistory as TIMEOUT
        // and auto-corrects to the real WON/LOST verdict from /history later.
        if (!backendReachable) {
          const current = activeTradesRef.current || [];
          const toRelease = current.filter(t => {
            if (t.status !== 'PENDING' && t.status !== 'RESOLVING') return false;
            const exp = t.expiryMs || ((t.startTime || t.timestamp || now) + ((t.duration || 15) * 1000));
            return now > (exp + 25000); // >> any legitimate backend settle time
          });
          if (toRelease.length > 0 && !notifiedBackendDown.current) {
            const released = new Set(toRelease.map(t => String(t.id || t.nonce || t.tx)));
            setActiveTrades(prev => prev.map(x =>
              released.has(String(x.id || x.nonce || x.tx))
                ? { ...x, status: 'TIMEOUT', won: undefined, payout: '0.00', backendSettled: false, backendUnreachable: true }
                : x
            ));
            notifiedBackendDown.current = true;
            notify('Backend unreachable — unresolved trades released; they re-sync automatically when it returns.', 'error');
          }
        }
      }
    };

    fetchTradeHistory();
    // 10s fallback poll — socket events handle instant updates; this guarantees
    // no trade ever strands in RESOLVING beyond a single poll cycle.
    const interval = setInterval(fetchTradeHistory, 10000);
    // The moment a dead socket comes back, reconcile immediately: every live
    // event in the gap was missed, and waiting out the poll shows stale rows.
    const unbindConnect = socketService.onConnect(() => { fetchTradeHistory(); });

    // Mobile browsers freeze timers when backgrounded; a trade that expired while
    // away must re-sync the moment the user returns to the app.
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchTradeHistory();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      unbindConnect();
      settleCooldown.clear();
      notifiedBackendDown.current = false;
    };
  }, [address, isConnected, network, evmSessionWallet, userProfile?.sessionWalletAddress]);

  // ── CLIENT-SIDE EXPIRY WATCHDOG ──────────────────────────────────────────────
  // Guarantees a trade NEVER sits at countdown 0 in PENDING, or hangs in
  // RESOLVING with no verdict, even when the socket is dead (common on mobile
  // backgrounding / reconnect gaps).
  //   1. A PENDING trade past its expiry flips to RESOLVING locally — NEUTRAL,
  //      never a verdict: only the backend decides WON/LOST.
  //   2. The moment it flips (or is already RESOLVING) we POST /trades/:id/settle
  //      once per trade (3s cooldown) to pull the LOCKED verdict over HTTP — the
  //      same authoritative lock the socket events would have delivered.
  useEffect(() => {
    if (!address) return;
    const addr = address.toLowerCase();
    const settleSoon = new Map(); // betId -> last HTTP force-settle attempt (ms)
    let running = false;

    const interval = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const now = Date.now();
        const current = activeTradesRef.current || [];
        for (const t of current) {
          const st = t.status;
          if (st !== 'PENDING' && st !== 'RESOLVING') continue;
          const exp = t.expiryMs || ((t.startTime || t.timestamp || now) + ((t.duration || 15) * 1000));
          if (now <= exp) continue;
          const id = String(t.id || t.nonce || t.tx);
          if (!id) continue;

          // 1. PENDING -> RESOLVING (neutral transition; verdict still backend-only)
          if (st === 'PENDING') {
            setActiveTrades(prev => prev.map(x =>
              (String(x.id || x.nonce || x.tx) === id) ? { ...x, status: 'RESOLVING' } : x
            ));
          }

          // 2. Pull the locked verdict over HTTP (cooldown 3s per bet)
          const last = settleSoon.get(id) || 0;
          if (now - last < 3000) continue;
          settleSoon.set(id, now);
          try {
            const controller = new AbortController();
            const tid = setTimeout(() => controller.abort(), 6000);
            const res = await fetch(`${KEEPER_URL_ARC}/trades/${encodeURIComponent(id)}/settle`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ address: addr }),
              signal: controller.signal,
            }).finally(() => clearTimeout(tid));
            const sData = await res.json().catch(() => null);
            if (res.ok && sData && (sData.status === 'WON' || sData.status === 'LOST')) {
              const settledRec = {
                ...t,
                id, nonce: id,
                status: sData.status,
                won: !!sData.won,
                entryPrice: sData.entryPrice ?? t.entryPrice,
                exitPrice: sData.exitPrice,
                settlementPrice: sData.exitPrice,
                payout: sData.payout != null ? String(sData.payout) : t.payout,
                settledAt: sData.settledAt || now,
                backendSettled: true,
                balanceApplied: true,
              };
              const upd = (x) => (String(x.id || x.nonce || x.tx) === id) ? { ...x, ...settledRec } : x;
              setActiveTrades(prev => prev.map(upd));
              setTradeHistory(prev => prev.some(x => String(x.id || x.nonce || x.tx) === id)
                ? prev.map(upd)
                : [settledRec, ...prev]);
              // Socket may be dead — refresh balances so a WON payout lands even
              // without the balance_update event.
              updateEvmSessionBal(true);
              refetchEvmBalance(true);
            }
          } catch { /* retried after cooldown; the 10s reconciler is the safety net */ }
        }
      } finally { running = false; }
    }, 1000);

    return () => clearInterval(interval);
  }, [address, updateEvmSessionBal, refetchEvmBalance]);

  useEffect(() => {
    localStorage.setItem("15market_autosigner_fees", JSON.stringify(autoSignerFees));
  }, [autoSignerFees]);

  const recordFee = async (network, amount) => {
    // 1. Update local state for instant UI feedback
    setAutoSignerFees(prev => ({
      ...prev,
      arc: prev.arc + amount
    }));

    // 2. Persist to Keeper Backend
    const targetUrl = KEEPER_URL_ARC;
    try {
      await fetch(`${targetUrl}/record-fee`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': ADMIN_TOKEN
        },
        body: JSON.stringify({ network: 'arc', amount })
      });
    } catch (e) {
    }
  };



  const navigate = useNavigate();


  useEffect(() => {
    // Session persistence handled by Reown/Wagmi
  }, []);
  // Run once on mount

  // Auto-Switch logic removed 


  // Force Chain Switch when network state changes to 'arc'


  // Debug logging for connection issues
  useEffect(() => {
    if (isConnected) {
    }
  }, [isConnected, address]);

  // Dynamic Market State


  const defaultTokens = useMemo(() => ([
    { id: 'eth', symbol: 'ETH', name: 'Ethereum', pair: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640', pythId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', binance: 'ETHUSDT', kraken: 'ETHUSD' },
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pair: '0xCBCdAf43E4E8BA277685D62aA137BA4904f421ac', pythId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', binance: 'BTCUSDT', kraken: 'XBTUSD' },
    { id: 'sol', symbol: 'SOL', name: 'Solana', pair: '0x127452f3f1da03d95f9bbd58a2d10c1154b33001', pythId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', binance: 'SOLUSDT', kraken: 'SOLUSD' },
    { id: 'mon', symbol: 'MON', name: 'Monad', pythId: '0x0000000000000000000000000000000000000000000000000000000000000000', binance: 'MONUSDT' },
    { id: 'avax', symbol: 'AVAX', name: 'Avalanche', pythId: '0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7', binance: 'AVAXUSDT' },
  ]), []);

  const mergeMarketWithDefault = useCallback((market) => {
    if (!market?.id) return market;
    const fallback = defaultTokens.find(t => t.id === market.id);
    return fallback ? { ...fallback, ...market } : market;
  }, [defaultTokens]);

  const [activeMarket, setActiveMarket] = useState(() => {

    const saved = localStorage.getItem('15market_listed_tokens');
    const listed = saved ? JSON.parse(saved) : defaultTokens;

    const activeId = localStorage.getItem('15market_active_token_id') || 'eth';
    const selected = listed.find(t => t.id === activeId) || listed[0];
    const fallback = defaultTokens.find(t => t.id === selected?.id);
    return fallback ? { ...fallback, ...selected } : selected;
  });





  const [globalTickerTrades, setGlobalTickerTrades] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const fetchGlobalTicker = async () => {
      try {
        const res = await fetch(`${KEEPER_URL_ARC}/history`);
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !Array.isArray(data)) return;
        const settled = data
          .filter(t => ['WON', 'LOST'].includes(t.status))
          .sort((a, b) => (b.timestamp || b.createdAt || 0) - (a.timestamp || a.createdAt || 0))
          .slice(0, 20);
        setGlobalTickerTrades(settled);
      } catch (e) { }
    };
    fetchGlobalTicker();
    const interval = setInterval(fetchGlobalTicker, 12000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  const tickerTrades = useMemo(() => {
    const recent = tradeHistory;
    const mine = (recent || []).slice(-20).reverse().map(t => ({
      win: t.status === 'WON' || t.result === 'WIN',
      sym: (t.symbol || 'ETH').toUpperCase(),
      val: t.amount || '0.00',
    }));
    if (mine.length > 0) return mine;
    return globalTickerTrades.map(t => ({
      win: t.status === 'WON' || t.result === 'WIN',
      sym: (t.symbol || 'ETH').toUpperCase(),
      val: t.amount || '0.00',
    }));
  }, [tradeHistory, globalTickerTrades]);

  // ─── UNIFIED PRICE CONSUMPTION ───
  // UI pricing is BACKEND-AUTHORITATIVE: the app consumes the engine's own
  // 'price' broadcast (cache.prices — the exact feed settlement uses) so the
  // terminal, chart and verdict can never disagree.
  const oraclePricesRef = useRef({ btc: 0, eth: 0, sol: 0, mon: 0, avax: 0, ts: {} });
  const [oraclePrices, setOraclePrices] = useState({ btc: 0, eth: 0, sol: 0, mon: 0, avax: 0 });
  const [streamStatus, setStreamStatus] = useState('connecting');

  useEffect(() => {
    // 1. Unified High-Speed Price Stream — BACKEND-AUTHORITATIVE.
    // The chart, terminal and settlement MUST show the SAME price, otherwise a
    // trade can look WON on the chart (client Pyth/Binance/MEXC feed) while the
    // engine settles it LOST from its own feed (cache.prices) — and vice versa.
    // So we ONLY accept the backend relayed 'price' events here ('backend' source).
    // Every other client-side source is excluded on purpose.
    const acceptBackendPrice = (key, price, ts) => {
      if (oraclePricesRef.current[key] === undefined) return;
      oraclePricesRef.current[key] = price;
      oraclePricesRef.current.ts[key] = ts;
      setStreamStatus('active');
      lastPriceUpdateRef.current = Date.now();

      // Immediate UI update if we were stuck at 0.00
      if (priceRef.current === "0.00" || priceRef.current === "0") {
        const pStr = (Math.floor(price * 100) / 100).toFixed(2);
        setPrice(pStr);
        priceRef.current = pStr;
      }
    };

    const unbindDirect = priceSocketService.on('price', (data) => {
      // Only the backend relay feed is authoritative for the UI — this is the
      // exact same price the settlement engine writes to cache.prices.
      if (!data || data.source !== 'backend') return;
      acceptBackendPrice(data.key, data.price, data.ts || Date.now());
    });

    // 2. Backend Feed via the app's MAIN socket (raw engine broadcast).
    // Redundant path for the same authoritative events — keeps the UI stream
    // alive even if the priceSocketService relay socket is down.
    const unbindBackend = socketService.on('price', (data) => {
      if (data && data.key) acceptBackendPrice(data.key, data.price, data.ts || Date.now());
    });

    // Watchdog: If no price update for any asset in 5 seconds, mark as stalled
    const watchdog = setInterval(() => {
      const now = Date.now();
      const lastUpdate = lastPriceUpdateRef.current || 0;
      if (now - lastUpdate > 5000) {
        setStreamStatus('stalled');
      } else if (streamStatus === 'stalled' || streamStatus === 'connecting') {
        setStreamStatus('active');
      }
    }, 2000);

    return () => {
      unbindDirect();
      unbindBackend();
      clearInterval(watchdog);
    };
  }, []);

  // 2. Metronome: 200ms Pulse loop (5Hz) to drive UI/Chart
  // This achieves the "standardized/consistent" flow we discussed
  useEffect(() => {
    const pulseLoop = setInterval(() => {
      const currentAssetId = activeMarket?.id?.toLowerCase();
      const p = oraclePricesRef.current[currentAssetId];
      const sourceTs = oraclePricesRef.current.ts[currentAssetId] || Date.now();

      if (typeof p === 'number' && p > 0) {
        const truncated = Math.floor(p * 100) / 100;
        const pStr = truncated.toFixed(2);

        setPrice(pStr);
        priceRef.current = pStr;

        priceHistoryRef.current.push({ p: truncated, t: sourceTs });
        if (priceHistoryRef.current.length > 500) priceHistoryRef.current.shift();

        lastPriceUpdateRef.current = Date.now();
      }

      // Update all prices for the sidebar independently of the current asset
      setOraclePrices(prev => {
        let changed = false;
        const next = { ...prev };
        for (const [k, v] of Object.entries(oraclePricesRef.current)) {
          if (k === 'ts') continue;
          if (typeof v === 'number' && v > 0) {
            const trunc = Math.floor(v * 100) / 100;
            if (prev[k] !== trunc) {
              next[k] = trunc;
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }, 200);

    return () => clearInterval(pulseLoop);
  }, [activeMarket]);

  // ─── SOCKET.IO: Trade events + Backend-Authoritative Settlement ───
  useEffect(() => {
    socketService.connect();

    const unbindSettings = socketService.on('settings_update', (newSettings) => {
      setPlatformSettings(prev => {
        const updated = { ...prev, ...newSettings };
        localStorage.setItem('15market_citadel_settings', JSON.stringify(updated));
        return updated;
      });
    });

    const unbindLiveOdds = socketService.on('live_odds', (data) => {
      setLiveOdds(data);
    });

    const unbindMacro24h = socketService.on('macro_24h', (data) => {
      if (data && typeof data === 'object') setChanges24h(data);
    });

    // ── BACKEND-AUTHORITATIVE SETTLEMENT ──
    // The backend is the ONLY source of truth for trade results.
    const unbindSettled = socketService.on('trade_settled', (data) => {
      if (!data?.betId && !data?.id) return;

      const isMine = data.userAddr &&
        address && data.userAddr.toLowerCase() === address.toLowerCase();
      if (!isMine) return;

      const betId = String(data.betId || data.id);
      const finalStatus = data.won ? 'WON' : 'LOST';
      const exitPrice = data.exitPrice ? parseFloat(data.exitPrice).toFixed(2) : '0.00';
      const payout = data.payout ? parseFloat(data.payout).toFixed(4) : '0.00';

      console.log(`[Settlement] Backend settled #${betId}: ${finalStatus} @ $${exitPrice}`);
      try { lockedResults.current.set(betId, { status: finalStatus, settlementPrice: exitPrice }); } catch (e) {}
      removedTradeIds.current.add(betId);

      // Build the fully-settled trade record
      // NOTE: Backend sends 'stakeTxHash', not 'txHash'
      const resolvedTxHash = data.txHash || data.stakeTxHash || null;
      const settledRecord = {
        id: betId,
        nonce: betId,
        status: finalStatus,
        settlementPrice: exitPrice,
        entryPrice: data.entryPrice ? parseFloat(data.entryPrice).toFixed(2) : '0.00',
        exitPrice,
        payout,
        won: data.won,
        direction: data.direction === 1 || data.direction === 'UP' ? 'UP' : 'DOWN',
        amount: data.amount,
        symbol: data.symbol || 'ETH',
        duration: data.duration,
        timestamp: data.timestamp || Date.now(),
        txHash: resolvedTxHash,
        tx: resolvedTxHash,
        backendSettled: true,
        balanceApplied: true,
      };

      // Allow the reconciler to handle the removal after a grace period
      // setActiveTrades(prev => prev.filter(t => String(t.id) !== betId && String(t.nonce) !== betId));

      // Upsert into tradeHistory and setActiveTrades with final WON/LOST status
      const updateFn = (t) => {
        if (String(t.id) === betId || String(t.nonce) === betId ||
            (resolvedTxHash && (String(t.tx) === String(resolvedTxHash) || String(t.txHash) === String(resolvedTxHash)))) {
          return { ...t, ...settledRecord };
        }
        return t;
      };

      setActiveTrades(prev => prev.map(updateFn));
      setTradeHistory(prev => {
        const existing = prev.find(t =>
          String(t.id) === betId || String(t.nonce) === betId ||
          (resolvedTxHash && (String(t.tx) === String(resolvedTxHash) || String(t.txHash) === String(resolvedTxHash)))
        );
        if (existing) return prev.map(updateFn);
        return [settledRecord, ...prev];
      });

      if (data.won) {
        notify(`🏆 Trade WON! +$${payout}`, 'success');
      } else {
        notify('Trade LOST.', 'error');
      }

      // Refresh main wallet balance (winnings may have been sent back)
      lastOptimisticActionTime.current = 0;
      setTimeout(() => {
        updateEvmSessionBal(true);
        refetchEvmBalance(true);
      }, 1500);
    });

    const unbindBroadcast = socketService.on('broadcast', (data) => {
      console.log(`[Broadcast] New announcement: ${data.message}`);
      // Show notification instantly
      notify(`📢 ${data.message}`, 'info');

      // Update system banner if it's maintenance or emergency
      if (data.type === 'MAINTENANCE' || data.type === 'EMERGENCY') {
        setPlatformSettings(prev => ({
          ...prev,
          systemBanner: data.message,
          bannerLevel: data.type === 'EMERGENCY' ? 'error' : 'info'
        }));
      }
    });

    const unbindProviderUpdate = socketService.on('provider_application_update', (appStatus) => {
      setUserProfile(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          isProvider: appStatus.status === 'APPROVED',
          providerApplication: appStatus
        };
      });
      if (appStatus.status === 'APPROVED') {
        notify('Provider Application Approved! Generate your wallet.', 'success');
      } else if (appStatus.status === 'REJECTED') {
        notify('Provider Application Rejected.', 'error');
      }
    });

    return () => {
      unbindSettings();
      unbindLiveOdds();
      unbindMacro24h();
      unbindSettled();
      unbindBroadcast();
      unbindProviderUpdate();
    };
  }, [notify, updateEvmSessionBal, refetchEvmBalance, address, evmSessionWallet]);

  // ── Backend-Authoritative Trade Ticks ────────────────────────────────────────
  // The backend TradeMonitor emits trade_tick every second per active trade.
  // We use these to drive the countdown and live price in ActiveTradesSidebar.
  useEffect(() => {
    if (!address) return;

    const unbindTick = socketService.on('trade_tick', (data) => {
      setActiveTrades(prev => prev.map(t => {
        const isTarget = (String(t.id) === String(data.betId) || String(t.nonce) === String(data.betId));
        if (!isTarget) return t;

        // CRITICAL: If the trade is already 'Locked' (has a final result or hit 0 time), 
        // we IGNORE future ticks to prevent the result from flipping back and forth.
        const isFrontendExpired = t.timeLeft <= 0 || t.won !== undefined || t.status === 'RESOLVING';
        if (isFrontendExpired) return t;

        return {
          ...t,
          timeLeft: data.timeLeft,
          livePrice: data.currentPrice,
          lastTickPrice: data.currentPrice,
          isWinning: data.isWinning
        };
      }));
    });

    const unbindExpired = socketService.on('trade_expired', (data) => {
      const bid = String(data.betId);
      console.log(`[Trade] Authority Locked: #${bid} -> ${data.won ? 'WON' : 'LOST'} @ $${data.exitPrice}`);
      try { lockedResults.current.set(bid, { status: data.won ? 'WON' : 'LOST', settlementPrice: data.exitPrice }); } catch (e) {}

      setActiveTrades(prev => prev.map(t =>
        String(t.id) === bid || String(t.nonce) === bid
          ? {
              ...t,
              won: data.won,
              livePrice: data.exitPrice,
              exitPrice: data.exitPrice || t.exitPrice,
              settlementPrice: data.exitPrice || t.settlementPrice,
              timeLeft: 0,
              // trade_expired carries the AUTHORITATIVE locked verdict (won +
              // exitPrice from lockResult). Reveal it right now — WON or LOST —
              // exactly as fast as the loser path today, instead of hanging in
              // RESOLVING waiting for trade_settled (which a dropped socket can
              // swallow). trade_settled/payout_completed then confirm + credit.
              status: data.won ? 'WON' : 'LOST'
            }
          : t
      ));
    });

    return () => { unbindTick(); unbindExpired(); };
  }, [address]);

  // Sync Market Changes (Across Ports via Keeper)
  useEffect(() => {
    const syncMarket = async () => {
      try {
        const targetUrl = KEEPER_URL_ARC;
        // 1. Fetch Remote Listings from Keeper (Source of Truth)
        const res = await fetch(`${targetUrl}/listings`);
        const remoteListings = await res.json();

        if (Array.isArray(remoteListings) && remoteListings.length > 0) {
          const currentListedStr = localStorage.getItem('15market_listed_tokens');
          const remoteStr = JSON.stringify(remoteListings);

          if (currentListedStr !== remoteStr) {
            localStorage.setItem('15market_listed_tokens', remoteStr);
          }
        }

        // 2. Fetch Remote Platform Settings
        const settingsRes = await fetch(`${targetUrl}/settings`);
        const settingsData = await settingsRes.json();
        if (settingsData) {
          const settingsStr = JSON.stringify(settingsData);
          if (localStorage.getItem('15market_citadel_settings') !== settingsStr) {
            setPlatformSettings(settingsData);
          }
        }
      } catch (e) {
        // Fallback to local storage if keeper is down
      }

      // NO LONGER FORCIBLY OVERWRITING activeId FROM BACKEND
      // Use local selection as the authority
      const listed = JSON.parse(localStorage.getItem('15market_listed_tokens') || '[]');
      const activeId = localStorage.getItem('15market_active_token_id') || 'eth';
      const market = listed.find(t => t.id === activeId);
      const resolvedMarket = mergeMarketWithDefault(market);

      if (resolvedMarket && resolvedMarket.id !== activeMarket.id) {
        // Re-sync with current local authority
        setActiveMarket(resolvedMarket);
        setPrice("0");
      }
    };

    // Initial sync on mount
    syncMarket();

    // Listen for storage events (triggered by CustomChart when user selects asset)
    window.addEventListener('storage', syncMarket);

    // Polling fallback for remote updates (increased from 2s to 5s)
    const poller = setInterval(syncMarket, 5000);

    return () => {
      window.removeEventListener('storage', syncMarket);
      clearInterval(poller);
    };
  }, [activeMarket.id, network]);

  // Handle market changes from UI (persist to localStorage and sync with keeper)
  const handleMarketChange = useCallback(async (newMarket) => {
    if (!newMarket || newMarket.id === activeMarket.id) return;
    if (newMarket.id === 'mon' || newMarket.id === 'avax') return;

    localStorage.setItem('15market_active_token_id', newMarket.id);
    const resolvedMarket = mergeMarketWithDefault(newMarket);

    // Explicitly reset price to trigger loading modal in CustomChart
    setPrice("0");
    priceRef.current = "0";
    priceHistoryRef.current = [];

    setActiveMarket(resolvedMarket);

    // Sync with keeper
    try {
      await fetch(`${KEEPER_URL_ARC}/active-market`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeId: newMarket.id })
      });
    } catch (e) {
    }

    // Trigger price fetch for new market (now handled by embedded service)
  }, [activeMarket.id, mergeMarketWithDefault]);

  useEffect(() => {
    const detectLocation = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        const data = await res.json();
        setUserLocation({
          country: data.country_name,
          countryCode: data.country_code,
          lat: data.latitude,
          lng: data.longitude
        });
      } catch (e) {
      }
    };
    detectLocation();
  }, []);

  const minStake = useMemo(() => {
    return "0.1"; // 0.1 USDC min stake on Arc
  }, []);

  // Persistence handled by unified backend now



  // Startup Cleanup: Purge ghost trades
  useEffect(() => {
    const now = Date.now();
    setTradeHistory(prev => {
      let changed = false;
      const updated = prev.map(t => {
        if (["PENDING", "RESOLVING"].includes(t.status)) {
          const start = t.startTime || (t.nonce > 1000000000000 ? t.nonce : Math.floor(t.nonce / 100) * 1000);
          const expiry = start + ((t.duration || 15) * 1000);
          if (now > expiry + 60000) { // If it expired more than 60s ago
            changed = true;
            return { ...t, status: "TIMEOUT" };
          }
        }
        return t;
      });
      return changed ? updated : prev;
    });
    // Also clean active trades
    setActiveTrades(prev => prev.filter(t => {
      const expiry = (t.nonce || 0) + ((t.duration || 15) * 1000);
      return now < expiry + 60000;
    }));
  }, []);

  // Session Wallet - AUTO RESTORE/FETCH
  useEffect(() => {
    if (!address) return;

    // Default to true as the primary trading account
    setSessionMode(true);

    const storedAddr = localStorage.getItem(`15market_session_addr_${address.toLowerCase()}`);
    if (storedAddr) {
      setEvmSessionWallet({ address: storedAddr, isRemote: true });
    }
    // Automatically retrieve the derived session wallet without user signatures
    updateEvmSessionBal(true);
  }, [address, updateEvmSessionBal]);

  // NOTE: The actual "creation" now happens via handleSyncSession which we will rename/auto-trigger
  // We need to auto-trigger the sync if the user toggles session mode and has no key.









  // Slider / amount handlers - active balance aware
  const activeBal = useMemo(() => {
    const bal = sessionMode ? sessionBalance : parseFloat(evmBalance || '0');
    return bal;
  }, [sessionMode, sessionBalance, evmBalance]);

  const handleSliderChange = useCallback((e) => {
    const val = e.target.value;
    setSliderValue(val);
    if (activeBal > 0) {
      const calculated = (activeBal * val) / 100;
      const truncated = Math.floor(calculated * 100) / 100;
      setAmount(truncated.toFixed(2));
    }
  }, [activeBal]);

  const handleAmountChange = useCallback((e) => {
    let val = e.target.value;

    // Enforce 2 decimal truncation on input
    if (val.includes('.')) {
      const [int, dec] = val.split('.');
      if (dec.length > 2) {
        val = `${int}.${dec.slice(0, 2)}`;
      }
    }

    setAmount(val);
    const num = parseFloat(val);
    if (!isNaN(num) && activeBal > 0) setSliderValue(Math.min((num / activeBal) * 100, 100));
    else setSliderValue(0);
  }, [activeBal]);

  // Countdown Timer - Purely based on time, not price updates
  useEffect(() => {
    if (!timerActive || timeLeft <= 0) return;
    const interval = setInterval(() => {
      setTimeLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [timerActive, timeLeft]);

  // Cleanup resolution lock if trade is cleared manually
  useEffect(() => {
    // Clean up IDs that are no longer in activeTrades
    const activeIds = new Set(activeTrades.map(t => t.id));
    for (const id of resolvingInProgress.current) {
      if (!activeIds.has(id)) {
        resolvingInProgress.current.delete(id);
      }
    }
  }, [activeTrades]);

  // Result Resolution - SYNCED WITH SERVER
  const [serverTimeOffset, setServerTimeOffset] = useState(0);
  useEffect(() => {
    fetch(`${KEEPER_URL_ARC}/time`).then(r => r.json()).then(d => {
      setServerTimeOffset(d.time - Date.now());
    }).catch(() => { });
  }, []);

  useEffect(() => {
    // Result Resolution is now handled by the backend.
    // The frontend will receive 'balance_update' and 'trade_settled' events via Socket.io.
  }, [activeTrades, serverTimeOffset]);

  // isExecuting must mirror reality on every render, not once. The old
  // one-shot check ran 8s after the flag was set: if the trade was alive at
  // that moment but its verdict was missed later, the flag stuck true forever
  // and PLACING covered everything after the countdown. Overdue zombies don't
  // count as in-flight. (The unresolved-submit path holds its own separate
  // lock, untouched here.)
  useEffect(() => {
    if (!isExecuting) return;
    const live = (activeTradesRef.current || []).some(tr =>
      ['PENDING', 'RESOLVING'].includes(tr.status) && !isTradeOverdue(tr));
    if (live || unresolvedSubmitRef.current) return;
    setIsExecuting(false);
  }, [isExecuting, activeTrades]);

  // Safety Cleanup: Remove finalized trades after showing result.
  // RESOLVING is deliberately NOT in this list: it means "countdown done,
  // verdict not yet landed". Deleting it here removed the trade (and
  // blacklisted its id) about a second after the watchdog flipped it — on a
  // slow network the verdict always arrived after the deletion, so the
  // result card never had anything to show. Undecided trades wait for a real
  // verdict or a TIMEOUT conversion, which is final and is collected below.
  useEffect(() => {
    const finalStatuses = ["WON", "LOST", "PAID", "TIMEOUT", "PAYOUT_DELAYED", "PAYOUT_FAILED"];
    const finished = activeTrades.filter(t => finalStatuses.includes(t.status));

    finished.forEach(trade => {
      const tid = trade.id || trade.tx || trade.nonce;
      if (tid && !cleanupTimers.current[tid]) {
        // Start a removal timer ONLY if one doesn't exist for this specific trade
        cleanupTimers.current[tid] = setTimeout(() => {
          // 🗑️ Mark as permanently removed so the reconciler never re-adds it
          removedTradeIds.current.add(String(tid));
          setActiveTrades(prev => prev.filter(t => (t.id || t.tx || t.nonce) !== tid));
          delete cleanupTimers.current[tid];
          // Auto-cleanup the removed set after 10 minutes to keep memory bounded
          setTimeout(() => removedTradeIds.current.delete(String(tid)), 10 * 60 * 1000);
        }, 1000); // 1 second to see result, then auto-remove
      }
    });

    return () => {
      // Cleanup orphan timers if list empties
      if (activeTrades.length === 0) {
        Object.values(cleanupTimers.current).forEach(clearTimeout);
        cleanupTimers.current = {};
      }
    };
  }, [activeTrades]);



  // Platform Settings Sync



  // Arc Settlement Listener
  // REMOVED: publicClient.watchContractEvent — it polled the RPC continuously via HTTP,
  // exhausting the browser connection pool and freezing the platform after deposit/withdraw.
  // The backend already sends 'trade_settled', 'trade_expired', and 'balance_update' via socket,
  // making this redundant. All settlement state is now handled via socket events.

  // --- TRADE STATUS SYNC ---
  // When a trade hits WON status, just update the UI. Balance crediting is handled
  // entirely by the backend via `balance_update` socket event after on-chain confirmation.
  // This effect ONLY cleans up the trade card status — no balance crediting.
  useEffect(() => {
    const winningTrades = activeTrades.filter(t => t.status === "WON" && !t.balanceApplied);
    if (winningTrades.length === 0) return;

    // Mark as applied so we don't process again
    setActiveTrades(prev => prev.map(t =>
      t.status === "WON" && !t.balanceApplied ? { ...t, balanceApplied: true } : t
    ));
  }, [activeTrades]);


  /**
   * Credits a completed on-chain deposit in the backend ledger.
   *
   * The USDC has already been transferred by the time this runs, so a silent
   * failure here means real money sitting in the trading wallet that nothing
   * credits. We therefore:
   *   - sign the request (the backend rejects unsigned credits), and
   *   - retry with backoff, warning the user if it ultimately fails so they can
   *     re-submit rather than believing the money arrived in their balance.
   *
   * @returns {Promise<boolean>} whether the backend acknowledged the credit.
   */
  const confirmDepositOnBackend = useCallback(async ({ address, amount, txHash, signMessage }) => {
    const canonical = [
      '--- 15MARKET PROTOCOL ---',
      'ACTION: CONFIRM DEPOSIT',
      `AMOUNT: ${Number(amount).toFixed(6)} USDC`,
      `TX: ${txHash}`,
      `TIMESTAMP: ${Date.now()}`
    ].join('\n');

    let signature = null;
    try {
      signature = await signMessage(canonical);
    } catch (signErr) {
      notify("Deposit sent on-chain, but signing the confirmation failed. Balance may not update.", "error");
      return false;
    }

    const attempts = [0, 2000, 5000, 12000];
    for (let i = 0; i < attempts.length; i++) {
      if (attempts[i] > 0) await new Promise(r => setTimeout(r, attempts[i]));
      try {
        const res = await fetch(`${KEEPER_URL_ARC}/session/deposit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address,
            amount,
            txHash,
            message: canonical,
            signature
          })
        });
        if (res.ok) {
          updateEvmSessionBal(true);
          return true;
        }
        // 409 means this exact transfer was already credited — success from
        // the user's point of view, so do not surface it as a failure.
        if (res.status === 409) {
          updateEvmSessionBal(true);
          return true;
        }
        // Other 4xx means the request itself is wrong — retrying will not help.
        if (res.status >= 400 && res.status < 500) {
          const body = await res.json().catch(() => ({}));
          notify(body.error || "Deposit confirmation rejected.", "error");
          return false;
        }
        // 5xx / network error — the transfer is probably still pending. Retry.
      } catch {
        // Network error — retry.
      }
    }

    notify("Deposit is on-chain but not yet credited. It will be detected automatically — do not resend.", "error");
    return false;
  }, [notify, updateEvmSessionBal]);


  /**
   * DEPOSIT HANDLER
   * ---------------
   * Manages the flow of moving funds from the user's primary wallet (MetaMask/Base)
   * into the server-side Trading Session Wallet (EOA).
   * 
   * CRITICAL LOGIC:
   * 1. 1% PLATFORM FEE: We split the user's deposit on-chain. 99% goes to the session wallet, 
   *    and 1% goes to the Platform Treasury immediately.
   * 2. VERIFIED CREDITING: The backend re-checks the transfer on-chain and credits
   *    the 99% amount, so a dropped request can never silently lose the credit.
   * 3. MULTI-TRANSACTION FLOW: This involves two separate on-chain transactions.
   * 
   * @param {string|number} amt - The amount of USDC to deposit.
   */
  const handleDeposit = useCallback(async (amt) => {
    if (isExecuting) return; // Prevent double-submission

    try {
      const amtNum = parseFloat(amt);
      if (isNaN(amtNum) || amtNum <= 0) {
        notify("Invalid deposit amount", "error");
        return;
      }

      if (!address) {
        notify("Connect your wallet first", "error");
        return;
      }

      if (!walletClient) {
        notify("Wallet client not ready — please reconnect your wallet", "error");
        return;
      }

      const currentBal = parseFloat(evmBalance);
      if (currentBal < amtNum) {
        notify(`Insufficient balance. You have ${currentBal.toFixed(4)} USDC`, "error");
        return;
      }

      setIsExecuting(true);

      // --- AUTO-INITIALIZE SESSION WALLET IF MISSING ---
      // This ensures that new users have a trading wallet derived before their first deposit
      let activeSessionWallet = evmSessionWallet;
      if (!activeSessionWallet?.address) {
        try {
          const res = await fetch(`${KEEPER_URL_ARC}/session/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
          });
          if (res.ok) {
            const data = await res.json();
            activeSessionWallet = { address: data.sessionAddress, isRemote: true };
            setEvmSessionWallet(activeSessionWallet);
            setSessionBalance(parseFloat(data.balance));
            localStorage.setItem(`15market_session_addr_${address.toLowerCase()}`, data.sessionAddress);
          } else {
            throw new Error("Backend failed to initialize session");
          }
        } catch (initErr) {
          notify("Failed to initialize trading wallet. Please refresh.", "error");
          setIsExecuting(false);
          return;
        }
      }

      notify(`Confirm deposit of ${amtNum} USDC in your wallet...`, "pending");

      try {
        // Enforce correct network (Arc Testnet) before proceeding with transfers
        try {
          await switchChainAsync({ chainId: 5042002 });
        } catch (switchErr) {
          console.warn("Chain switch failed or rejected:", switchErr.message);
        }

        // --- 1% PLATFORM FEE SPLIT CALCULATION ---
        // This is done client-side to ensure full transparency on Etherscan
        const platformFeeRate = 0.01;
        const feeAmt = amtNum * platformFeeRate;
        const depositAmt = amtNum - feeAmt;

        console.log(`[Deposit] Splitting: ${depositAmt.toFixed(4)} to Session, ${feeAmt.toFixed(4)} to Treasury`);

        // STEP 1: Send 1% Fee directly to Treasury
        if (!walletClient) throw new Error("Wallet not connected — please reconnect and try again");

        const feeTx = await walletClient.sendTransaction({
          to: ARC_CONTRACT_ADDRESS,
          value: parseEther(feeAmt.toFixed(18)),
          account: address,
        });

        // STEP 2: Send remaining 99% to the user's Session Trading Wallet
        const hash = await walletClient.sendTransaction({
          to: activeSessionWallet.address,
          value: parseEther(depositAmt.toFixed(18)),
          account: address,
        });

        // STEP 3: Optimistic Local State Update
        // Provides immediate visual feedback before block confirmation.
        setSessionBalance(prev => prev + depositAmt);
        setEvmBalance(prev => {
          const current = parseFloat(prev || '0');
          return (current - amtNum).toFixed(6);
        });
        lastOptimisticActionTime.current = Date.now();

        // STEP 4: Tell the backend to credit the ledger.
        //
        // This MUST NOT be fire-and-forget. The USDC is already on-chain at
        // this point, so if this call is dropped the user's money sits in the
        // trading wallet with nothing crediting it. The backend now requires a
        // signature and verifies the transfer against the chain, and we retry
        // with backoff before finally telling the user it did not land.
        await confirmDepositOnBackend({
          address,
          amount: depositAmt,
          txHash: hash,
          signMessage: (msg) => walletClient.signMessage({ message: msg, account: address }),
        });

        // STEP 5: Re-pull on-chain + session balances from source of truth after
        // the deposit tx confirms so every device shows the same updated state.
        setTimeout(() => {
          refetchEvmBalance(true);
          updateEvmSessionBal(true);
        }, 2500);

        // STEP 6: Show success immediately — socket balance_update handles real balance
        setSuccessOverlay({ title: 'DEPOSIT SUCCESSFUL' });

        const newTx = {
          id: `dep_${Date.now()}`,
          type: 'DEPOSIT',
          amount: amtNum.toFixed(4),
          timestamp: Date.now(),
          tx: hash,
          network: 'arc'
        };
        setTransactionHistory(prev => [newTx, ...prev]);

      } catch (evmErr) {
        notify(`Deposit failed: ${evmErr.shortMessage || evmErr.message}`, "error");
      }
    } finally {
      setIsExecuting(false);
    }
  }, [address, notify, evmBalance, evmSessionWallet, updateEvmSessionBal, refetchEvmBalance, isExecuting, walletClient, confirmDepositOnBackend]);


  /**
   * WITHDRAW (CASHOUT) HANDLER
   * --------------------------
   * Withdraws winnings from the Session Trading Wallet back to the user's primary wallet.
   * 
   * CRITICAL LOGIC:
   * 1. SIGNATURE AUTHORIZATION: User must sign a "Withdrawal Authorization" message 
   *    locally. This proves that the session wallet owner (derived from user address)
   *    is the one initiating the withdrawal.
   * 2. BACKEND WITHDRAW: The backend receives the authorization and signs an on-chain 
   *    transfer from the EOA to the user.
   * 3. GAS BUFFER: A small amount (0.01 USDC) is reserved to cover network gas fees.
   * 
   * IMPACT IF BUGGED: Funds would stay stuck in the session wallet.
   */
  const handleWithdraw = useCallback(async (amt, destination = null) => {
    if (isExecuting) return;

    try {
      const amtNum = parseFloat(amt);
      if (isNaN(amtNum) || amtNum <= 0) {
        notify("Invalid withdrawal amount", "error");
        return;
      }

      if (!address) {
        notify("Connect your wallet", "error");
        return;
      }

      // Ensure session wallet is ready
      let activeSessionWallet = evmSessionWallet;
      if (!activeSessionWallet) {
        try {
          const res = await fetch(`${KEEPER_URL_ARC}/session/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ address })
          });
          if (res.ok) {
            const data = await res.json();
            activeSessionWallet = { address: data.sessionAddress, isRemote: true };
            setEvmSessionWallet(activeSessionWallet);
            setSessionBalance(parseFloat(data.balance));
            localStorage.setItem(`15market_session_addr_${address.toLowerCase()}`, data.sessionAddress);
          } else {
            throw new Error("Backend failed to initialize session");
          }
        } catch (initErr) {
          notify("Trading wallet not ready. Please refresh.", "error");
          return;
        }
      }

      if (sessionBalance < amtNum) {
        notify(`Insufficient balance. You have ${sessionBalance.toFixed(4)} USDC`, "error");
        return;
      }

      const targetAddr = destination || address;
      const isExternal = destination && destination.toLowerCase() !== address.toLowerCase();

      // Reserving a small amount for gas to ensure the transaction doesn't fail on-chain
      const gasBuffer = 0.01;
      const netAmt = amtNum - gasBuffer;

      if (netAmt <= 0) {
        notify("Amount too low for gas", "error");
        return;
      }

      setIsExecuting(true);
      notify(isExternal ? `Authorizing transfer to ${destination.slice(0, 6)}...` : "Sign to authorize withdrawal...", "pending");

      // --- SECURITY SIGNATURE ---
      const authMsg = `--- 15MARKET PROTOCOL ---\nACTION: ${isExternal ? 'EXTERNAL TRANSFER' : 'WITHDRAW FROM AUTO-SIGNER'}\nAMOUNT: ${amt} USDC\nTO: ${targetAddr}\nTIMESTAMP: ${Date.now()}`;
      let signature = "authorized"; // Fallback placeholder if verification is disabled on backend

      try {
        if (embeddedWallet) {
          // Privy Embedded Wallet (Seamless/Integrated)
          signature = await embeddedWallet.sign(authMsg);
        } else if (walletClient) {
          // Wagmi / External Wallet
          signature = await walletClient.signMessage({ message: authMsg, account: address });
        } else if (window.ethereum) {
          // Direct EIP-1193 Injection
          const msgHex = '0x' + Array.from(new TextEncoder().encode(authMsg)).map(b => b.toString(16).padStart(2, '0')).join('');
          signature = await window.ethereum.request({ method: 'personal_sign', params: [msgHex, address] });
        } else {
          throw new Error("No wallet available to sign");
        }
      } catch (sigErr) {
        if (sigErr.code === 4001 || sigErr.message?.includes('rejected') || sigErr.message?.includes('denied')) {
          notify("Transfer cancelled by user", "error");
        } else {
          notify("Signature failed: " + (sigErr.shortMessage || sigErr.message), "error");
        }
        setIsExecuting(false);
        return;
      }

      notify("Processing...", "pending");

      const cleanNetAmt = parseFloat(netAmt.toFixed(6));

      const controller = new AbortController();
      const fetchTimeout = setTimeout(() => controller.abort(), 60000);

      let res;
      try {
        res = await fetch(`${KEEPER_URL_ARC}/session/cashout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            address,
            amount: cleanNetAmt,
            destination: targetAddr,
            signature: signature,
            message: authMsg
          })
        });
      } catch (fetchErr) {
        if (fetchErr.name === 'AbortError') {
          throw new Error("Network timeout. Try again.");
        }
        throw fetchErr;
      } finally {
        clearTimeout(fetchTimeout);
      }

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Transfer failed");
      }

      const data = await res.json();
      const withdrawalHash = data.txHash;

      setSuccessOverlay({
        title: isExternal ? 'TRANSFER SUCCESSFUL' : 'WITHDRAWAL SUCCESSFUL',
      });

      setSessionBalance(prev => Math.max(0, prev - amtNum));
      if (!isExternal) {
        setEvmBalance(prev => {
          const current = parseFloat(prev || '0');
          return (current + cleanNetAmt).toFixed(6);
        });
      }
      lastOptimisticActionTime.current = Date.now();

      const newTx = {
        id: `tx-${Date.now()}`,
        type: isExternal ? "TRANSFER" : "WITHDRAW",
        amount: amtNum.toFixed(4),
        timestamp: Date.now(),
        tx: withdrawalHash,
        to: targetAddr,
        network: 'arc'
      };

      setTransactionHistory(prev => [newTx, ...prev]);

      fetch(`${KEEPER_URL_ARC}/push-tx`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, transaction: newTx })
      }).catch(() => { });

      // Re-pull BOTH balances from source of truth after the transfer settles so
      // desktop and mobile always converge on the same numbers.
      setTimeout(() => {
        refetchEvmBalance(true);
        updateEvmSessionBal(true);
      }, 3000);
    } catch (e) {
      notify("Transfer failed: " + (e.shortMessage || e.message), "error");
    } finally {
      setIsExecuting(false);
    }
  }, [evmSessionWallet, address, notify, sessionBalance, updateEvmSessionBal, isExecuting, refetchEvmBalance, walletClient]);





  return (
    <div className={`min-h-screen ${!isSmallScreen ? 'h-screen' : 'h-screen h-[100dvh]'} w-full text-current selection:bg-[#1A6140]/30 selection:text-white transition-colors duration-500 overflow-hidden font-sans relative ${isLight ? 'bg-white' : 'bg-black'}`}>
      <div className={`fixed inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] ${isLight ? 'hidden' : ''}`} />

      {/* Landscape Blocker — branded fullscreen gate for mobile devices in landscape */}
      <AnimatePresence>
        {isLandscapeBlocked && (
          <motion.div
            key="landscape-blocker"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
            className={`fixed inset-0 z-[15000] flex flex-col items-center justify-center ${isLight ? 'bg-white' : 'bg-black'}`}
            style={{ fontFamily: '"Comfortaa", cursive' }}
          >
            {/* Subtle background glow */}
            <div className={`absolute top-[30%] left-1/2 -translate-x-1/2 w-80 h-80 ${isLight ? 'bg-[#1A6140]/8' : 'bg-[#1A6140]/10'} rounded-full blur-[120px]`} />
            <div className={`absolute bottom-[20%] right-[20%] w-60 h-60 ${isLight ? 'bg-[#1A6140]/5' : 'bg-[#1A6140]/5'} rounded-full blur-[100px]`} />

            {/* Logo */}
            <img src={isLight ? '/goblogo.png' : '/gowlogo.png'} alt="15market" className="h-16 w-auto mb-8 opacity-80" />

            {/* Rotate-to-portrait animated icon */}
            <div className="relative mb-6">
              <svg width="72" height="72" viewBox="0 0 72 72" fill="none" xmlns="http://www.w3.org/2000/svg">
                {/* Landscape phone (faded, the "from" state) */}
                <rect x="6" y="22" width="36" height="24" rx="4" stroke="#1A6140" strokeWidth="1.5" opacity="0.25" />
                <line x1="10" y1="34" x2="10.01" y2="34" stroke="#1A6140" strokeWidth="2" strokeLinecap="round" opacity="0.25" />

                {/* Portrait phone (bright, the "to" state) */}
                <g className="animate-pulse">
                  <rect x="40" y="10" width="24" height="36" rx="4" stroke="#1A6140" strokeWidth="2" fill="none" />
                  <line x1="52" y1="40" x2="52.01" y2="40" stroke="#1A6140" strokeWidth="2.5" strokeLinecap="round" />
                </g>

                {/* Curved arrow from landscape to portrait */}
                <path d="M30 50 C30 60, 45 62, 48 50" stroke="#1A6140" strokeWidth="1.5" fill="none" strokeLinecap="round" />
                <polyline points="45,53 48,50 51,53" stroke="#1A6140" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>

            {/* Message */}
            <h2 className={`text-lg font-black tracking-tight mb-2 text-center px-8 ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
              Rotate Your Device
            </h2>
            <p className={`text-xs font-medium text-center px-12 leading-relaxed max-w-sm ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>
              15market on mobile is portrait-only. Please rotate your phone back to portrait mode to continue trading.
            </p>

            {/* Subtle brand accent line */}
            <div className="mt-8 w-16 h-[2px] bg-gradient-to-r from-transparent via-[#1A6140]/40 to-transparent rounded-full" />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isConnected && address && !isAppReady && (
          <motion.div
            key="platform-mask"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.5 }}
            className={`fixed inset-0 z-[5000] ${theme === 'light' ? 'bg-[#8CB09D]' : 'bg-[#050505]'}`}
          />
        )}
        {isWalletLoading && (
          <WalletConnectionLoading theme={theme} onFinish={() => setIsWalletLoading(false)} />
        )}
        {isGlobalLoading && (
           <GlobalLoader theme={theme} progress={healthProgress} />
        )}
      </AnimatePresence>

      <ErrorBoundary>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className={`${isLandscapeBlocked ? 'hidden' : 'min-h-screen'} ${!isSmallScreen ? 'h-screen' : 'h-screen h-[100dvh]'} w-full overflow-hidden font-sans flex flex-col items-center ${themeClass}`}
          style={{
            color: theme === 'light' ? '#1f2937' : '#ffffff',
            transition: "color 0.3s ease"
          }}>



          <DissolveTransition isAnimating={isAnimatingTheme} targetTheme={targetTheme} />

          {view === "dashboard" ? (
            <DashboardPage
              onBack={() => setView("trading")}
              wallet={wallet}
              sessionBalance={sessionBalance}
              evmBalance={evmBalance}
              onDeposit={handleDeposit}
              onWithdraw={handleWithdraw}
              treasuryBalance={treasuryBalance}
              autoSignerFees={autoSignerFees}
              userProfile={userProfile}
              theme={theme}
              isSmallScreen={isSmallScreen}
              evmSessionWallet={resolvedSessionWallet}
              isSignerInitializing={isSessionWalletPending}
              onRetryInit={initializeSessionWallet}
              transactionHistory={transactionHistory}
              onViewReceipt={handleViewReceipt}
              uiVersion={uiVersion}
              onOpenCircleWallet={(initialMode) => {
                setCircleWalletMode(initialMode);
                setView("circle_wallet");
              }}
              onHelp={() => setView("help")}
              onReferral={() => setView("referral")}
              onSelect={(type) => setView("comingsoon")}
            />
          ) : view === "comingsoon" || view === "ladders" ? (
            <ComingSoonPage onBack={() => setView("dashboard")} theme={theme} title={view === "ladders" ? "Ladders" : undefined} />
          ) : view === "circle_wallet" ? (
            <CircleWalletPage
              address={address}
              wagmiAddress={wagmiAddress}
              isLight={theme === 'light'}
              notify={notify}
              onBack={() => {
                setView("dashboard");
                setCircleWalletMode(null);
              }}
              initialMode={circleWalletMode}
              evmBalance={evmBalance}
              sessionBalance={sessionBalance}
              sessionAddress={evmSessionWallet?.address}
              username={userProfile?.username}
              wallets={wallets || []}
              walletClient={walletClient}
              switchChainAsync={switchChainAsync}
              smartWalletAddress={smartWalletAddress}
              onDeposit={handleDeposit}
              onWithdraw={handleWithdraw}
              triggerGlobalRefresh={triggerGlobalRefresh}
            />
          ) : view === "referral" ? (
            <ReferralHub
              address={address}
              userProfile={userProfile}
              notify={notify}
              theme={theme}
              onBack={() => setView("dashboard")}
            />
          ) : view === "help" ? (
            <HelpPage
              theme={theme}
              onBack={() => setView("dashboard")}
              isSmallScreen={isSmallScreen}
            />
          ) : (
            <div className="w-full flex-1 flex flex-col items-center flex-shrink-0 py-0 overflow-hidden min-h-0">

              <header className={`w-full max-w-[1600px] px-4 md:px-6 flex items-center justify-between relative z-[160] safe-top ${isSmallScreen ? 'h-14 mb-6' : 'h-16 lg:h-20'}`}
                style={isSmallScreen ? { paddingTop: 'calc(env(safe-area-inset-top) + 12px)' } : {}}>
                <div className="flex items-center transition-all duration-500 h-full overflow-visible"
                  style={{ paddingLeft: !isSmallScreen ? (showSideHistory ? '268px' : '16px') : '0px' }}>
                  <img src={theme === 'light' ? '/goblogo.png' : '/gowlogo.png'} alt="logo" className={`${isSmallScreen ? 'h-[72px]' : 'h-[100px] lg:h-[120px]'} w-auto transition-all pointer-events-auto`} style={{ marginTop: '-24px', marginBottom: '-24px', marginLeft: '-4.32%' }} />
                </div>

                <div className="hidden lg:flex items-center gap-2 px-2 py-1 origin-right">
                  {authenticated && (
                    <>
                      {/* Game Mode Switcher: CLASSIC = live trading, LADDERS =
                          coming-soon page (rounds model removed) */}
                      <div className={`flex items-center gap-0.5 p-[3px] rounded-full border transition-all duration-500 ${theme === 'light' ? 'bg-white border-[#E5E7EB]' : 'bg-white/5 border-white/10'}`}>
                        {[{ key: 'classic', label: 'CLASSIC', action: () => setView('trading') }, { key: 'ladders', label: 'LADDERS', action: () => setView('ladders') }].map(({ key, label, action }) => (
                          <button key={key} onClick={action}
                            style={{ fontFamily: '"Comfortaa", cursive' }}
                            className={`h-[26px] px-3 rounded-full text-[10px] font-black uppercase tracking-wider transition-all duration-300 flex items-center justify-center ${
                              key === 'classic'
                                ? 'bg-[#1A6140] text-white shadow-sm'
                                : (theme === 'light' ? 'text-gray-400 hover:text-gray-600' : 'text-white/40 hover:text-white/60')
                            }`}>
                            {label}
                          </button>
                        ))}
                      </div>

                      {/* Theme toggle - pill switch */}
                      <div className={`flex items-center gap-0.5 p-[3px] rounded-full border transition-all duration-500 ${theme === 'light' ? 'bg-white border-[#E5E7EB]' : 'bg-white/5 border-white/10'}`}>
                        <button onClick={toggleTheme} className={`w-[26px] h-[26px] rounded-full flex items-center justify-center transition-all duration-300 ${theme === 'light' ? 'bg-[#1A6140] text-white shadow-sm' : 'bg-transparent text-white/40 hover:text-white/60'}`}>
                          <Sun size={12} className={theme === 'light' ? 'text-white' : ''} />
                        </button>
                        <button onClick={toggleTheme} className={`w-[26px] h-[26px] rounded-full flex items-center justify-center transition-all duration-300 ${theme === 'dark' ? 'bg-[#1A6140] text-white shadow-sm' : 'bg-transparent text-gray-400 hover:text-gray-600'}`}>
                          <Moon size={12} className={theme === 'dark' ? 'text-white' : ''} />
                        </button>
                      </div>

                      {/* Profile */}
                      <button onClick={() => setView("dashboard")} className="w-8 h-8 rounded-full border flex items-center justify-center transition-all group active:scale-95 overflow-hidden"
                        style={{
                          borderColor: theme === 'light' ? 'rgba(229,231,235,1)' : 'rgba(255,255,255,0.1)',
                        }}>
                        {(userProfile?.avatar || userProfile?.xProfileImage) ? (
                          <img src={userProfile?.avatar || userProfile?.xProfileImage} alt="Profile" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <User size={14} className={theme === 'light' ? 'text-gray-400 group-hover:text-black' : 'text-white/40 group-hover:text-white'} />
                        )}
                      </button>
                    </>
                  )}
                  <UnifiedWalletButton theme={theme} />
                </div>

                <div className="flex lg:hidden landscape:hidden items-center gap-1.5 md:gap-2 scale-[0.88] origin-right">
                  {authenticated && (
                    <>
                      {/* Branded Game Mode Switcher - Mobile: CLASSIC = trading,
                          LADDERS = coming-soon page (rounds model removed) */}
                      <div className={`flex items-center p-0.5 rounded-full border backdrop-blur-3xl transition-all duration-500 ${theme === 'light' ? 'bg-white/40 border-[#1A6140]/20' : 'bg-black/40 border-white/5'}`}>
                        {[{ key: 'classic', Icon: Zap, action: () => setView('trading') }, { key: 'ladders', Icon: Layers, action: () => setView('ladders') }].map(({ key, Icon, action }) => (
                          <button key={key} onClick={action}
                            className={`relative z-10 flex items-center justify-center h-[28px] w-[54px] transition-all duration-300 ${key === 'classic' ? 'text-[#1A6140]' : (theme === 'light' ? 'text-black/30' : 'text-white/20')}`}>
                            <Icon size={11} />
                          </button>
                        ))}
                      </div>
                      <div className="scale-[0.8] origin-center -mx-1.5 flex items-center gap-1">
                        <ThemeToggle theme={theme} onToggle={toggleTheme} />
                      </div>
                      <button onClick={() => setView("dashboard")} className="h-[32px] w-[32px] flex items-center justify-center rounded-full border backdrop-blur-md transition-all group active:scale-95 overflow-hidden p-[1px]"
                        style={{
                          backgroundColor: theme === 'light' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.03)',
                          borderColor: theme === 'light' ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.05)',
                        }}>
                        {(userProfile?.avatar || userProfile?.xProfileImage) ? (
                          <img src={userProfile?.avatar || userProfile?.xProfileImage} alt="Profile" className="w-full h-full object-cover rounded-full" />
                        ) : (
                          <User size={14} className={theme === 'light' ? 'text-black/60 group-hover:text-black' : 'text-white/60 group-hover:text-white'} />
                        )}
                      </button>
                    </>
                  )}
                  <div className="scale-[0.9] origin-right ml-[-2px]">
                    <UnifiedWalletButton theme={theme} />
                  </div>
                </div>
              </header>

              {/* MAIN CONTENT CONTAINER */}
              <div className={`w-full ${uiVersion === 'v2' ? 'max-w-[1600px] px-2 md:px-6 lg:px-8 focus-visible:outline-none' : 'max-w-4xl lg:max-w-7xl px-4 sm:px-6 lg:px-8'} ${isSmallScreen ? '!px-0' : ''} flex flex-col items-center flex-1 min-h-0 h-full relative z-10`}>
              {/* MOBILE: vertical layout matching reference screenshot */}
              {isSmallScreen ? (
                <div className="flex-1 w-full min-h-0 overflow-hidden flex flex-col">
                  <MobileTradeView
                    theme={theme}
                    activeMarket={activeMarket}
                    handleMarketChange={handleMarketChange}
                    defaultTokens={defaultTokens}
                    oraclePrices={oraclePrices}
                    changes24h={changes24h}
                    price={price}
                    network={network}
                    uiVersion={uiVersion}
                    priceHistory={priceHistoryRef.current}
                    activeTrades={activeTrades}
                    isExecuting={isExecuting}
                    executeTrade={executeTrade}
                    sessionBalance={sessionBalance}
                    liveOdds={liveOdds}
                    minStake={platformSettings.minBet}
                    maintenanceMode={platformSettings.maintenanceMode || platformSettings.tradingHalted}
                    tradeHistory={tradeHistory}
                    showFullHistory={showFullHistory}
                    setShowFullHistory={setShowFullHistory}
                    onViewReceipt={handleViewReceipt}
                    onCountdownEnd={(livePrice) => {
                      setActiveTrades(prev => prev.map(t => {
                        if (['PENDING', 'RESOLVING'].includes(t.status)) {
                          return { ...t, exitPrice: livePrice ? String(livePrice) : t.exitPrice };
                        }
                        return t;
                      }));
                    }}
                  />
                </div>
              ) : (
              // 2-COLUMN LAYOUT
<div className="flex-1 w-full grid grid-cols-[minmax(180px,220px)_1fr] min-h-0 overflow-hidden px-4 pt-0 pb-2 gap-4">
                {/* LEFT SIDEBAR */}
                <div className="h-full border-r border-[#1A6140] pr-4 overflow-y-auto scrollbar-none">
                  <LeftSidebar
                    sessionBalance={sessionBalance}
                    evmBalance={evmBalance}
                    isLoggedIn={privyReady && (authenticated || !!address)}
                    activeMarket={activeMarket}
                    setActiveMarket={handleMarketChange}
                    defaultTokens={defaultTokens}
                    oraclePrices={oraclePrices}
                    changes24h={changes24h}
                    theme={theme}
                    isSmallScreen={isSmallScreen}
                  />
                </div>

                {/* RIGHT AREA (Scroller + Chart/Trading Row + Trade History) */}
                <div className="flex flex-col min-h-0 min-w-0 relative z-10">
                  
                  
                  {/* MARKET SCROLLER (Marquee) */}
                  <div className="w-full shrink-0 mb-3 overflow-hidden relative rounded-[10px]">
                    <GlobalTradeScroller theme={theme} />
                  </div>

                  {/* CHART & TRADING WIDGET ROW */}
                  <div className={`${showFullHistory ? 'flex-none h-0 overflow-hidden' : 'flex-1'} flex gap-4 min-h-0 transition-all duration-300`}>
                    
                    {/* CHART */}
                    <div className="flex-1 min-w-0 relative">
                      <div className="w-full h-full rounded-[16px] overflow-hidden relative z-10"
                        style={{
                          background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 10, 10, 0.7)',
                          boxShadow: theme === 'light' ? '0 0 16px rgba(0,0,0,0.10), 0 0 4px rgba(0,0,0,0.05)' : 'none',
                        }}>
                        <CustomChart
                          symbol={activeMarket?.binance || 'BTCUSDT'}
                          theme={theme}
                          network={network}
                          activeMarket={activeMarket}
                          uiVersion={uiVersion}
                          setActiveMarket={handleMarketChange}
                          activeTrades={activeTrades}
                          currentPrice={price}
                          priceHistory={priceHistoryRef.current}
                        />
                      </div>
                    </div>

                    {/* TRADING WIDGET */}
                    <div className="w-[270px] xl:w-[310px] shrink-0 h-full relative">
                      <div className="w-full h-full rounded-[16px] overflow-hidden relative z-10"
                        style={{
                          boxShadow: theme === 'light' ? '0 0 16px rgba(0,0,0,0.10), 0 0 4px rgba(0,0,0,0.05)' : 'none',
                        }}>
                      <TradingWidget
                        activeMarket={activeMarket}
                        price={price}
                        evmBalance={evmBalance}
                        sessionBalance={sessionBalance}
                        sessionMode={sessionMode}
                        toggleSessionMode={toggleSessionMode}
                        theme={theme}
                        amount={amount}
                        handleAmountChange={handleAmountChange}
                        sliderValue={sliderValue}
                        handleSliderChange={handleSliderChange}
                        direction={direction}
                        setDirection={setDirection}
                        duration={duration}
                        setDuration={setDuration}
                        handleExecuteTrade={executeTrade}
                        isExecuting={isExecuting}
                        wallet={wallet}
                        address={address}
                        minStake={platformSettings.minBet}
                        maintenanceMode={platformSettings.maintenanceMode || platformSettings.tradingHalted}
                        liveOdds={liveOdds}
                        activeTrade={activeTrade}
                      />
                      </div>
                    </div>
                  </div>

                  {/* TRADE HISTORY (Spans across bottom of both chart and trading widget) — only shown when logged in */}
                  {address && (
<div className={`${showFullHistory ? 'flex-1 min-h-0 overflow-y-auto custom-scrollbar rounded-[16px]' : 'shrink-0 h-[90px] mt-2'} transition-all duration-300`}
                    style={{
                      fontFamily: '"Comfortaa", cursive',
                      ...(showFullHistory ? {
                        background: theme === 'light' ? 'rgba(255, 255, 255, 0.95)' : 'rgba(10, 10, 10, 0.9)',
                        boxShadow: theme === 'light' ? '0 0 16px rgba(0,0,0,0.10), 0 0 4px rgba(0,0,0,0.05)' : 'none',
                        padding: '12px',
                      } : {})
                    }}>
                    <TradeHistoryTable
                      tradeHistory={tradeHistory}
                      activeTrades={activeTrades}
                      theme={theme}
                      onViewReceipt={handleViewReceipt}
                      onShare={handleShare}
                      isExpanded={showFullHistory}
                      onToggleExpand={() => setShowFullHistory(!showFullHistory)}
                    />
                  </div>
                  )}

                </div>
              </div>
              )}



              </div>
            </div>
          )
          }



           <Suspense fallback={<div className="h-[400px] flex items-center justify-center animate-pulse">Loading Profile...</div>}>
             <ProfileModal
               isOpen={isProfileOpen}
               onClose={() => setIsProfileOpen(false)}
               wallet={wallet}
               evmSessionWallet={resolvedSessionWallet}
               userProfile={userProfile}
               isSignerInitializing={isSessionWalletPending}
               onRetryInit={initializeSessionWallet}
               sessionBalance={sessionBalance}
               evmBalance={evmBalance}
               onDeposit={handleDeposit}
                onWithdraw={handleWithdraw}
                transactionHistory={transactionHistory}
                onViewReceipt={handleViewReceipt}
                notify={notify}
             />
            </Suspense>
           


          {/* Toast notifications removed in favor of inline outcome UI */}
          {successOverlay && (
            <SuccessOverlay
              show={!!successOverlay}
              title={successOverlay.title}
              onDone={() => setSuccessOverlay(null)}
            />
          )}

          {/* Network Status Overlay */}
          <AnimatePresence>
            {!isOnline && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, y: -40 }}
                transition={{ duration: 0.4 }}
                className="fixed top-0 left-0 w-full z-[200000] pointer-events-none"
                style={{ height: '120px' }}
              >
                <div className="absolute top-0 left-0 w-full h-full"
                  style={{
                    background: 'linear-gradient(180deg, rgba(220,38,38,0.4) 0%, rgba(220,38,38,0.15) 40%, rgba(220,38,38,0.05) 70%, transparent 100%)',
                  }}
                />
              </motion.div>
            )}

            {isOnline && navigator.onLine && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: [0, 1, 1, 0], y: [0, 0, 0, -40] }}
                transition={{ duration: 2.5, times: [0, 0.1, 0.5, 1] }}
                exit={{ opacity: 0, y: -60 }}
                className="fixed top-0 left-0 w-full z-[200000] pointer-events-none"
                style={{ height: '120px' }}
              >
                <div className="absolute top-0 left-0 w-full h-full"
                  style={{
                    background: 'linear-gradient(180deg, rgba(26, 97, 64,0.4) 0%, rgba(26, 97, 64,0.15) 40%, rgba(26, 97, 64,0.05) 70%, transparent 100%)',
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>

           <footer className={`${isSmallScreen ? 'hidden' : 'fixed bottom-1 left-0 w-full px-8 z-[100] opacity-30 hover:opacity-100 transition-opacity pointer-events-none'} flex items-center justify-between gap-6 flex-none bg-transparent`}
            style={{ fontFamily: 'Arial, sans-serif' }}>
           </footer>
          <Suspense fallback={null}>
            <TradeShareCard
              isOpen={isShareCardOpen}
              onClose={() => setIsShareCardOpen(false)}
              trade={shareTrade}
              userProfile={userProfile}
              theme={theme}
            />
          </Suspense>

          {/* Disclaimer dialog for trades that have not settled yet. */}
          <AnimatePresence>
            {pendingTradeNotice && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[10000] flex items-center justify-center p-4"
                style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
                onClick={() => setPendingTradeNotice(null)}
              >
                <motion.div
                  initial={{ scale: 0.94, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.94, y: 10 }}
                  transition={{ duration: 0.18 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-sm rounded-2xl p-6 text-center"
                  style={{
                    fontFamily: '"Comfortaa", cursive',
                    backgroundColor: theme === 'light' ? '#ffffff' : '#141414',
                    border: `1px solid ${theme === 'light' ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.12)'}`,
                    boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                  }}
                >
                  <div className="flex justify-center mb-3">
                    <AlertTriangle size={38} strokeWidth={1.75} className="text-[#FFB020]" />
                  </div>
                  <h3
                    className="text-[15px] font-black uppercase tracking-wider mb-2"
                    style={{ color: theme === 'light' ? '#111827' : '#ffffff' }}
                  >
                    Trade Still Processing
                  </h3>
                  <p
                    className="text-[12px] leading-relaxed mb-1"
                    style={{ color: theme === 'light' ? '#4b5563' : 'rgba(255,255,255,0.60)' }}
                  >
                    This trade has not settled yet, so there is no result or receipt to show.
                    A receipt card is created only once the market resolves the trade.
                  </p>
                  <p
                    className="text-[11px] leading-relaxed mb-5"
                    style={{ color: theme === 'light' ? '#6b7280' : 'rgba(255,255,255,0.40)' }}
                  >
                    Please check back later — the card unlocks as soon as it settles.
                  </p>
                  <button
                    onClick={() => setPendingTradeNotice(null)}
                    className="w-full py-2.5 rounded-xl text-[12px] font-black uppercase tracking-wider text-white transition-colors"
                    style={{ backgroundColor: '#FFB020' }}
                  >
                    Got It
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>



           {/* Onboarding Flow for new users */}
           {showOnboarding && address && !isGlobalLoading && (
             <Suspense fallback={<div className="h-[500px] flex items-center justify-center animate-pulse">Loading Onboarding...</div>}>
               <OnboardingFlow
                 address={address}
                 theme={theme}
                 evmSessionWallet={evmSessionWallet}
                 onComplete={(profile) => {
                   setShowOnboarding(false);
                   performStealthChecks(address); // Final refresh
                 }}
               />
             </Suspense>
           )}

          {/* Landing Page removed — users land directly on trading view with Connect button in navbar */}

          {/* Removed Global Initial Loader with Lane as requested */}

          {/* Removed Signer Sync Loader with Lane as requested */}

          {/* OVERLAY: Maintenance Mode */}
          {platformSettings.maintenanceMode && (
            <div className={`fixed inset-0 z-[3000] flex flex-col items-center justify-center p-8 text-center ${isLight ? 'bg-[#f0f9f4]' : 'bg-[#050505]'}`}>
              <div className="w-24 h-24 bg-[#1A6140]/10 rounded-[32px] flex items-center justify-center mb-8 border border-[#1A6140]/20">
                <Settings className="text-[#1A6140] w-12 h-12 animate-spin-slow" />
              </div>
              <h1 className={`text-4xl font-black uppercase tracking-tighter mb-4 ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                Under Maintenance
              </h1>
              <p className={`text-sm max-w-xs font-medium leading-relaxed ${isLight ? 'text-[#0a261a]/60' : 'text-white/40'}`}>
                We are currently upgrading the platform to provide the best trading experience. Please check back shortly.
              </p>
            </div>
          )}

          {/* Authoritative Mobile History Drawer (Unconstrained) */}

        </motion.div >
      </ErrorBoundary>
    </div>
  );
}
