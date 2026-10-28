import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Shield,
    Radio,
    Settings,
    Power,
    AlertTriangle,
    Check,
    X,
    Clock,
    MessageSquare,
    Zap,
    Lock,
    Unlock,
    Wifi,
    WifiOff,
    RefreshCw,
    ArrowLeft,
    Globe,
    TrendingUp,
    DollarSign,
    Users,
    Calendar,
    Search,
    Ban,
    UserX,
    UserCheck,
    Scissors,
    BadgePercent,
    Mail,
    Landmark,
    ChevronDown,
    LogOut,
    LayoutDashboard,
    ChevronsLeft,
    ChevronsRight,
    Flame,
    BarChart3,
    Sun,
    Moon,
    ShieldAlert,
    Radar,
    Pencil,
    Megaphone,
    Undo2
} from "lucide-react";
import { KEEPER_URL_ARC } from "../constants";
import { adminFetch, clearSession } from "../utils/adminAuth";
import { GlobalTradeScroller } from "./GlobalTradeScroller";
import { socketService } from "../utils/socket";
import { COUNTRY_CENTER } from "./ui/places";
import { RouteGlobe } from "./ui/route-globe";
import { ThemeToggle } from "./ui/ThemeToggle";

// Sidebar navigation: collapsible icon rail ↔ full menu. "Referral Program"
// hosts the participants list (with earnings), the withdrawal request queue
// and suspension controls as tabs; "Security" hosts protocols, broadcasts
// and the admin roster.
const NAV = [
    { key: 'overview', label: 'Overview', hint: 'Metrics · Trade index', icon: LayoutDashboard },
    { key: 'analytics', label: 'Analytics', hint: 'Globe · Reach · Users', icon: Globe },
    { key: 'referrals', label: 'Referral Program', hint: 'Participants · Earnings · Requests', icon: Users },
    { key: 'broadcast', label: 'Broadcast', hint: 'Live banner · Alerts', icon: Radio },
    { key: 'siem', label: 'SIEM', hint: 'Threats · Intrusions', icon: ShieldAlert },
    { key: 'security', label: 'Security', hint: 'Protocols · Team', icon: Shield }
];

// ── Broadcast FLIP CLOCK ─────────────────────────────────────────────────────
// Same flip-digit tiles the trade cards use (verbatim tile style): a digit
// flips in 3D every tick. Counting MM:SS — broadcasts run 1–60 minutes.
function FlipBroadcastDigit({ digit }) {
    return (
        <div className="relative w-[16px] h-[23px] bg-[#0c0e12] border border-white/15 rounded-[4px] shadow-[0_1px_4px_rgba(0,0,0,0.6)] overflow-hidden flex items-center justify-center select-none">
            <div className="absolute inset-x-0 top-1/2 h-[1px] bg-black/80 z-20" />
            <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                    key={digit}
                    initial={{ rotateX: -90, opacity: 0 }}
                    animate={{ rotateX: 0, opacity: 1 }}
                    exit={{ rotateX: 90, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.25, 1, 0.5, 1] }}
                    style={{ transformOrigin: "center center", transformStyle: "preserve-3d" }}
                    className="absolute inset-0 flex items-center justify-center font-mono font-black text-[12px] text-white tabular-nums tracking-tighter"
                >
                    {digit}
                </motion.div>
            </AnimatePresence>
            <div className="absolute inset-0 bg-gradient-to-b from-white/[0.12] via-transparent to-black/30 pointer-events-none z-10" />
        </div>
    );
}

function FlipBroadcastClock({ seconds }) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    const digits = [
        ...pad(Math.min(99, mm)), ':sep', ...pad(ss)
    ];
    return (
        <div className="flex items-center gap-[2px] select-none shrink-0">
            {digits.map((d, i) => d === ':sep'
                ? <span key={i} className="font-mono font-black text-[11px] text-white/40 w-[3px] text-center leading-none">:</span>
                : <FlipBroadcastDigit key={i} digit={d} />)}
            <span className="text-[8px] font-mono font-black text-white/40 ml-1 uppercase tracking-widest">left</span>
        </div>
    );
}

export function AdminDashboard({ onBack, theme, notify, platformSettings: initialSettings, auth }) {
    // Live theme state — the sidebar switch flips it in place.
    const [themeState, setThemeState] = useState(() => {
        const saved = (() => { try { return localStorage.getItem('15market_theme') || theme || 'dark'; } catch (e) { return theme || 'dark'; } })();
        // Apply immediately so the body background is correct before first paint.
        try {
            document.documentElement.classList.toggle('light', saved === 'light');
            document.body.classList.toggle('light', saved === 'light');
        } catch (_) {}
        return saved;
    });
    const isLight = themeState === 'light';
    const toggleTheme = () => {
        const next = isLight ? 'dark' : 'light';
        try {
            localStorage.setItem('15market_theme', next);
            document.documentElement.classList.toggle('light', next === 'light');
            document.body.classList.toggle('light', next === 'light');
        } catch (e) {}
        setThemeState(next);
    };

    const [platformSettings, setPlatformSettings] = useState(initialSettings || {
        maintenanceMode: false,
        tradingHalted: false,
        systemBanner: "",
        bannerLevel: "info",
        minBet: 1.0
    });
    
    const [broadcastText, setBroadcastText] = useState("");
    const [broadcastDuration, setBroadcastDuration] = useState(60); // seconds
    const [isSaving, setIsSaving] = useState(false);
    // Broadcast ledger listed under the composer: each entry carries its own
    // flip-clock countdown, plus edit/withdraw controls while it is live.
    const [broadcastList, setBroadcastList] = useState([]);
    const [broadcastLoading, setBroadcastLoading] = useState(false);
    const [editingBroadcastId, setEditingBroadcastId] = useState(null);
    const [editBroadcastDraft, setEditBroadcastDraft] = useState("");
    const [busyBroadcastId, setBusyBroadcastId] = useState(null);
    // One-second heartbeat so flip clocks keep flipping while the tab is open.
    const [broadcastTick, setBroadcastTick] = useState(0);
    const [isConnected, setIsConnected] = useState(true);
    const [syncProgress, setSyncProgress] = useState(0);

    // Live metrics pushed by the keeper over the socket (every 10s, plus an
    // immediate burst on connect under `dashboard_stats`).
    const [stats, setStats] = useState({
        totalVolume: "0.00",
        platformRevenue: "0.00",
        totalWallets: 0,
        activeCount: 0,
        activeStakesTotal: "0.00",
        treasuryBalance: "0.00",
        totalTrades: 0,
        userCountries: {}
    });
    const [pulse, setPulse] = useState([]); // transient globe flashes {id, lat, lng}

    // RouteGlobe renders the reference design stock (Muscat hub, flight-city
    // arcs, NIGHT theme) — no props, exactly like the source component.

    // -----------------------------------------------------------------------

    // THE metric rows, shared by the desktop side panels and the mobile strip.
    const platformStats = useMemo(() => ([
        { label: 'Registered Users', value: String(stats.totalWallets | 0), color: '#a855f7' },
        { label: 'Total Trades', value: String(stats.totalTrades | 0), color: '#14b8a6' },
        { label: 'Active Stakes', value: `$${Number(stats.activeStakesTotal || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, color: '#f59e0b' },
        { label: 'Treasury', value: Number(stats.treasuryBalance || 0).toFixed(2), color: '#3CB371', usdc: true }
    ]), [stats.totalWallets, stats.totalTrades, stats.activeStakesTotal, stats.treasuryBalance]);
    const pulseStats = useMemo(() => ([
        { label: 'Users Live Now', value: String(stats.activeCount | 0), color: '#22c55e' },
        { label: 'Total Volume', value: `$${Number(stats.totalVolume || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, color: '#3CB371' },
        { label: 'Open Disputes', value: String(stats.pendingDisputes | 0), color: '#ef4444' },
        { label: 'Bullish Sentiment', value: `${stats.bullBearRatio != null ? stats.bullBearRatio : 50}%`, color: '#3CB371' }
    ]), [stats.activeCount, stats.totalVolume, stats.pendingDisputes, stats.bullBearRatio]);

    const [recentActivity, setRecentActivity] = useState([]);
    // Payout-retry in-flight set: warms the spinning icon on a PAY FAIL pill
    // while the engine re-credits and re-broadcasts the settlement.
    const [retryingPayouts, setRetryingPayouts] = useState(() => new Set());

    // Retry a won trade whose on-chain payout failed. The backend re-credits
    // the user's wallet and re-broadcasts the settlement, re-emitting
    // global_trade_settled — we also patch the row locally so the pill flips
    // to PAID immediately even if that re-emit is what got dropped.
    const retryPayout = async (row) => {
        const id = String(row?.betId || row?.id || '');
        if (!id) return;
        setRetryingPayouts(prev => new Set(prev).add(id));
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/trades/${encodeURIComponent(id)}/payout-retry`, { method: 'POST' });
            const data = await res.json().catch(() => ({}));
            if (data?.ok || data?.alreadyPaid || data?.success) {
                setRecentActivity(prev => prev.map(x => (
                    String(x.betId || x.id) === id
                        ? {
                            ...x,
                            payoutFailed: false,
                            paid: true,
                            status: 'PAID',
                            payout: x.payout ?? data.payout ?? 0,
                            settledAt: x.settledAt || Date.now()
                        }
                        : x
                )));
            }
        } catch (e) {}
        finally {
            setRetryingPayouts(prev => {
                const next = new Set(prev);
                next.delete(id);
                return next;
            });
        }
    };

    // Event-driven refresh bus: any live platform event bumps the epoch, and
    // every section-level fetch depends on it — so treasury, trades, analytics
    // and referral data reconcile in real time on BOTH desktop and mobile
    // instead of only when the page is reloaded. Bursts (the 10s stats pulse,
    // several trades landing together) coalesce into one refetch.
    const [dataEpoch, setDataEpoch] = useState(0);
    const lastEpochBumpRef = useRef(0);
    // Addresses that returned 404 from /profile — skip repeat lookups.
    const profileMissRef = useRef(new Set());
    const bumpEpoch = (force = false) => {
        const now = Date.now();
        if (!force && now - lastEpochBumpRef.current < 8000) return;
        lastEpochBumpRef.current = now;
        setDataEpoch(e => e + 1);
    };

    // Realtime beam clock — ticks only while a trade in the feed is pending.
    const [feedNow, setFeedNow] = useState(() => Date.now());
    const pendingFeedCount = useMemo(() => recentActivity.filter(t => t.pending && t.settleAt && !t.settled).length, [recentActivity]);
    const feedAt = pendingFeedCount ? feedNow : 0;
    useEffect(() => {
        if (!pendingFeedCount) return;
        const iv = setInterval(() => setFeedNow(Date.now()), 250);
        return () => clearInterval(iv);
    }, [pendingFeedCount]);

    // Live quotes for the feed's pending trades — powers the SAME win/lose
    // tracker the user side paints onto its beam: current market price vs the
    // trade's entry, in the trade's own direction. Polled only while trades
    // are actually pending (one request per distinct symbol every 4s).
    const [livePrices, setLivePrices] = useState({});
    const pendingSymbolsKey = useMemo(() => (
        [...new Set(recentActivity.filter(t => t.pending && t.settleAt && !t.settled)
            .map(t => String(t.symbol || '').toLowerCase()))].filter(Boolean).sort().join(',')
    ), [recentActivity]);
    useEffect(() => {
        if (!pendingSymbolsKey) return;
        let alive = true;
        const syms = pendingSymbolsKey.split(',');
        const poll = async () => {
            const out = {};
            await Promise.all(syms.map(async s => {
                try {
                    const res = await fetch(`${KEEPER_URL_ARC}/price/${encodeURIComponent(s)}`);
                    if (res.ok) { const j = await res.json(); if (j && j.price > 0) out[s] = Number(j.price); }
                } catch { /* offline — keep the last known quote */ }
            }));
            if (alive && Object.keys(out).length) setLivePrices(prev => ({ ...prev, ...out }));
        };
        poll();
        const iv = setInterval(poll, 4000);
        return () => { alive = false; clearInterval(iv); };
    }, [pendingSymbolsKey]);

    // -----------------------------------------------------------------------
    // Feed cell renderers — shared by the desktop grid AND the stacked mobile
    // layout so both sizes always show identical data.

    // PENDING — the EXACT radiant laser beam from the user side
    // (TradingWidget.ProgressBeam): slanted ash/grey striped conduit track,
    // glowing laser fill whose COLOR is the live win/lose tracker, white spark
    // flare riding the advancing edge. The circling pending spinner rides
    // AFTER the beam in the same line — no countdown text; the settled event
    // replaces this cell the moment the verdict lands.
    const renderPendingFeedCell = (act) => {
        const start = Number(act.timestamp || act.createdAt) || (act.settleAt - 15000);
        const span = Math.max(1000, act.settleAt - start);
        const elapsed = feedAt - start;
        const beamPct = Math.max(0, Math.min(100, (elapsed / span) * 100));
        const entry = Number(act.entryPrice);
        const live = livePrices[String(act.symbol || '').toLowerCase()] || 0;
        const isWinning = (live > 0 && entry > 0)
            ? (act.direction === 'UP' ? live > entry : live < entry)
            : null; // no live quote yet — neutral amber until the first tick lands
        const color = isWinning === null ? '#f59e0b' : isWinning ? '#1A6140' : '#FF914D';
        const head = isWinning === null ? '#fcd34d' : isWinning ? '#1A6140' : '#FFB085';
        return (
            <div className="w-full flex items-center gap-1.5">
                <div className="flex-1 relative flex items-center min-w-[56px] h-[24px] px-1 select-none">
                    {/* Conduit track — slanted ash/grey diagonal stripes on the UN-FILLED portion */}
                    <div
                        className="w-full h-[6px] rounded-full relative overflow-hidden"
                        style={{
                            background: 'repeating-linear-gradient(135deg, rgba(148,150,155,0.30) 0 4px, rgba(148,150,155,0.08) 4px 9px)',
                            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.25)',
                        }}
                    >
                        {/* Radiant Laser Line Beam — width only from progress, color from win/lose */}
                        <div
                            className="h-full rounded-full relative flex items-center justify-end will-change-[width]"
                            style={{
                                width: `${beamPct}%`,
                                background: `linear-gradient(90deg, ${color} 0%, ${head} 100%)`,
                                boxShadow: `0 0 6px ${color}, 0 0 12px ${color}, 0 0 20px ${color}`,
                            }}
                        >
                            {/* Laser Head Flare / Spark on the advancing (right) edge */}
                            {beamPct > 1 && (
                                <div className="relative flex items-center justify-center">
                                    <div
                                        className="absolute w-[9px] h-[9px] rounded-full animate-ping opacity-60 pointer-events-none"
                                        style={{ backgroundColor: color }}
                                    />
                                    <div
                                        className="w-[4px] h-[7px] rounded-full z-10"
                                        style={{ backgroundColor: '#ffffff', boxShadow: `0 0 6px #ffffff, 0 0 12px ${color}, 0 0 18px ${color}` }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                {/* Circling pending spinner — AFTER the beam, same line */}
                <div
                    className="flex-none w-3.5 h-3.5 rounded-full border-2 animate-spin"
                    style={{ borderColor: color, borderTopColor: 'transparent', opacity: 0.75 }}
                />
            </div>
        );
    };

    // SETTLED / verdict — +payout or LOST, plus the Paid / payout-retry state.
    const renderVerdictFeedCell = (act) => (
        <div className="flex flex-col items-start gap-1 min-w-0">
            <div className={`text-[10px] font-black uppercase tracking-wide ${act.won ? 'text-[#1A6140]' : (act.status === 'DISPUTE' ? 'text-orange-400 animate-pulse' : (act.pending || act.type === 'TRADE_PLACED' ? 'text-amber-500' : (act.status === 'CANCELLED' ? 'text-amber-500' : 'text-red-500')))}`}>
                {act.won
                    ? <span>+${Number(act.payout || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                    : (act.status === 'DISPUTE'
                        ? <span title={act.disputeReason || 'Parked for manual review'}>⚑ Dispute</span>
                        : (act.status === 'CANCELLED'
                            ? <span title={act.refunded ? 'Refunded to the user' : 'Voided, no refund'}>Voided</span>
                            : (act.settled ? 'LOST' : (act.pending ? 'PENDING' : (act.type === 'TRADE_PLACED' ? 'PENDING' : 'LOST')))))}
            </div>
            {/* Paid state: every settled win shows whether the won amount
                actually landed in the user's wallet. A payout delivery failure
                surfaces a red pill with a retry button instead of a hang. */}
            {act.won && act.payoutFailed && (
                <button
                    onClick={() => retryPayout(act)}
                    title="Retry payout delivery to the user's wallet"
                    className={`flex items-center gap-1 px-1.5 py-[2px] rounded-full text-[7px] font-black uppercase tracking-widest cursor-pointer transition-colors ${isLight ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20' : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'} ${retryingPayouts.has(String(act.betId || act.id)) ? 'animate-pulse' : ''}`}
                >
                    <RefreshCw size={8} className={retryingPayouts.has(String(act.betId || act.id)) ? 'animate-spin' : ''} />
                    Pay fail · retry
                </button>
            )}
            {act.won && !act.payoutFailed && (act.paid !== false) && (
                <span className={`px-1.5 py-[2px] rounded-full text-[7px] font-black uppercase tracking-widest w-fit ${isLight ? 'bg-[#1A6140]/10 text-[#1A6140]' : 'bg-[#1A6140]/20 text-[#4ade80]'}`}>
                    Paid
                </span>
            )}
        </div>
    );

    const [userProfiles, setUserProfiles] = useState({});
    // Referral commission withdrawal requests (manual payouts — not on-chain).
    const [refWithdrawals, setRefWithdrawals] = useState([]);

    const fetchRefWithdrawals = async () => {
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/referral/withdrawals`);
            if (res.ok) setRefWithdrawals(await res.json());
        } catch (e) { /* list stays empty; the card shows a retry button */ }
    };

    // Refetches on the event-driven epoch too — new commissions, withdrawals
    // or participant events reconcile without a page reload.
    useEffect(() => {
        fetchRefWithdrawals();
    }, [dataEpoch]);

    const setRefWithdrawalStatus = async (id, status, note = '') => {
        setProcessingId(id);
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/referral/withdrawals/${id}`, {
                method: 'POST',
                body: JSON.stringify({ status, note })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Update failed');
            notify(status === 'paid' ? 'Withdrawal approved — user notified by email' : 'Withdrawal cancelled — user notified by email', 'success');
            fetchRefWithdrawals();
            if (adminTab === 'referrals') fetchRefUsers();
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            setProcessingId(null);
        }
    };

    // Sidebar section + Referral Program tab. Persisted so the console
    // reopens where the operator left it. (The pre-referrals key was
    // "withdrawals" — silently remapped.)
    const [adminTab, setAdminTab] = useState(() => {
        let t;
        try { t = localStorage.getItem('15m_admin_section') || 'overview'; } catch (e) { t = 'overview'; }
        return t === 'withdrawals' ? 'referrals' : t;
    });
    const [wdSection, setWdSection] = useState('participants');

    // Security section: internal tabs (roster / protocols), persisted.
    const [secTab, setSecTab] = useState(() => {
        try { return localStorage.getItem('15m_sec_tab') === 'protocols' ? 'protocols' : 'team'; } catch (e) { return 'team'; }
    });
    const selectSecTab = (key) => {
        setSecTab(key);
        try { localStorage.setItem('15m_sec_tab', key); } catch (e) {}
    };

    const selectSection = (key) => {
        setAdminTab(key);
        try { localStorage.setItem('15m_admin_section', key); } catch (e) {}
    };

    // Sidebar expanded (full menu) ↔ collapsed (icon rail).
    const [sidebarOpen, setSidebarOpen] = useState(() => {
        try { return localStorage.getItem('15m_admin_sidebar') !== 'collapsed'; } catch (e) { return true; }
    });
    const toggleSidebar = () => {
        setSidebarOpen(prev => {
            try { localStorage.setItem('15m_admin_sidebar', prev ? 'collapsed' : 'open'); } catch (e) {}
            return !prev;
        });
    };
    const [refUsers, setRefUsers] = useState([]);
    const [refUsersError, setRefUsersError] = useState('');
    const [refUsersQ, setRefUsersQ] = useState('');
    const [openRefUser, setOpenRefUser] = useState(null);
    const [refStatCache, setRefStatCache] = useState({});
    const [rateDrafts, setRateDrafts] = useState({});
    const [slashDrafts, setSlashDrafts] = useState({});
    const [refActionBusy, setRefActionBusy] = useState('');
    const [processingId, setProcessingId] = useState(null);
    const [wdFilter, setWdFilter] = useState('all');
    // Cancel-with-reason modal state: the note is emailed to the user with
    // the cancellation notice.
    const [cancelFor, setCancelFor] = useState(null);
    const [cancelNote, setCancelNote] = useState('');

    const fetchRefUsers = async (q = refUsersQ) => {
        try {
            const params = q ? `?q=${encodeURIComponent(q)}` : '';
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/referral/users${params}`);
            const data = await res.json().catch(() => []);
            if (!res.ok) {
                setRefUsersError(res.status === 403
                    ? 'Your admin role is missing the referral management permission for the full participants view'
                    : `Participants failed to load (${res.status})`);
                setRefUsers([]);
                return;
            }
            setRefUsersError('');
            setRefUsers(Array.isArray(data) ? data : []);
        } catch (e) {
            setRefUsersError('Backend unreachable — check the connection and retry');
        }
    };

    // Expand a user: fetch their commission stats + withdrawals once, lazily —
    // the bulk admin read stays light while still showing real numbers.
    // The same loader is reused by the participants list's background
    // earnings prefetch, so totals are visible without expanding rows.
    const fetchUserEarnings = async (addr) => {
        try {
            const [s, w] = await Promise.all([
                fetch(`${KEEPER_URL_ARC}/referral/stats/${addr}`),
                fetch(`${KEEPER_URL_ARC}/referral/withdrawals/${addr}`)
            ]);
            const sData = s.ok ? await s.json() : null;
            const wds = w.ok ? (await w.json()) || [] : [];
            const sumBy = (st) => wds.filter(x => x.status === st).reduce((acc, x) => acc + Number(x.amount || 0), 0);
            setRefStatCache(prev => ({ ...prev, [addr]: { stats: sData, pending: sumBy('pending'), paid: sumBy('paid') } }));
        } catch (e) {
            setRefStatCache(prev => { const c = { ...prev }; delete c[addr]; return c; });
        }
    };

    const toggleRefUser = async (addr) => {
        const next = openRefUser === addr ? null : addr;
        setOpenRefUser(next);
        if (next && !refStatCache[addr]) {
            setRefStatCache(prev => ({ ...prev, [addr]: 'loading' }));
            await fetchUserEarnings(addr);
        }
    };

    // Once the participants list is in, resolve each user's earnings
    // sequentially in the background (cached entries are skipped) so the
    // Participants tab shows commission, referrals and payout figures
    // immediately.
    useEffect(() => {
        if (adminTab !== 'referrals') return;
        const uncached = refUsers.filter(u => !refStatCache[u.address]);
        if (uncached.length === 0) return;
        let cancelled = false;
        (async () => {
            for (const u of uncached) {
                if (cancelled) return;
                await fetchUserEarnings(u.address);
            }
        })();
        return () => { cancelled = true; };
    }, [adminTab, refUsers]);

    const doRefAction = async (endpoint, payload, successMsg) => {
        setRefActionBusy(`${endpoint}:${payload.address}`);
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/referral/${endpoint}`, {
                method: 'POST',
                body: JSON.stringify(payload)
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Action failed');
            if (successMsg) notify(successMsg, 'success');
            await fetchRefUsers();
            fetchRefWithdrawals();
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            setRefActionBusy('');
        }
    };

    useEffect(() => {
        if (adminTab === 'referrals') {
            fetchRefUsers();
            if (wdSection === 'withdrawals') fetchRefWithdrawals();
        }
    }, [adminTab, wdSection, dataEpoch]);

    const fetchProfile = async (addr) => {
        if (!addr) return;
        const lowAddr = addr.toLowerCase();
        if (userProfiles[lowAddr]) return;
        // Negative cache too — an address with no profile (fresh wallet) must
        // not be re-requested on every event/ops pulse.
        if (profileMissRef.current.has(lowAddr)) return;
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/profile?address=${lowAddr}`);
            if (res.ok) {
                const data = await res.json();
                setUserProfiles(prev => ({ ...prev, [lowAddr]: data }));
            } else {
                profileMissRef.current.add(lowAddr);
            }
        } catch (e) {}
    };

    // Real-time Event Subscriptions
    useEffect(() => {
        socketService.connect();

        // 1. Metrics pulse — keeper broadcasts the ops payload every 10s and
        //    once on connect (dashboard_stats).
        const applyStats = (data) => {
            if (!data) return;
            setStats(prev => ({ ...prev, ...data }));
            setIsConnected(true);
            // The pulse doubles as a refresh trigger for non-socket data
            // (referral lists, treasury ledger) — debounced by the bus.
            bumpEpoch();
        };
        const unbindMetrics = socketService.on('admin_stats_update', applyStats);
        const unbindMetrics2 = socketService.on('dashboard_stats', applyStats);

        // Globe flash: drop a temporary pin at the actor's country center.
        const flashCountry = (country) => {
            const center = COUNTRY_CENTER[String(country || '').toUpperCase()];
            if (!center) return;
            const id = `${Date.now()}:${Math.random()}`;
            setPulse(prev => [...prev.slice(-5), { id, lat: center[0], lng: center[1] }]);
            setTimeout(() => setPulse(prev => prev.filter(p => p.id !== id)), 9000);
        };

        // Resolve a user's country from the (possibly uncached) profile.
        const pingUserCountry = (addr) => {
            if (!addr) return;
            const low = addr.toLowerCase();
            const cached = userProfiles[low];
            if (cached?.country) return flashCountry(cached.country);
            fetch(`${KEEPER_URL_ARC}/profile?address=${low}`)
                .then(r => (r.ok ? r.json() : null))
                .then(p => {
                    if (p?.country) {
                        setUserProfiles(prev => ({ ...prev, [low]: p }));
                        flashCountry(p.country);
                    }
                })
                .catch(() => {});
        };

        // 2. Trade Index (fully event-driven, realtime)
        // The backend broadcasts global_trade_executed the moment a user's
        // POST /session/execute lands (full trade object with settleAt), and
        // global_trade_settled when the verdict locks. The admin rows mirror
        // that lifecycle: entry -> countdown beam -> WON/LOST + payout.
        const normalizeIncomingTrade = (t) => {
            if (!t) return null;
            const createdAt = t.createdAt || t.timestamp || Date.now();
            const duration = Number(t.duration) > 0 ? Number(t.duration) : 15;
            const settleAt = t.settleAt || (createdAt + duration * 1000);
            const dirRaw = String(t.direction ?? t.dir ?? '').toUpperCase();
            return {
                id: String(t.id || t.betId || `${Date.now()}:${Math.random()}`),
                betId: String(t.betId || t.id || ''),
                userAddr: t.userAddr || t.owner || '',
                owner: t.userAddr || t.owner || '',
                symbol: String(t.symbol || 'BTC').toUpperCase(),
                amount: t.amount,
                shares: t.shares || t.amount,
                entryPrice: t.entryPrice ?? null,
                direction: dirRaw === '1' || dirRaw === 'UP' || dirRaw === 'LONG' ? 'UP' : 'DOWN',
                status: t.status || null,
                paid: t.paid !== undefined ? !!t.paid : null,
                payoutFailed: !!t.payoutFailed,
                timestamp: createdAt,
                duration,
                settleAt,
                type: 'TRADE_PLACED',
                pending: true,
                settled: false,
                won: null,
                payout: null,
                exitPrice: null,
            };
        };

        const upsertIndexedTrade = (row) => {
            setRecentActivity(prev => {
                const key = row.betId || row.id;
                const rest = prev.filter(x => (x.betId || x.id) !== key);
                return [row, ...rest].slice(0, 60);
            });
        };

        const bindExecuted = socketService.on('global_trade_executed', (trade) => {
            const row = normalizeIncomingTrade(trade);
            if (!row) return;
            upsertIndexedTrade(row);
            if (row.userAddr) fetchProfile(row.userAddr);
            pingUserCountry(row.userAddr || row.owner);
            bumpEpoch();
        });
        // Back-compat alias (orig design event; harmless if the backend never fires it)
        const unbindTradesLegacy = socketService.on('new_trade', (trade) => {
            const row = normalizeIncomingTrade(trade);
            if (!row) return;
            upsertIndexedTrade(row);
            if (row.userAddr) fetchProfile(row.userAddr);
            pingUserCountry(row.userAddr || row.owner);
        });

        // Settlement: merge the verdict into the exact indexed row (matched by
        // betId). If the entry push was missed (admin connected mid-flight),
        // settle merges into any snapshot row or the head instead of vanishing.
        // payoutFailed arrives as a real verdict too — it renders as a
        // WON + PAY FAIL pill with a retry button, not a stuck "Resolving…".
        const bindSettled = socketService.on('global_trade_settled', (res) => {
            if (!res) return;
            const key = String(res.betId || res.tradeId || res.id || '');
            setRecentActivity(prev => {
                const idx = prev.findIndex(x => String(x.betId || x.id) === key);
                const paid = res.paid !== undefined ? !!res.paid : !res.payoutFailed;
                if (idx === -1) {
                    // Result without a witnessed entry: still index it.
                    const row = normalizeIncomingTrade(res);
                    if (!row) return prev;
                    return [{ ...row, pending: false, settled: true, won: !!res.won, status: res.status || (res.won ? 'PAID' : 'LOST'), paid, payoutFailed: !!res.payoutFailed, payout: res.payout ?? 0, exitPrice: res.exitPrice ?? null, timestamp: Date.now(), type: 'TRADE_SETTLED' }, ...prev].slice(0, 60);
                }
                const next = [...prev];
                next[idx] = {
                    ...next[idx],
                    pending: false,
                    settled: true,
                    settledAt: res.settledAt || Date.now(),
                    won: !!res.won,
                    status: res.status || (res.won ? 'WON' : 'LOST'),
                    paid,
                    payoutFailed: !!res.payoutFailed,
                    payout: res.payout ?? next[idx].payout ?? 0,
                    exitPrice: res.exitPrice ?? next[idx].exitPrice ?? null,
                };
                bumpEpoch();
                return next;
            });
        });

        // Dispute echo: the engine parked a trade for a human decision. The row
        // drops its beam and shows a DISPUTE marker instead of hanging on the
        // countdown forever — no verdict exists yet, nothing is red (the stake
        // is intact until an admin clears it).
        const bindDisputed = socketService.on('global_trade_disputed', (res) => {
            if (!res) return;
            const key = String(res.betId || res.id || '');
            if (!key) return;
            setRecentActivity(prev => {
                const idx = prev.findIndex(x => String(x.betId || x.id) === key);
                if (idx === -1) {
                    const row = normalizeIncomingTrade(res);
                    if (!row) return prev;
                    return [{ ...row, pending: false, settled: false, status: 'DISPUTE', disputeReason: res.reason || null, timestamp: Date.now() }, ...prev].slice(0, 60);
                }
                const next = [...prev];
                next[idx] = { ...next[idx], pending: false, settled: false, status: 'DISPUTE', disputeReason: res.reason || null };
                return next;
            });
        });

        // Voided echo: support cancelled the trade manually (refund or not) —
        // a terminal state, so the row leaves the pending beam immediately.
        const bindResolved = socketService.on('global_trade_resolved', (res) => {
            if (!res) return;
            const key = String(res.betId || res.id || '');
            if (!key) return;
            setRecentActivity(prev => {
                const idx = prev.findIndex(x => String(x.betId || x.id) === key);
                if (idx === -1) {
                    const row = normalizeIncomingTrade(res);
                    if (!row) return prev;
                    return [{ ...row, pending: false, settled: true, status: 'CANCELLED', won: false, refunded: res.refunded ?? 0, timestamp: Date.now(), type: 'TRADE_SETTLED' }, ...prev].slice(0, 60);
                }
                const next = [...prev];
                next[idx] = { ...next[idx], pending: false, settled: true, status: 'CANCELLED', won: false, refunded: res.refunded ?? 0 };
                return next;
            });
        });

        // 3. User Onboarding (Geo Pin)
        const unbindUsers = socketService.on('user_onboarded', (user) => {
            if (user.address) fetchProfile(user.address);
            pingUserCountry(user.address);
            bumpEpoch();
        });

        // 3b. Referral enrollment — append the new participant immediately so
        // the Participants list reflects enrolments without a page reload.
        const unbindRefEnroll = socketService.on('referral_enrolled', (payload) => {
            if (!payload?.address) return;
            const newUser = {
                address: payload.address,
                username: payload.username || null,
                referralCode: payload.referralCode || null,
                referredBy: payload.referredBy || null,
                enrolled: true,
                enrolledAt: payload.enrolledAt || Date.now(),
                suspended: false,
                rateOverride: null,
                slashed: 0,
                hasEmail: false,
            };
            setRefUsers(prev => {
                // Avoid duplicates if a re-fetch already added the row.
                if (prev.some(u => u.address === newUser.address)) return prev;
                return [newUser, ...prev];
            });
            bumpEpoch();
        });

        // 3.5 SIEM — backend pushes HIGH/CRITICAL security events live so bad
        // actors are surfaced on the console the moment they act.
        const unbindSiem = socketService.on('siem_alert', (ev) => {
            if (!ev) return;
            setSiemEvents(prev => [ev, ...prev].slice(0, 250));
            setSiemSummary(prev => prev ? {
                ...prev,
                total24h: (prev.total24h || 0) + 1,
                [ev.type === 'AUTH_FAILURE' ? 'authFailures'
                    : ev.type === 'AUTH_BRUTEFORCE' ? 'bruteforce'
                    : ev.type === 'ADMIN_TAMPER' ? 'tamper'
                    : 'rateAbuse']: (prev[ev.type === 'AUTH_FAILURE' ? 'authFailures'
                        : ev.type === 'AUTH_BRUTEFORCE' ? 'bruteforce'
                        : ev.type === 'ADMIN_TAMPER' ? 'tamper' : 'rateAbuse'] || 0) + 1,
                lastEventAt: ev.at
            } : prev);
            if (ev.severity === 'high' || ev.severity === 'critical') {
                notify(`SIEM · ${ev.message} (from ${ev.ip})`, 'error');
            }
        });

        // REST fallback for the ops pulse: pull /admin/stats straight away on
        // mount, on every (re)connect, and every 30s — so a dropped mobile
        // socket self-heals with real numbers instead of displaying mounting
        // defaults until a reload.
        const fetchStatsRest = async () => {
            try {
                const res = await fetch(`${KEEPER_URL_ARC}/admin/stats`);
                if (res.ok) applyStats(await res.json());
            } catch (e) {}
        };
        fetchStatsRest();
        const unbindConnect = socketService.onConnect(() => {
            setIsConnected(true);
            bumpEpoch(true);
            fetchStatsRest();
        });
        const statsFallback = setInterval(fetchStatsRest, 30000);

        // Mobile browsers suspend sockets in background tabs; when the page
        // becomes visible again, force a reconnect and a full reconcile so
        // values are current without a manual refresh.
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (!socketService.socket?.connected) socketService.connect();
            bumpEpoch(true);
            fetchStatsRest();
        };
        document.addEventListener('visibilitychange', onVisible);

        // 4. Recent activity history for the Overview feed (snapshot; the
        //    socket pushes above keep it live afterwards).
        //    Runs once at mount AND every 12s: a snapshot row that carries a
        //    verdict resolves any still-pending row (or a stale PAY FAIL row
        //    that a retry elsewhere settled), so a settle event the socket
        //    dropped self-heals within a beat instead of hanging on
        //    "Resolving…" forever. Never clobbers live socket rows.
        const fetchHistory = async () => {
            try {
                const histRes = await fetch(`${KEEPER_URL_ARC}/admin/trades`);
                if (histRes.ok) {
                    const histData = await histRes.json();
                    (histData || []).slice(0, 20).forEach(h => {
                        if (h.owner) fetchProfile(h.owner);
                        if (h.userAddr) fetchProfile(h.userAddr);
                    });

                    // If any PENDING trade in the snapshot has a settleAt that
                    // passed >30 s ago, the engine itself is stuck — trigger
                    // resolve-stuck so the backend assigns a terminal status and
                    // re-emits global_trade_settled, which will flip the row.
                    const now = Date.now();
                    const hasStuck = (histData || []).some(h =>
                        (String(h.status || '').toUpperCase() === 'PENDING' || String(h.status || '').toUpperCase() === 'RESOLVING') &&
                        h.settleAt && Number(h.settleAt) < now - 30000
                    );
                    if (hasStuck) {
                        adminFetch(`${KEEPER_URL_ARC}/admin/trades/resolve-stuck`, { method: 'POST' }).catch(() => {});
                    }

                    setRecentActivity(prev => {
                        const byId = new Map(prev.map(r => [String(r.betId || r.id), r]));
                        for (const h of (histData || []).slice(0, 60)) {
                            const row = normalizeIncomingTrade(h);
                            if (!row || !row.betId) continue;
                            const failed = !!h.payoutFailed || String(h.status || '').toUpperCase() === 'PAYOUT_FAILED';
                            if (h.won === true || h.won === false || h.settledAt || failed) {
                                row.pending = false;
                                row.settled = true;
                                row.type = 'TRADE_SETTLED';
                                row.won = !!h.won;
                                row.status = h.status || (h.won ? 'PAID' : 'LOST');
                                row.payout = h.payout ?? null;
                                row.exitPrice = h.exitPrice ?? null;
                                row.payoutFailed = failed;
                                row.paid = !failed && !!h.won;
                            }
                            const local = byId.get(row.betId);
                            if (!local) { byId.set(row.betId, row); continue; }
                            const snapHasVerdict = row.settled && (row.won === true || row.won === false);
                            if (snapHasVerdict && (!local.settled || local.payoutFailed)) {
                                byId.set(row.betId, { ...local, ...row });
                            } else if (row.settled && local.settled && local.payoutFailed && row.paid) {
                                byId.set(row.betId, { ...local, ...row });
                            } else if (row.settled && local.settled &&
                                Number(row.settledAt || row.timestamp || 0) > Number(local.settledAt || local.timestamp || 0)) {
                                byId.set(row.betId, { ...local, ...row });
                            }
                        }
                        return [...byId.values()]
                            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                            .slice(0, 60);
                    });
                }
            } catch (e) {}
        };
        fetchHistory();
        const histTimer = setInterval(fetchHistory, 12000);

        return () => {
            clearInterval(histTimer);
            clearInterval(statsFallback);
            document.removeEventListener('visibilitychange', onVisible);
            unbindConnect();
            unbindMetrics();
            unbindSiem();
            unbindMetrics2();
            bindExecuted();
            bindSettled();
            bindDisputed();
            bindResolved();
            unbindTradesLegacy();
            unbindUsers();
            unbindRefEnroll();
        };
    }, []);

    // Heartbeat for connection status
    useEffect(() => {
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${KEEPER_URL_ARC}/health`);
                setIsConnected(res.ok);
            } catch (e) {
                setIsConnected(false);
            }
        }, 10000);
        return () => clearInterval(interval);
    }, []);

    const updateSettings = async (updates) => {
        setIsSaving(true);
        setSyncProgress(10);
        
        const newSettings = { ...platformSettings, ...updates };
        
        const performUpdate = async (retries = 2) => {
            try {
                setSyncProgress(40);
                const res = await adminFetch(`${KEEPER_URL_ARC}/settings`, {
                    method: 'POST',
                    body: JSON.stringify(newSettings)
                });
                
                if (!res.ok) {
                    if (retries > 0) {
                        setSyncProgress(prev => prev + 10);
                        await new Promise(r => setTimeout(r, 1000));
                        return performUpdate(retries - 1);
                    }
                    throw new Error("Node connection timed out — settings may not be applied");
                }
                
                setSyncProgress(90);
                setPlatformSettings(newSettings);
                notify("Protocol Settings Synchronized", "success");
                
                // Propagate to local storage for instant feedback across components
                localStorage.setItem("15market_citadel_settings", JSON.stringify(newSettings));
                window.dispatchEvent(new Event('storage'));
                
            } catch (e) {
                console.error("Admin Sync Error:", e);
                notify(e.message, "error");
                setIsConnected(false);
            }
        };

        await performUpdate();
        setSyncProgress(100);
        setTimeout(() => {
            setIsSaving(false);
            setSyncProgress(0);
        }, 800);
    };

    // ── Broadcast ledger ─────────────────────────────────────────────────
    const fetchBroadcasts = async () => {
        setBroadcastLoading(true);
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/broadcasts`);
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                setBroadcastList(Array.isArray(data.broadcasts) ? data.broadcasts : []);
            }
        } catch (e) { /* list stays as-is */ }
        finally { setBroadcastLoading(false); }
    };
    const fetchBroadcastsRef = useRef(null);
    fetchBroadcastsRef.current = fetchBroadcasts;

    const handleUpdateBroadcast = async () => {
        if (!broadcastText.trim()) return notify("Enter broadcast message", "error");

        setIsSaving(true);
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/broadcast`, {
                method: 'POST',
                body: JSON.stringify({
                    message: broadcastText,
                    expiry: Date.now() + broadcastDuration * 1000,
                    type: 'MANUAL_ADMIN'
                })
            });

            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Broadcast failed");
            }

            notify("Global Broadcast Initiated", "success");
            setBroadcastText("");
            fetchBroadcasts();
        } catch (e) {
            notify("Broadcast Error: " + e.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    const handleSaveBroadcastEdit = async (id) => {
        if (!editBroadcastDraft.trim()) return notify("Edit cannot be empty", "error");
        setBusyBroadcastId(id);
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/broadcast/${id}`, {
                method: 'POST',
                body: JSON.stringify({ message: editBroadcastDraft })
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Edit failed");
            }
            notify("Broadcast updated live", "success");
            setEditingBroadcastId(null);
            setEditBroadcastDraft("");
            fetchBroadcasts();
        } catch (e) {
            notify("Edit Error: " + e.message, "error");
        } finally { setBusyBroadcastId(null); }
    };

    const handleWithdrawBroadcast = async (id) => {
        setBusyBroadcastId(id);
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/broadcast/${id}/withdraw`, { method: 'POST' });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error || "Withdraw failed");
            }
            notify("Broadcast withdrawn — banner cleared", "success");
            fetchBroadcasts();
        } catch (e) {
            notify("Withdraw Error: " + e.message, "error");
        } finally { setBusyBroadcastId(null); }
    };

    // Load the ledger when the tab opens, refresh on any fresh socket pulse
    // (a transmission/edit/withdrawal from anywhere re-fetches instantly), and
    // tick the flip clocks once per second while the tab is mounted.
    useEffect(() => {
        if (adminTab !== 'broadcast' || !canBroadcast) return;
        fetchBroadcasts();
    }, [adminTab, canBroadcast, dataEpoch]);

    useEffect(() => {
        const unbind = socketService.on('broadcast', () => { fetchBroadcastsRef.current?.(); });
        return unbind;
    }, []);

    useEffect(() => {
        if (adminTab !== 'broadcast' || !canBroadcast) return;
        const tick = setInterval(() => setBroadcastTick(t => t + 1), 1000);
        return () => clearInterval(tick);
    }, [adminTab, canBroadcast]);

    // ── Auth context (Supabase-Auth admin) ──────────────────────────────
    const isRoot = auth?.isRoot === true || auth?.role === 'root';
    const adminPerms = auth?.permissions || [];
    const hasPerm = (p) => isRoot || adminPerms.includes('*') || adminPerms.includes(p);
    const canRequests = hasPerm('ref.withdrawals');
    const canReferral = hasPerm('ref.manage');
    const canSettings = hasPerm('platform.settings');
    const canBroadcast = hasPerm('broadcast.send');

    // Sidebar: only sections the signed-in admin is allowed to open.
    const canReferrals = canRequests || canReferral;
    const visibleNav = NAV.filter(t => (t.key === 'referrals' ? canReferrals : t.key === 'broadcast' ? canBroadcast : true));
    // Fall back to Overview if a permission change hid the saved section.
    const activeNav = visibleNav.some(t => t.key === adminTab) ? adminTab : 'overview';

    // ── SIEM — live threat/abuse feed (backend ring buffer + siem_alert) ──
    const [siemEvents, setSiemEvents] = useState([]);
    const [siemSummary, setSiemSummary] = useState(null);
    const [siemBusy, setSiemBusy] = useState(false);

    const fetchSiem = async () => {
        setSiemBusy(true);
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/siem/events`);
            if (res.ok) {
                const data = await res.json().catch(() => ({}));
                setSiemEvents(Array.isArray(data.events) ? data.events : []);
                setSiemSummary(data.summary || null);
            }
        } catch (e) { /* feed stays as-is */ }
        finally { setSiemBusy(false); }
    };

    const clearSiem = async () => {
        if (!auth?.isRoot) return;
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/siem/events`, { method: 'DELETE' });
            if (res.ok) {
                setSiemEvents([]);
                notify('SIEM log cleared', 'success');
            } else notify('Could not clear SIEM log', 'error');
        } catch (e) { notify('Could not clear SIEM log', 'error'); }
    };

    useEffect(() => {
        if (adminTab === 'siem') fetchSiem();
    }, [adminTab, dataEpoch]);

    // ── Admins & Moderators (root-only, migration 011) ───────────────────
    const [adminRoster, setAdminRoster] = useState([]);
    const [rosterBusy, setRosterBusy] = useState(false);
    const [newAdmin, setNewAdmin] = useState({ email: '', password: '', role: 'moderator', permissions: ['ref.withdrawals'] });
    const [createAdminBusy, setCreateAdminBusy] = useState(false);
    const [showCreateAdmin, setShowCreateAdmin] = useState(false);

    const fetchAdminRoster = async () => {
        setRosterBusy(true);
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/auth/admins`);
            if (res.ok) {
                const data = await res.json().catch(() => []);
                setAdminRoster(Array.isArray(data) ? data : []);
            }
        } catch (e) { /* roster stays as-is */ }
        finally { setRosterBusy(false); }
    };

    useEffect(() => {
        if (adminTab === 'security' && auth?.isRoot) fetchAdminRoster();
    }, [adminTab, auth]);

    const createAdmin = async () => {
        setCreateAdminBusy(true);
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/auth/admins`, {
                method: 'POST',
                body: JSON.stringify({ ...newAdmin, email: newAdmin.email.trim() })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Could not create admin');
            notify(`${newAdmin.email.trim()} created as ${newAdmin.role}`, 'success');
            setShowCreateAdmin(false);
            setNewAdmin({ email: '', password: '', role: 'moderator', permissions: ['ref.withdrawals'] });
            fetchAdminRoster();
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            setCreateAdminBusy(false);
        }
    };

    const setAdminPermission = async (row, perm) => {
        const next = (row.permissions || []).includes(perm)
            ? (row.permissions || []).filter(p => p !== perm)
            : [...(row.permissions || []), perm];
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/auth/admins/${row.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ permissions: next })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Update failed');
            fetchAdminRoster();
        } catch (e) { notify(e.message, 'error'); }
    };

    const setAdminRole = async (row, role) => {
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/auth/admins/${row.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ role, permissions: ROLE_PRESETS[role] })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Update failed');
            notify(`${row.email} is now ${role}`, 'success');
            fetchAdminRoster();
        } catch (e) { notify(e.message, 'error'); }
    };

    const setAdminSuspension = async (row, suspended) => {
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/auth/admins/${row.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ suspended })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Update failed');
            notify(suspended ? `${row.email} suspended` : `${row.email} reinstated`, 'success');
            fetchAdminRoster();
        } catch (e) { notify(e.message, 'error'); }
    };

    const removeAdmin = async (row) => {
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/auth/admins/${row.id}`, { method: 'DELETE' });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Delete failed');
            notify(`${row.email} removed from the admin team`, 'success');
            fetchAdminRoster();
        } catch (e) { notify(e.message, 'error'); }
    };

    // Permission presets for the (re)assign UI. Mirrors the backend defaults;
    // 'admins.manage' is never grantable — it is the root's birthright.
    const ROLE_PRESETS = { admin: ['ref.withdrawals', 'ref.manage', 'platform.settings', 'broadcast.send', 'trades.maintenance'], moderator: ['ref.withdrawals'] };
    const GRANTABLE_PERMS = [
        { tag: 'ref.withdrawals', label: 'Withdrawal requests' },
        { tag: 'ref.manage', label: 'Referral management' },
        { tag: 'platform.settings', label: 'Platform settings' },
        { tag: 'broadcast.send', label: 'Broadcasts' },
        { tag: 'trades.maintenance', label: 'Trade maintenance' }
    ];

    const AdminCard = ({ title, icon: Icon, children, accent = "#1A6140" }) => (
        // Glow language copied from the user side: the card lifts off the
        // canvas with a green bloom (dark) / layered soft shadows (light).
        <div className={`p-6 border rounded-[32px] backdrop-blur-xl relative overflow-hidden group transition-shadow ${
            isLight
                ? 'bg-white/70 border-[#1A6140]/20 shadow-[0_0_40px_-12px_rgba(26,97,64,0.18),0_24px_48px_-24px_rgba(0,0,0,0.12)]'
                : 'bg-[#0D0D0D]/80 border-white/5 shadow-[0_0_60px_-15px_rgba(26,97,64,0.22),0_30px_60px_-30px_rgba(0,0,0,0.85)]'
        }`}>
            <div className="absolute top-0 left-0 w-1 h-full opacity-40 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: accent }} />
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl" style={{ backgroundColor: `${accent}15`, color: accent }}>
                        <Icon size={18} />
                    </div>
                    <h3 className={`text-xs font-black uppercase tracking-[0.2em] ${isLight ? 'text-black' : 'text-white'}`}>{title}</h3>
                </div>
            </div>
            {children}
        </div>
    );

    return (
        <div className={`h-[100dvh] md:h-screen w-full flex overflow-hidden relative ${isLight ? 'bg-[#F4F7F5] text-black' : 'bg-[#050505] text-white'}`}>
            {/* Background Flair */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#1A6140]/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#1A6140]/3 rounded-full blur-[120px]" />
            </div>

            {/* Sidebar — desktop operations menu (mobile gets the tab bar) */}
            <nav className={`relative z-50 flex-none hidden md:flex flex-col border-r backdrop-blur-3xl transition-all duration-300 ${sidebarOpen ? 'w-64' : 'w-[76px]'} ${isLight ? 'bg-white/60 border-[#1A6140]/15' : 'bg-[#0A0A0A]/70 border-white/5'}`}>
                {/* Brand head — same wordmark as the user side, ADMIN beside it */}
                <div className="flex-none px-4 pt-5 pb-4 flex items-center gap-3 overflow-hidden">
                    {sidebarOpen ? (
                        <>
                            <img
                                src={isLight ? '/goblogo.png' : '/gowlogo.png'}
                                alt="15market"
                                className="h-[34px] w-[120px] object-cover object-center flex-none"
                            />
                            <span className={`w-px h-9 flex-none ${isLight ? 'bg-black/10' : 'bg-white/15'}`} />
                            <span className="text-[10px] font-black uppercase tracking-[0.3em] text-[#1A6140]">Admin</span>
                        </>
                    ) : (
                        <img
                            src={isLight ? '/goblogo.png' : '/gowlogo.png'}
                            alt="15market"
                            className="h-[25px] w-[25px] object-contain flex-none mx-auto"
                        />
                    )}
                </div>

                {/* Sections */}
                <div className="flex-1 flex flex-col gap-1.5 px-3 pt-2 overflow-y-auto no-scrollbar min-h-0">
                    {visibleNav.map(t => {
                        const Icon = t.icon;
                        const active = activeNav === t.key;
                        const badge = t.key === 'referrals' ? refWithdrawals.filter(w => w.status === 'pending').length : 0;
                        return (
                            <button
                                key={t.key}
                                onClick={() => selectSection(t.key)}
                                title={sidebarOpen ? undefined : t.label}
                                className={`flex items-center gap-3 px-3.5 py-3.5 rounded-2xl text-left transition-all active:scale-[0.98] ${active
                                    ? 'bg-[#1A6140] text-white shadow-lg shadow-[#1A6140]/25'
                                    : isLight ? 'text-black/50 hover:text-black hover:bg-black/[0.04]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                            >
                                <Icon size={17} className="flex-none" />
                                {sidebarOpen && (
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[10px] font-black uppercase tracking-widest truncate">{t.label}</span>
                                        <span className={`block text-[7px] font-bold uppercase tracking-widest mt-0.5 truncate ${active ? 'text-white/60' : 'opacity-30'}`}>{t.hint}</span>
                                    </span>
                                )}
                                {badge > 0 && (
                                    <span className="flex-none px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[8px] font-black leading-none">{badge}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Bottom rail: theme switch + collapse toggle + identity */}
                <div className={`flex-none p-3 flex flex-col gap-1.5 border-t ${isLight ? 'border-black/5' : 'bg-transparent border-white/5'}`}>
                    {sidebarOpen ? (
                        <div className="flex items-center gap-3 px-3 py-1">
                            <span
                                className="text-[9px] font-black uppercase tracking-widest flex-none"
                                style={{ color: isLight ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.7)' }}
                            >
                                Theme
                            </span>
                            <ThemeToggle theme={themeState} onToggle={toggleTheme} />
                        </div>
                    ) : (
                        <button
                            onClick={toggleTheme}
                            title="Switch theme"
                            className={`self-center p-2.5 rounded-xl transition-all active:scale-95 ${isLight ? 'text-black/40 hover:text-black hover:bg-black/[0.04]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                        >
                            {isLight ? <Moon size={14} /> : <Sun size={14} />}
                        </button>
                    )}
                    <button
                        onClick={toggleSidebar}
                        title={sidebarOpen ? 'Collapse menu' : 'Expand menu'}
                        className={`self-center p-2.5 rounded-xl transition-all active:scale-95 ${isLight ? 'text-black/40 hover:text-black hover:bg-black/[0.04]' : 'text-white/40 hover:text-white hover:bg-white/5'}`}
                    >
                        {sidebarOpen ? <ChevronsLeft size={15} /> : <ChevronsRight size={15} />}
                    </button>
                    {auth?.email && (
                        <div
                            title={auth.email}
                            className={`flex items-center gap-3 px-2 py-2 rounded-2xl border overflow-hidden ${isLight ? 'bg-white border-[#1A6140]/20' : 'bg-white/5 border-white/5'}`}
                        >
                            <div className="w-8 h-8 rounded-xl bg-[#1A6140] flex items-center justify-center text-white text-[10px] font-black uppercase flex-none">
                                {auth.email.slice(0, 2)}
                            </div>
                            {sidebarOpen && (
                                <div className="flex-1 flex flex-col min-w-0">
                                    <span className={`text-[9px] font-black uppercase tracking-widest truncate ${isLight ? 'text-black' : 'text-white'}`}>{auth.email}</span>
                                    <span className="text-[7px] font-black uppercase tracking-widest text-[#1A6140]">{auth.isRoot ? 'Root' : auth.role || 'Admin'}</span>
                                </div>
                            )}
                            <button
                                onClick={auth.signOut || auth.onSignOut}
                                title="Sign out"
                                className={`flex-none p-2 rounded-xl transition-all active:scale-95 ${isLight ? 'bg-black/[0.04] hover:bg-red-500/10 text-black/40 hover:text-red-500' : 'bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-500'}`}
                            >
                                <LogOut size={13} />
                            </button>
                        </div>
                    )}
                </div>
            </nav>

            {/* Main column */}
            <div className="flex-1 flex flex-col min-w-0">

                {/* MOBILE top bar — brand + quick identity, above the scroller. */}
                <div className={`md:hidden flex-none flex items-center gap-3 px-4 py-2.5 z-40 ${isLight ? 'bg-[#F4F7F5]' : 'bg-[#050505]'}`}>
                    <img
                        src={isLight ? '/goblogo.png' : '/gowlogo.png'}
                        alt="15market"
                        className="h-[25px] w-[90px] object-cover object-center flex-none"
                    />
                    <span className={`w-px h-7 flex-none ${isLight ? 'bg-black/10' : 'bg-white/15'}`} />
                    <span className="text-[9px] font-black uppercase tracking-[0.3em] text-[#1A6140] flex-none">Admin</span>
                    <div className="ml-auto flex items-center gap-2">
                        <ThemeToggle theme={themeState} onToggle={toggleTheme} />
                        {auth?.email && (
                            <button
                                onClick={auth.signOut || auth.onSignOut}
                                title={auth.email}
                                className={`p-2.5 rounded-xl transition-all active:scale-95 ${isLight ? 'bg-black/[0.04] text-black/40 hover:text-red-500' : 'bg-white/5 text-white/40 hover:text-red-500'}`}
                            >
                                <LogOut size={15} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Market scroller — full-bleed across the screen, under the menu */}
                <div className={`flex-none w-full overflow-hidden relative border-b ${isLight ? 'border-black/5' : 'border-white/5'}`}>
                    <GlobalTradeScroller theme={themeState} />
                </div>

            <main className="flex-1 overflow-y-auto no-scrollbar p-4 pb-32 md:pb-6 md:p-6 lg:p-8 lg:pb-6 z-10">

                {activeNav === 'overview' && (
                <div className="w-full flex flex-col gap-6 min-w-0">

                    {/* Headline ops metrics — ONE scrollable line on phones
                        (swipe to reveal Treasury / trades), grid on desktop.
                        Treasury + Total Trades live here too so the whole
                        platform health reads at a glance. */}
                    <div className="flex overflow-x-auto no-scrollbar snap-x snap-mandatory gap-4 md:grid md:grid-cols-3 lg:grid-cols-6 md:gap-6 md:overflow-visible">
                        {[
                            { label: 'Total Volume', value: `$${Number(stats.totalVolume || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, color: '#3CB371' },
                            { label: 'Revenue · Fees', value: `$${Number(stats.platformRevenue || 0).toLocaleString(undefined, { maximumFractionDigits: 4 })}`, color: '#3b82f6' },
                            { label: 'Users Live Now', value: String(stats.activeCount | 0), color: '#22c55e' },
                            { label: 'Active Stakes', value: `$${Number(stats.activeStakesTotal || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, color: '#f59e0b' },
                            { label: 'Treasury', value: Number(stats.treasuryBalance || 0).toFixed(2), color: '#3CB371', usdc: true },
                            { label: 'Total Trades', value: String(stats.totalTrades | 0), color: '#a78bfa' }
                        ].map((stat, i) => (
                            <div key={i} className="border-l-2 pl-3 min-w-0 flex-none w-[128px] snap-start md:w-auto md:flex-1" style={{ borderColor: `${stat.color}55` }}>
                                <div className="text-[7px] font-black uppercase tracking-[0.2em] opacity-40 truncate">{stat.label}</div>
                                <div className={`text-lg md:text-xl font-black tracking-tight tabular-nums leading-tight truncate flex items-center gap-1.5 ${isLight ? 'text-black' : 'text-white'}`}>
                                    {stat.value}
                                    {stat.usdc && <img src="/usdc.png" alt="USDC" className="w-[21px] h-[21px] flex-none" style={{ filter: isLight ? 'brightness(0) invert(0.55)' : 'brightness(0) invert(1)' }} />}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Trade index — trades sit directly under the metrics. The
                        counts/description block above the list is desktop-only;
                        phones go straight into the rows. */}
                    <div className="flex flex-col min-w-0">
                        {/* Desktop-only counts + feed description */}
                        <div className="mb-3 hidden lg:flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-4">
                                <div>
                                    <div className={`text-lg font-black tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>{String(recentActivity.length).padStart(2, '0')}</div>
                                    <div className="text-[8px] font-black uppercase tracking-widest opacity-40">Indexed in feed</div>
                                </div>
                                <div className={`h-8 w-px ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
                                <div>
                                    <div className={`text-lg font-black tracking-tighter text-[#1A6140]`}>{stats.totalTrades | 0}</div>
                                    <div className="text-[8px] font-black uppercase tracking-widest opacity-40">Lifetime total</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Clock size={12} className="opacity-40" />
                                <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Held while this page is open</span>
                            </div>
                        </div>

                        {/* Trade index is a REAL table on every screen: the column
                            headers sit right under the metrics, and phones swipe
                            horizontally (same gesture as the metrics strip) while
                            desktop fits every column at rest. Header + rows share
                            one min-width so they always stay aligned. */}
                        <div className="overflow-x-auto no-scrollbar">
                        <div className="min-w-[660px] flex flex-col">
                        {/* Column legend — headers for each data column */}
                        <div className={`grid grid-cols-[36px_minmax(0,1.3fr)_minmax(0,0.8fr)_64px_88px_92px_72px] gap-3 px-3 pb-2 text-[7px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>
                            <span>#</span><span>Trader</span><span>Market</span><span>Side</span><span>Amount</span><span>Result</span><span>Time</span>
                        </div>
                        <div className={`flex flex-col max-h-[600px] overflow-y-auto no-scrollbar divide-y ${isLight ? 'divide-black/5' : 'divide-white/5'}`}>
                            {recentActivity.length === 0 ? (
                                <div className="py-10 text-center opacity-20 text-[9px] font-black uppercase tracking-widest">
                                    No trades detected yet
                                </div>
                            ) : (
                                recentActivity.map((act, i) => (
                                    <motion.div
                                        initial={{ x: -16, opacity: 0 }}
                                        animate={{ x: 0, opacity: 1 }}
                                        key={act.id || `${act.timestamp}-${i}`}
                                        className={`px-3 py-2.5 grid grid-cols-[36px_minmax(0,1.3fr)_minmax(0,0.8fr)_64px_88px_92px_72px] items-center gap-3 min-w-0 transition-colors ${isLight ? 'hover:bg-black/[0.03]' : 'hover:bg-white/[0.03]'}`}
                                    >
                                        <span className="text-[9px] font-mono opacity-30">{String(i + 1).padStart(2, '0')}</span>
                                        {/* Trader column */}
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-8 h-8 rounded-xl overflow-hidden flex items-center justify-center flex-none ${act.direction === 'UP' ? 'bg-[#1A6140]/10 text-[#1A6140]' : 'bg-red-500/10 text-red-500'}`}>
                                                {userProfiles[(act.userAddr || act.owner || "").toLowerCase()]?.avatar ? (
                                                    <img
                                                        src={userProfiles[(act.userAddr || act.owner || "").toLowerCase()].avatar}
                                                        className="w-full h-full object-cover"
                                                        alt=""
                                                    />
                                                ) : (
                                                    <UserCheck size={13} />
                                                )}
                                            </div>
                                            <div className="text-[10px] font-black uppercase flex items-center gap-2 truncate min-w-0">
                                                {userProfiles[(act.userAddr || act.owner || "").toLowerCase()]?.username || `${(act.userAddr || act.owner || "0x").slice(0, 6)}…`}
                                                {act.type === 'TRADE_PLACED' && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse flex-none" />}
                                            </div>
                                        </div>
                                        {/* Market column */}
                                        <div className="flex flex-col min-w-0">
                                            <span className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black' : 'text-white'}`}>{act.symbol || '—'}</span>
                                            {act.entryPrice != null && (
                                                <span className="text-[7px] font-mono opacity-40 uppercase">entry {Number(act.entryPrice).toLocaleString(undefined, { maximumFractionDigits: 4 })}</span>
                                            )}
                                        </div>
                                        {/* Side column */}
                                        <div className={`flex items-center justify-center px-2 py-1 rounded-full text-[8px] font-black uppercase tracking-widest w-fit ${act.direction === 'UP' ? 'bg-[#1A6140]/10 text-[#1A6140]' : 'bg-red-500/10 text-red-500'}`}>
                                            {act.direction === 'UP' ? '▲ Up' : '▼ Down'}
                                        </div>
                                        {/* Amount column */}
                                        <div className={`block text-[11px] font-black font-mono ${isLight ? 'text-black' : 'text-white'}`}>${act.amount}</div>
                                        {/* Result column — the shared beam / verdict cell */}
                                        <div className="flex flex-col items-start gap-1 min-w-0">
                                            {act.pending && act.settleAt && !act.settled ? renderPendingFeedCell(act) : renderVerdictFeedCell(act)}
                                        </div>
                                        {/* Time column */}
                                        <div className="flex-none text-[8px] opacity-30 font-mono">{new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    </motion.div>
                                ))
                            )}
                        </div>
                        </div>{/* min-w table body (x-scrolled on phones) */}
                        </div>{/* — overflow-x: headers + rows swipe together */}
                    </div>
                </div>
                )}

                {/* ANALYTICS — big glowing route globe center; data panels and
                    charts hug it on the background */}
                {activeNav === 'analytics' && (
                <div className="w-full flex flex-col gap-6 min-w-0">

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-w-0 items-start">

                        {/* LEFT — HUD readouts (desktop side panel; on phones the
                            metrics sit in one line UNDER the globe instead) */}
                        <div className="hidden lg:flex lg:col-span-2 xl:col-span-3 lg:flex-col min-w-0 justify-between gap-4 xl:pr-2">
                            {platformStats.map((stat, i) => (
                                <div key={i} className="border-l-2 pl-3 min-w-0" style={{ borderColor: `${stat.color}55` }}>
                                    <div className="text-[7px] font-black uppercase tracking-[0.2em] opacity-40 truncate">{stat.label}</div>
                                    <div className={`text-lg xl:text-2xl font-black tracking-tight tabular-nums leading-tight truncate flex items-center gap-1.5 ${isLight ? 'text-black' : 'text-white'}`}>
                                        {stat.value}
                                        {stat.usdc && <img src="/usdc.png" alt="USDC" className="w-[21px] h-[21px] flex-none" style={{ filter: isLight ? 'brightness(0) invert(0.55)' : 'brightness(0) invert(1)' }} />}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* CENTER — the globe comes FIRST on phones, panels after it */}
                        <div className="order-first lg:order-none lg:col-span-8 xl:col-span-6 min-w-0">
                            <div className="relative w-full h-[320px] sm:h-[420px] xl:h-[540px]">
                                <RouteGlobe />
                            </div>
                            {/* MOBILE — one metrics line under the globe (the desktop
                                side panels are hidden below lg) */}
                            <div className="lg:hidden mt-3 flex items-stretch gap-3 overflow-x-auto no-scrollbar pb-1 -mx-1 px-1">
                                {[...platformStats, ...pulseStats].map((stat, i) => (
                                    <div key={i} className="border-l-2 pl-2.5 py-0.5 flex-none min-w-[84px]" style={{ borderColor: `${stat.color}55` }}>
                                        <div className="text-[6.5px] font-black uppercase tracking-[0.15em] opacity-40 whitespace-nowrap">{stat.label}</div>
                                        <div className={`text-sm font-black tracking-tight tabular-nums leading-tight whitespace-nowrap flex items-center gap-1.5 ${isLight ? 'text-black' : 'text-white'}`}>
                                            {stat.value}
                                            {stat.usdc && <img src="/usdc.png" alt="USDC" className="w-[15px] h-[15px] flex-none" style={{ filter: isLight ? 'brightness(0) invert(0.55)' : 'brightness(0) invert(1)' }} />}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* RIGHT — HUD readouts (desktop side panel) */}
                        <div className="hidden lg:flex lg:col-span-2 xl:col-span-3 lg:flex-col min-w-0 justify-between gap-4 xl:pl-2">
                            {pulseStats.map((stat, i) => (
                                <div key={i} className="border-l-2 pl-3 min-w-0" style={{ borderColor: `${stat.color}55` }}>
                                    <div className="text-[7px] font-black uppercase tracking-[0.2em] opacity-40 truncate">{stat.label}</div>
                                    <div className={`text-lg xl:text-2xl font-black tracking-tight tabular-nums leading-tight truncate ${isLight ? 'text-black' : 'text-white'}`}>{stat.value}</div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Users by country — indexed rows under the map, plain on the background */}
                    <div className="flex flex-col min-w-0">
                        <div className="text-[9px] font-black uppercase tracking-[0.25em] opacity-40 mb-1 px-1">Users by country</div>
                        {Object.entries(stats.userCountries || {}).length === 0 ? (
                            <p className="text-[9px] font-black uppercase tracking-widest opacity-30 py-2.5">No user location data yet</p>
                        ) : Object.entries(stats.userCountries || {}).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([iso, count], i) => (
                            <div key={iso} className={`flex items-center justify-between gap-4 py-2.5 ${i > 0 ? (isLight ? 'border-t border-black/5' : 'border-t border-white/5') : ''}`}>
                                <div className="flex items-center gap-3">
                                    <span className={`w-8 py-1 rounded-lg text-[8px] font-black uppercase flex items-center justify-center ${isLight ? 'bg-[#1A6140]/10 text-[#1A6140]' : 'bg-[#1A6140]/15 text-[#3CB371]'}`}>{iso}</span>
                                    <span className="text-[9px] font-black uppercase tracking-widest opacity-50">Users</span>
                                </div>
                                <span className="text-sm font-black text-[#3CB371] whitespace-nowrap">{count}</span>
                            </div>
                        ))}
                    </div>
                </div>
                )}

                {/* SECURITY — everything in one section, two internal tabs,
                    fills the screen: no page scroll */}
                {activeNav === 'security' && (canSettings || isRoot) && (
                    <div className="w-full flex flex-col min-w-0 flex-1">
                        {/* header + tab switch, boxless like the other sections */}
                        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                            <p className={`text-[8px] font-black uppercase tracking-widest opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>
                                Identity: Supabase Auth · permissions are granular · protocols propagate live
                            </p>
                            <div className={`flex items-center gap-1 p-1 rounded-2xl border ${isLight ? 'bg-black/[0.03] border-black/10' : 'bg-white/5 border-white/5'}`}>
                                {isRoot && (
                                    <button
                                        onClick={() => selectSecTab('team')}
                                        className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${secTab === 'team' ? 'bg-[#1A6140] text-white shadow' : 'opacity-40 hover:opacity-70'}`}
                                    >
                                        Admins &amp; Moderators
                                    </button>
                                )}
                                {canSettings && (
                                    <button
                                        onClick={() => selectSecTab('protocols')}
                                        className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${secTab === 'protocols' ? 'bg-[#1A6140] text-white shadow' : 'opacity-40 hover:opacity-70'}`}
                                    >
                                        Security Protocols
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* TAB — ADMINS & MODERATORS (root only) */}
                        {secTab === 'team' && isRoot && (
                        <div className="flex flex-col gap-3 min-h-0 flex-1">
                            <div className="flex items-center justify-end">
                                <button
                                    onClick={() => setShowCreateAdmin(v => !v)}
                                    className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${showCreateAdmin ? 'bg-white/5 border border-white/10 text-white/60' : 'bg-[#1A6140] text-white hover:brightness-110'}`}
                                >
                                    {showCreateAdmin ? 'Close form' : '+ New admin / mod'}
                                </button>
                            </div>

                            {showCreateAdmin && (
                                <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-3 border-l-2 border-[#1A6140]/50 pl-3 py-1">
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        <input
                                            value={newAdmin.email}
                                            onChange={e => setNewAdmin(prev => ({ ...prev, email: e.target.value }))}
                                            placeholder="email"
                                            className={`px-4 py-2.5 rounded-2xl border text-[11px] font-black outline-none transition-all ${isLight ? 'bg-white border-black/10 focus:border-[#1A6140] text-black' : 'bg-black/40 border-white/10 focus:border-[#1A6140] text-white'}`}
                                        />
                                        <input
                                            type="password"
                                            value={newAdmin.password}
                                            onChange={e => setNewAdmin(prev => ({ ...prev, password: e.target.value }))}
                                            placeholder="temp password (8+, Aa1!)"
                                            className={`px-4 py-2.5 rounded-2xl border text-[11px] font-black outline-none transition-all ${isLight ? 'bg-white border-black/10 focus:border-[#1A6140] text-black' : 'bg-black/40 border-white/10 focus:border-[#1A6140] text-white'}`}
                                        />
                                        <div className="flex gap-2">
                                            {[['admin', 'Admin'], ['moderator', 'Moderator']].map(([r, l]) => (
                                                <button
                                                    key={r}
                                                    onClick={() => setNewAdmin(prev => ({ ...prev, role: r, permissions: ROLE_PRESETS[r] }))}
                                                    className={`flex-1 py-2.5 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all ${newAdmin.role === r ? 'bg-[#1A6140] text-white border-[#1A6140]' : isLight ? 'bg-white border-black/10 text-black/40' : 'bg-white/5 border-white/10 text-white/40'}`}
                                                >
                                                    {l}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {GRANTABLE_PERMS.map(p => {
                                            const active = newAdmin.permissions.includes(p.tag);
                                            return (
                                                <button
                                                    key={p.tag}
                                                    onClick={() => setNewAdmin(prev => ({
                                                        ...prev,
                                                        permissions: active ? prev.permissions.filter(x => x !== p.tag) : [...prev.permissions, p.tag]
                                                    }))}
                                                    className={`px-3 py-2 rounded-xl border text-[8px] font-black uppercase tracking-widest transition-all ${active ? 'bg-[#1A6140]/15 text-[#1A6140] border-[#1A6140]/40' : isLight ? 'bg-white border-black/10 text-black/30' : 'bg-white/5 border-white/10 text-white/30'}`}
                                                >
                                                    {active && <Check size={9} className="inline mr-1" />} {p.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <button
                                        onClick={createAdmin}
                                        disabled={createAdminBusy || !newAdmin.email.trim() || !/^.{8,}$/.test(newAdmin.password) || !(/[a-z]/.test(newAdmin.password) && /[A-Z]/.test(newAdmin.password) && /[0-9]/.test(newAdmin.password) && /[^a-zA-Z0-9]/.test(newAdmin.password))}
                                        className="w-full py-3 rounded-2xl bg-[#1A6140] text-white text-[9px] font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40"
                                    >
                                        {createAdminBusy ? 'Creating…' : 'Create account'}
                                    </button>
                                    <div className="text-[8px] font-medium opacity-40 -mt-1">
                                        Supabase policy: password needs 8+ chars incl. lower &amp; upper case, a digit and a special character.
                                    </div>
                                </motion.div>
                            )}

                            <div className={`flex flex-col flex-1 min-h-0 overflow-y-auto no-scrollbar divide-y ${isLight ? 'divide-black/5' : 'divide-white/5'}`}>
                                {rosterBusy && adminRoster.length === 0 ? (
                                    <div className="py-8 text-center opacity-20 text-[9px] font-black uppercase tracking-widest">Loading roster…</div>
                                ) : adminRoster.length === 0 ? (
                                    <div className="py-8 text-center opacity-20 text-[9px] font-black uppercase tracking-widest">No admins found</div>
                                ) : adminRoster.map(row => {
                                    const isRootRow = row.role === 'root';
                                    return (
                                        <div key={row.id} className={`py-2.5 flex flex-col md:flex-row md:items-center justify-between gap-2 ${isLight ? 'hover:bg-black/[0.03]' : 'hover:bg-white/[0.05]'}`}>
                                            <div className="min-w-0">
                                                <div className={`text-[10px] font-black uppercase flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}>
                                                    {row.email}
                                                    {isRootRow ? (
                                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 text-[7px] font-black uppercase tracking-widest">Root</span>
                                                    ) : (
                                                        <span className={`px-2 py-0.5 rounded-full border text-[7px] font-black uppercase tracking-widest ${row.role === 'admin' ? 'bg-[#1A6140]/10 text-[#1A6140] border-[#1A6140]/30' : 'bg-blue-500/10 text-blue-400 border-blue-500/30'}`}>{row.role}</span>
                                                    )}
                                                    {row.suspended && (
                                                        <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/30 text-[7px] font-black uppercase tracking-widest">Suspended</span>
                                                    )}
                                                </div>
                                                <div className={`text-[8px] font-bold uppercase font-mono opacity-40 mt-0.5 ${isLight ? 'text-black' : 'text-white'}`}>
                                                    {(row.permissions || []).includes('*') ? 'All permissions' : (row.permissions || []).map(p => GRANTABLE_PERMS.find(g => g.tag === p)?.label || p).join(' · ') || '—'}
                                                </div>
                                            </div>
                                            {!isRootRow ? (
                                                <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                                    {GRANTABLE_PERMS.map(p => {
                                                        const active = (row.permissions || []).includes(p.tag);
                                                        return (
                                                            <button
                                                                key={p.tag}
                                                                onClick={() => setAdminPermission(row, p.tag)}
                                                                title={p.label}
                                                                className={`px-2 py-1.5 rounded-lg border text-[7px] font-black uppercase tracking-wide transition-all ${active ? 'bg-[#1A6140]/15 text-[#1A6140] border-[#1A6140]/40' : isLight ? 'bg-black/[0.03] border-black/10 text-black/25 hover:text-black/50' : 'bg-white/5 border-white/10 text-white/25 hover:text-white/50'}`}
                                                            >
                                                                {active && <Check size={8} className="inline mr-0.5" />} {p.tag.split('.')[1]}
                                                            </button>
                                                        );
                                                    })}
                                                    <button
                                                        onClick={() => setAdminRole(row, row.role === 'admin' ? 'moderator' : 'admin')}
                                                        className={`px-2.5 py-1.5 rounded-lg border text-[7px] font-black uppercase tracking-widest transition-all ${isLight ? 'bg-black/[0.03] border-black/10 text-black/40' : 'bg-white/5 border-white/10 text-white/40'}`}
                                                    >
                                                        {row.role === 'admin' ? '→ Mod' : '→ Admin'}
                                                    </button>
                                                    <button
                                                        onClick={() => setAdminSuspension(row, !row.suspended)}
                                                        className={`px-2.5 py-1.5 rounded-lg border text-[7px] font-black uppercase tracking-widest transition-all ${row.suspended ? 'bg-[#1A6140] text-white border-[#1A6140]' : 'bg-red-500/10 text-red-500 border-red-500/30 hover:bg-red-500/20'}`}
                                                    >
                                                        {row.suspended ? 'Unsuspend' : 'Suspend'}
                                                    </button>
                                                    <button
                                                        onClick={() => removeAdmin(row)}
                                                        className="px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-500 border border-red-500/30 text-[7px] font-black uppercase tracking-widest hover:bg-red-500/20 transition-all"
                                                    >
                                                        Remove
                                                    </button>
                                                </div>
                                            ) : (
                                                <span className={`shrink-0 text-[8px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Locked</span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            <p className={`text-[8px] font-bold ${isLight ? 'text-black/30' : 'text-white/30'}`}>
                                Permission toggles apply instantly. Removing an admin deletes their Supabase Auth account. Passwords are managed by Supabase Auth.
                            </p>
                        </div>
                        )}

                        {/* TAB — SECURITY PROTOCOLS */}
                        {secTab === 'protocols' && canSettings && (
                        <div className={`flex flex-col min-w-0 divide-y ${isLight ? 'divide-black/5' : 'divide-white/5'}`}>
                            {/* Maintenance row */}
                            <div className="py-4 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4 min-w-0">
                                    <Settings size={18} className={`flex-none ${platformSettings.maintenanceMode ? 'text-[#1A6140]' : 'opacity-30'} ${platformSettings.maintenanceMode ? 'animate-spin-slow' : ''}`} />
                                    <div className="min-w-0">
                                        <h4 className={`text-[11px] font-black uppercase flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}>
                                            Maintenance Mode
                                            {platformSettings.maintenanceMode && <span className="px-2 py-0.5 rounded-full bg-[#1A6140]/10 text-[#1A6140] border border-[#1A6140]/30 text-[7px] font-black uppercase tracking-widest">Active</span>}
                                        </h4>
                                        <p className="text-[9px] opacity-40 font-medium mt-0.5">Full system lock — redirects all users to the maintenance screen. Prevents any interactions with the protocol.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => updateSettings({ maintenanceMode: !platformSettings.maintenanceMode })}
                                    className={`w-14 h-8 rounded-full relative p-1 flex-none transition-all ${platformSettings.maintenanceMode ? 'bg-[#1A6140]' : isLight ? 'bg-black/20' : 'bg-white/10'}`}
                                >
                                    <motion.div
                                        animate={{ x: platformSettings.maintenanceMode ? 24 : 0 }}
                                        className="w-6 h-6 rounded-full bg-white shadow-lg"
                                    />
                                </button>
                            </div>

                            {/* Trading Halted row */}
                            <div className="py-4 flex items-center justify-between gap-4">
                                <div className="flex items-center gap-4 min-w-0">
                                    <Lock size={18} className={`flex-none ${platformSettings.tradingHalted ? 'text-red-500' : 'opacity-30'}`} />
                                    <div className="min-w-0">
                                        <h4 className={`text-[11px] font-black uppercase flex items-center gap-2 ${isLight ? 'text-black' : 'text-white'}`}>
                                            Trading Halted
                                            {platformSettings.tradingHalted && <span className="px-2 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/30 text-[7px] font-black uppercase tracking-widest">Frozen</span>}
                                        </h4>
                                        <p className="text-[9px] opacity-40 font-medium mt-0.5">Kill switch — freezes all trading execution. Users can browse but cannot place bets.</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => updateSettings({ tradingHalted: !platformSettings.tradingHalted })}
                                    className={`w-14 h-8 rounded-full relative p-1 flex-none transition-all ${platformSettings.tradingHalted ? 'bg-red-500' : isLight ? 'bg-black/20' : 'bg-white/10'}`}
                                >
                                    <motion.div
                                        animate={{ x: platformSettings.tradingHalted ? 24 : 0 }}
                                        className="w-6 h-6 rounded-full bg-white shadow-lg"
                                    />
                                </button>
                            </div>

                            {/* Admin authority note — plain on the background */}
                            <div className="py-4 flex items-center gap-4">
                                <AlertTriangle size={20} className="text-amber-500 flex-none" />
                                <p className="text-[9px] font-medium opacity-50">
                                    <span className="text-amber-500 font-black uppercase tracking-widest mr-2">Admin authority</span>
                                    Changes propagate globally in real-time. Ensure node synchronization before proceeding with major maintenance windows.
                                </p>
                            </div>
                        </div>
                        )}
                    </div>
                )}

                {/* SIEM — security information & event management. Watchers on
                    every admin/referral call classify brute force, privilege
                    tampering and request floods; events stream live to this
                    feed with severity coding. */}
                {activeNav === 'siem' && (
                    <div className="w-full flex flex-col gap-6 min-w-0">

                        {siemSummary && (
                            <div className="flex overflow-x-auto no-scrollbar gap-3 md:grid md:grid-cols-4 md:gap-6 md:overflow-visible">
                                {[
                                    { label: 'Security events · 24h', value: String(siemSummary.total24h | 0), color: '#a78bfa' },
                                    { label: 'Brute force', value: String(siemSummary.bruteforce | 0), color: '#ef4444' },
                                    { label: 'Tamper attempts', value: String((siemSummary.tamper | 0) + (siemSummary.authFailures | 0)), color: '#f59e0b' },
                                    { label: 'Request floods', value: String(siemSummary.rateAbuse | 0), color: '#3b82f6' }
                                ].map((stat, i) => (
                                    <div key={i} className="border-l-2 pl-3 min-w-0 flex-none w-[128px] snap-start md:w-auto md:flex-1" style={{ borderColor: `${stat.color}55` }}>
                                        <div className="text-[7px] font-black uppercase tracking-[0.2em] opacity-40 truncate">{stat.label}</div>
                                        <div className={`text-lg md:text-xl font-black tracking-tight tabular-nums leading-tight truncate ${isLight ? 'text-black' : 'text-white'}`}>{stat.value}</div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Feed head */}
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center">
                                    <Radar size={15} />
                                </div>
                                <div>
                                    <div className={`text-lg font-black tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Threat Feed</div>
                                    <div className="text-[8px] font-black uppercase tracking-widest opacity-40">
                                        {siemSummary && siemSummary.lastEventAt ? `Last event ${Math.max(0, Math.round((Date.now() - siemSummary.lastEventAt) / 1000))}s ago` : 'Watching admin surface'}
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={fetchSiem}
                                    className={`px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border transition-colors ${isLight ? 'border-black/15 hover:bg-black/5' : 'border-white/15 hover:bg-white/5'}`}
                                >
                                    <span className="inline-flex items-center gap-2"><RefreshCw size={11} className={siemBusy ? 'animate-spin' : ''} /> Refresh</span>
                                </button>
                                {auth?.isRoot && (
                                    <button
                                        onClick={clearSiem}
                                        className="px-3 py-1.5 rounded-lg text-[8px] font-black uppercase tracking-widest border border-red-500/30 text-red-500 hover:bg-red-500/10"
                                    >
                                        Clear log
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Event feed — plain rows, no boxes */}
                        <div className={`flex flex-col min-w-0 max-h-[520px] overflow-y-auto no-scrollbar border-y ${isLight ? 'border-black/5' : 'border-white/10'}`}>
                            {siemEvents.length === 0 && (
                                <div className="py-6 px-2 text-center text-[9px] font-medium opacity-40">
                                    No security events recorded. Authentication, tamper and rate watchers are live on every admin &amp; referral call.
                                </div>
                            )}
                            {siemEvents.map((ev, i) => {
                                const sevColors = { critical: '#ef4444', high: '#f97316', medium: '#f59e0b', info: '#3b82f6' };
                                const sev = sevColors[ev.severity] || '#6b7280';
                                const typeLabels = { AUTH_FAILURE: 'Auth failure', AUTH_BRUTEFORCE: 'Brute force', ADMIN_TAMPER: 'Admin tamper', RATE_ABUSE: 'Rate abuse' };
                                return (
                                    <div key={ev.id || i} className={`flex items-start gap-3 px-2 lg:px-3 py-2.5 border-b last:border-b-0 ${isLight ? 'border-black/5' : 'border-white/5'}`}>
                                        <div className="w-1.5 h-1.5 rounded-full flex-none mt-1.5" style={{ backgroundColor: sev }} />
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: sev }}>{typeLabels[ev.type] || ev.type}</span>
                                                <span className="text-[8px] font-mono opacity-30 uppercase">{ev.ip}</span>
                                            </div>
                                            <div className={`text-[10px] font-medium mt-0.5 ${isLight ? 'text-black/70' : 'text-white/70'}`}>{ev.message}</div>
                                        </div>
                                        <div className="flex-none text-[8px] opacity-30 font-mono">{new Date(ev.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* BROADCAST — directly on the background: one screen, no scroll,
                    message + persistence + transmit; current transmission in the head */}
                {activeNav === 'broadcast' && canBroadcast && (
                    <div className="w-full flex flex-col min-w-0">
                        <div className="mb-2 flex items-center justify-between gap-3 flex-wrap">
                            <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Broadcast</span>
                            <span className={`text-[8px] font-black uppercase tracking-widest opacity-30 truncate ${isLight ? 'text-black' : 'text-white'}`}>
                                Live — {(broadcastList.find(b => b.status === 'LIVE')?.message) || platformSettings.systemBanner || "No active manual broadcast. Platform running standard tickers."}
                            </span>
                        </div>

                        <textarea
                            value={broadcastText}
                            onChange={(e) => setBroadcastText(e.target.value)}
                            placeholder="Enter system broadcast message…"
                            className={`w-full h-24 md:h-28 p-4 rounded-2xl border text-sm font-bold resize-none overflow-hidden transition-all outline-none ${isLight ? 'bg-white border-black/10 focus:border-[#1A6140] text-black' : 'bg-black/40 border-white/10 focus:border-[#1A6140] text-white'}`}
                        />

                        <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className={`text-[8px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>Persistence</span>
                                {[1, 10, 60].map(m => (
                                    <button
                                        key={m}
                                        onClick={() => setBroadcastDuration(m * 60)}
                                        className={`px-4 py-2.5 rounded-xl border text-[10px] font-black transition-all ${broadcastDuration === m * 60 ? 'bg-[#1A6140] text-white border-[#1A6140]' : isLight ? 'bg-white border-black/10 text-black opacity-50 hover:opacity-100' : 'bg-white/5 border-white/5 text-white opacity-50 hover:opacity-100'}`}
                                    >
                                        {m}m
                                    </button>
                                ))}
                            </div>
                            <button
                                onClick={handleUpdateBroadcast}
                                disabled={isSaving || !broadcastText}
                                className="flex items-center justify-center gap-3 py-3 px-6 bg-[#1A6140] text-white rounded-2xl font-black uppercase tracking-[0.25em] text-[10px] shadow-[0_16px_32px_-10px_rgba(26,97,64,0.3)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40"
                            >
                                <Radio size={14} />
                                <span>{isSaving ? 'Transmitting…' : 'Transmit Broadcast'}</span>
                            </button>
                        </div>

                        {/* ── Broadcast ledger — every transmission listed with
                            its own flip-clock countdown, editable and
                            withdrawable while live ───────────────────────── */}
                        <div className="mt-7 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                                <Megaphone size={13} className={isLight ? 'text-black/50' : 'text-white/50'} />
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Broadcast log</span>
                            </div>
                            <span className={`text-[8px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>
                                {broadcastList.filter(b => b.status === 'LIVE').length} live · {broadcastList.length} total
                            </span>
                        </div>

                        <div className="mt-2 flex flex-col gap-2">
                            {broadcastLoading && !broadcastList.length && (
                                <div className={`p-4 text-[10px] font-black uppercase tracking-widest opacity-30 animate-pulse ${isLight ? 'text-black' : 'text-white'}`}>
                                    Reading billboards…
                                </div>
                            )}
                            {!broadcastLoading && !broadcastList.length && (
                                <div className={`p-4 text-[10px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>
                                    No transmissions yet — send one and it will appear here with its countdown.
                                </div>
                            )}
                            {broadcastList.map(b => {
                                const remain = b.status === 'LIVE' ? Math.max(0, Math.ceil((b.expiry - Date.now()) / 1000)) : 0;
                                const isEditing = editingBroadcastId === String(b.id);
                                const busy = busyBroadcastId === String(b.id);
                                const statusChip = b.status === 'LIVE'
                                    ? { label: '● Live', cls: 'text-[#1A6140] bg-[#1A6140]/15' }
                                    : b.status === 'WITHDRAWN'
                                        ? { label: '✕ Withdrawn', cls: 'text-red-500 bg-red-500/10' }
                                        : { label: 'Expired', cls: 'opacity-40 bg-black/5' };
                                return (
                                    <div
                                        key={b.id}
                                        className={`flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${isLight
                                            ? (b.status === 'LIVE' ? 'bg-white border-[#1A6140]/25 shadow-[0_8px_20px_-12px_rgba(26,97,64,0.25)]' : 'bg-white/60 border-black/10 opacity-70')
                                            : (b.status === 'LIVE' ? 'bg-[#1A6140]/[0.07] border-[#1A6140]/30' : 'bg-white/[0.03] border-white/5 opacity-60')}`}
                                    >
                                        {/* message block */}
                                        <div className="flex-1 min-w-0">
                                            {isEditing ? (
                                                <div className="flex flex-col gap-2">
                                                    <textarea
                                                        autoFocus
                                                        value={editBroadcastDraft}
                                                        onChange={(e) => setEditBroadcastDraft(e.target.value)}
                                                        className={`w-full h-16 p-2.5 rounded-xl border text-xs font-bold resize-none outline-none ${isLight ? 'bg-white border-black/10 focus:border-[#1A6140] text-black' : 'bg-black/40 border-white/10 focus:border-[#1A6140] text-white'}`}
                                                    />
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => handleSaveBroadcastEdit(b.id)}
                                                            disabled={busy}
                                                            className="px-4 py-1.5 rounded-lg bg-[#1A6140] text-white text-[9px] font-black uppercase tracking-widest disabled:opacity-40"
                                                        >Save & re-emit</button>
                                                        <button
                                                            onClick={() => { setEditingBroadcastId(null); setEditBroadcastDraft(""); }}
                                                            className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest ${isLight ? 'border-black/10 text-black/50' : 'border-white/10 text-white/50'}`}
                                                        >Cancel</button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <p className={`text-xs font-bold truncate ${b.status === 'WITHDRAWN' ? 'line-through' : ''} ${isLight ? 'text-black' : 'text-white'}`}>
                                                        {b.message || b.text}
                                                    </p>
                                                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                                                        <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${statusChip.cls}`}>{statusChip.label}</span>
                                                        <span className={`text-[8px] font-black uppercase tracking-widest opacity-30 ${isLight ? 'text-black' : 'text-white'}`}>
                                                            {b.type} · {new Date(b.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                                            {b.editedAt ? ' · edited' : ''}
                                                        </span>
                                                    </div>
                                                </>
                                            )}
                                        </div>

                                        {/* countdown — flips while live */}
                                        {b.status === 'LIVE' && !isEditing && (
                                            <FlipBroadcastClock seconds={remain} />
                                        )}

                                        {/* actions */}
                                        {!isEditing && b.status === 'LIVE' && (
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                <button
                                                    title="Edit message"
                                                    onClick={() => { setEditingBroadcastId(String(b.id)); setEditBroadcastDraft(b.message || b.text || ""); }}
                                                    className={`p-2 rounded-xl border transition-all hover:scale-105 ${isLight ? 'border-black/10 hover:bg-black/5 text-black/60' : 'border-white/10 hover:bg-white/10 text-white/60'}`}
                                                >
                                                    <Pencil size={13} />
                                                </button>
                                                <button
                                                    title="Withdraw broadcast (clears the user banner now)"
                                                    onClick={() => handleWithdrawBroadcast(b.id)}
                                                    disabled={busy}
                                                    className="p-2 rounded-xl border border-red-500/25 text-red-500/80 hover:bg-red-500/10 hover:scale-105 transition-all disabled:opacity-40"
                                                >
                                                    <Undo2 size={13} />
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Referral Program — tabs: participants (earnings), withdrawal queue, suspensions */}
                {activeNav === 'referrals' && (
                    <div className="w-full flex items-center gap-2 mb-6 overflow-x-auto no-scrollbar">
                        {[['participants', 'Participants'], ['withdrawals', 'Withdrawal Requests'], ['suspended', 'Suspensions']].map(([k, l]) => (
                            <button
                                key={k}
                                onClick={() => setWdSection(k)}
                                className={`px-4 md:px-5 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all flex items-center gap-2 ${wdSection === k ? 'bg-[#1A6140] text-white border-[#1A6140] shadow-lg shadow-[#1A6140]/20' : isLight ? 'bg-white/60 border-black/10 text-black/50 hover:text-black' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
                            >
                                {l}
                                {k === 'withdrawals' && refWithdrawals.filter(w => w.status === 'pending').length > 0 && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-[8px] font-black leading-none ${wdSection === k ? 'bg-white/20 text-white' : 'bg-red-500/15 text-red-500'}`}>
                                        {refWithdrawals.filter(w => w.status === 'pending').length}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                )}

                {/* Withdrawal Requests — plain indexed list on the background
                    (like participants/trades): approve pays out, cancel emails */}
                {activeNav === 'referrals' && wdSection === 'withdrawals' && (
                    <div className="w-full flex flex-col min-w-0">
                        <div className="mb-2 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-4 min-w-0">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Withdrawal requests</span>
                                <span className={`text-[8px] font-black uppercase tracking-widest ${refWithdrawals.some(w => w.status === 'pending') ? 'text-amber-500' : 'opacity-30'}`}>
                                    {refWithdrawals.length} total · {refWithdrawals.filter(w => w.status === 'pending').length} pending
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                                    {[['all', 'All'], ['pending', 'Pending'], ['paid', 'Approved'], ['rejected', 'Cancelled']].map(([k, l]) => (
                                        <button
                                            key={k}
                                            onClick={() => setWdFilter(k)}
                                            className={`px-3 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${wdFilter === k ? 'bg-[#1A6140] text-white border-[#1A6140]' : isLight ? 'bg-white border-black/10 text-black/40' : 'bg-white/5 border-white/10 text-white/40'}`}
                                        >
                                            {l}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={fetchRefWithdrawals} className={`p-2.5 rounded-xl transition-all shrink-0 ${isLight ? 'bg-[#1A6140]/10 text-[#1A6140] hover:bg-[#1A6140]/20' : 'bg-[#1A6140]/15 text-[#3CB371] hover:bg-[#1A6140]/25'}`}>
                                    <RefreshCw size={13} />
                                </button>
                            </div>
                        </div>

                        <div className={`flex flex-col max-h-[600px] overflow-y-auto no-scrollbar divide-y ${isLight ? 'divide-black/5' : 'divide-white/5'}`}>
                            {(wdFilter === 'all' ? refWithdrawals : refWithdrawals.filter(w => w.status === wdFilter)).length === 0 ? (
                                <div className="py-8 text-center opacity-20 text-[9px] font-black uppercase tracking-widest">
                                    No withdrawal requests
                                </div>
                            ) : (wdFilter === 'all' ? refWithdrawals : refWithdrawals.filter(w => w.status === wdFilter)).map(w => (
                                <motion.div
                                    key={w.id}
                                    initial={{ opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className={`px-1 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${isLight ? 'hover:bg-black/[0.02]' : 'hover:bg-white/[0.02]'}`}
                                >
                                        <div className="min-w-0">
                                            <div className={`text-[10px] font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>
                                                {w.username ? `@${w.username}` : `${(w.user_address || '').slice(0, 6)}…${(w.user_address || '').slice(-4)}`}
                                            </div>
                                            <div className={`text-[8px] opacity-40 font-bold uppercase font-mono break-all ${isLight ? 'text-black' : 'text-white'}`}>
                                                ${(Number(w.amount) || 0).toFixed(2)} · {(w.chain || 'Arc').toUpperCase()} → {w.destination_address || 'no destination on file'}
                                            </div>
                                            <div className={`text-[8px] opacity-30 font-mono ${isLight ? 'text-black' : 'text-white'}`}>
                                                {w.requested_at ? `Requested ${new Date(w.requested_at).toLocaleString()}` : ''}{w.processed_at ? ` · Processed ${new Date(w.processed_at).toLocaleString()}` : ''}
                                            </div>
                                            {w.admin_note && (
                                                <div className="text-[8px] font-bold text-red-400 mt-1">Note: {w.admin_note}</div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {w.status === 'pending' && w.hasEmail === false && (
                                                <span className="hidden md:flex items-center gap-1 text-[8px] font-black uppercase tracking-widest text-amber-500" title="No email on file — the automatic notice cannot be delivered">
                                                    <Mail size={11} /> No email
                                                </span>
                                            )}
                                            {w.status === 'pending' ? (
                                                <>
                                                    <button
                                                        onClick={() => setRefWithdrawalStatus(w.id, 'paid')}
                                                        disabled={processingId === w.id}
                                                        className="px-3 py-2 rounded-xl bg-[#1A6140] text-white text-[8px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                                                    >
                                                        {processingId === w.id ? '…' : 'Approve'}
                                                    </button>
                                                    <button
                                                        onClick={() => { setCancelFor(w.id); setCancelNote(''); }}
                                                        disabled={processingId === w.id}
                                                        className="px-3 py-2 rounded-xl bg-red-500/10 text-red-500 text-[8px] font-black uppercase tracking-widest hover:bg-red-500/20 active:scale-95 transition-all disabled:opacity-50"
                                                    >
                                                        Cancel
                                                    </button>
                                                </>
                                            ) : (
                                                <span className={`shrink-0 px-3 py-1.5 rounded-full border text-[8px] font-black uppercase tracking-widest ${w.status === 'paid' ? 'bg-[#1A6140]/10 text-[#1A6140] border-[#1A6140]/30' : 'bg-red-500/10 text-red-500 border-red-500/30'}`}>
                                                    {w.status === 'paid' ? 'Approved' : 'Cancelled'}
                                                </span>
                                            )}
                                        </div>
                                    </motion.div>
                                ))}
                        </div>
                        <p className={`text-[8px] font-bold opacity-30 uppercase tracking-wide mt-1 ${isLight ? 'text-black' : 'text-white'}`}>
                            Approving marks the request paid and emails the user. Cancelling releases the hold back to their commission balance and emails them with the reason.
                        </p>
                    </div>
                )}

                {/* Participants tab — every program participant, their earnings,
                    and per-user management (suspend · rate · slash) on expand */}
                {/* Participants — plain indexed list on the background (like the
                    trade feed): rows, hairlines, earnings inline. */}
                {activeNav === 'referrals' && wdSection === 'participants' && (
                    <div className="w-full flex flex-col min-w-0">
                        <div className="mb-2 flex items-center justify-between gap-3 flex-wrap">
                            <div className="flex items-center gap-4 min-w-0">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">Program participants</span>
                                <span className="text-[8px] font-black uppercase tracking-widest opacity-30">
                                    {refUsers.length} enrolled{refUsers.filter(u => u.suspended).length > 0 ? ` · ${refUsers.filter(u => u.suspended).length} suspended` : ''}
                                </span>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="relative w-52 md:w-64 min-w-0">
                                    <Search size={13} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isLight ? 'text-black/30' : 'text-white/30'}`} />
                                    <input
                                        value={refUsersQ}
                                        onChange={e => setRefUsersQ(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') fetchRefUsers(); }}
                                        placeholder="Search username or address…"
                                        className={`w-full pl-10 pr-3 py-2.5 rounded-xl border text-[10px] font-bold outline-none transition-all ${isLight ? 'bg-white border-black/10 focus:border-[#1A6140] text-black' : 'bg-black/40 border-white/10 focus:border-[#1A6140] text-white'}`}
                                    />
                                </div>
                                <button onClick={() => fetchRefUsers()} className={`p-2.5 rounded-xl transition-all shrink-0 ${isLight ? 'bg-[#1A6140]/10 text-[#1A6140] hover:bg-[#1A6140]/20' : 'bg-[#1A6140]/15 text-[#3CB371] hover:bg-[#1A6140]/25'}`}>
                                    <RefreshCw size={13} />
                                </button>
                            </div>
                        </div>
                        {refUsersError && (
                            <p className="text-[9px] font-black uppercase tracking-widest text-amber-500 py-2">{refUsersError}</p>
                        )}

                            <div className={`flex flex-col max-h-[620px] overflow-y-auto no-scrollbar divide-y ${isLight ? 'divide-black/5' : 'divide-white/5'}`}>
                                {refUsers.length === 0 ? (
                                    <div className="py-8 text-center opacity-20 text-[9px] font-black uppercase tracking-widest">
                                        No enrolled users found
                                    </div>
                                ) : refUsers.map(u => {
                                    const open = openRefUser === u.address;
                                    const cache = refStatCache[u.address];
                                    const rateVal = rateDrafts[u.address] ?? (u.rateOverride != null ? String(u.rateOverride) : '');
                                    const slashVal = slashDrafts[u.address] || '';
                                    const busyKey = (ep) => refActionBusy === `${ep}:${u.address}`;
                                    return (
                                        <div key={u.address} className={`px-1 py-3 transition-colors ${isLight ? 'hover:bg-black/[0.02]' : 'hover:bg-white/[0.02]'}`}>
                                            <button onClick={() => toggleRefUser(u.address)} className="w-full flex items-center justify-between gap-3 p-4 text-left">
                                                <div className="min-w-0">
                                                    <div className={`text-[10px] font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>
                                                        {u.username ? `@${u.username}` : `${(u.address || '').slice(0, 6)}…${(u.address || '').slice(-4)}`}
                                                    </div>
                                                    <div className={`text-[8px] font-bold uppercase font-mono ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                                                        {u.referralCode ? `Code ${u.referralCode}` : 'No code'} · By {u.referredBy ? `${(u.referredBy || '').slice(0, 6)}…` : '—'}{u.enrolledAt ? ` · ${new Date(u.enrolledAt).toLocaleDateString()}` : ''}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    {(() => {
                                                        const c = cache;
                                                        return (
                                                            <div className="hidden md:flex items-center gap-4 pr-1">
                                                                <div className="text-right">
                                                                    <div className={`text-[9px] font-black tracking-tight ${isLight ? 'text-black' : 'text-white'}`}>
                                                                        {c && c !== 'loading' ? `$${Number(c.stats?.totalCommission || 0).toFixed(2)}` : '…'}
                                                                    </div>
                                                                    <div className="text-[7px] font-black uppercase tracking-widest opacity-30">Earned</div>
                                                                </div>
                                                                <div className="text-right">
                                                                    <div className={`text-[9px] font-black tracking-tight ${isLight ? 'text-black' : 'text-white'}`}>
                                                                        {c && c !== 'loading' ? String(c.stats?.count ?? '…') : '…'}
                                                                    </div>
                                                                    <div className="text-[7px] font-black uppercase tracking-widest opacity-30">Referrals</div>
                                                                </div>
                                                            </div>
                                                        );
                                                    })()}
                                                    {u.suspended && (
                                                        <span className="px-2 py-1 rounded-full bg-red-500/10 text-red-500 border border-red-500/30 text-[7px] font-black uppercase tracking-widest flex items-center gap-1">
                                                            <Ban size={9} /> Suspended
                                                        </span>
                                                    )}
                                                    {u.rateOverride != null && (
                                                        <span className="px-2 py-1 rounded-full bg-[#1A6140]/10 text-[#1A6140] border border-[#1A6140]/30 text-[7px] font-black uppercase tracking-widest">{u.rateOverride}% Rate</span>
                                                    )}
                                                    {u.slashed > 0 && (
                                                        <span className="px-2 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30 text-[7px] font-black uppercase tracking-widest">−${u.slashed.toFixed(2)}</span>
                                                    )}
                                                    <ChevronDown size={14} className={`transition-transform duration-300 ${open ? 'rotate-180' : ''} opacity-50`} />
                                                </div>
                                            </button>

                                            {open && (
                                                <div className="px-4 pb-4 flex flex-col gap-4">
                                                    {/* Commission readout (lazy-fetched) — listed, no mini-boxes */}
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2">
                                                        {[
                                                            { label: 'Total Commission', value: cache && cache !== 'loading' ? `$${Number(cache.stats?.totalCommission || 0).toFixed(2)}` : '…' },
                                                            { label: 'Referrals', value: cache && cache !== 'loading' ? String(cache.stats?.count ?? '…') : '…' },
                                                            { label: 'Pending', value: cache && cache !== 'loading' ? `$${Number(cache.pending || 0).toFixed(2)}` : '…' },
                                                            { label: 'Paid Out', value: cache && cache !== 'loading' ? `$${Number(cache.paid || 0).toFixed(2)}` : '…' }
                                                        ].map((s, i) => (
                                                            <div key={i} className="flex items-center justify-between gap-4">
                                                                <span className="text-[8px] font-black uppercase tracking-widest opacity-40">{s.label}</span>
                                                                <span className={`text-[10px] font-black whitespace-nowrap ${isLight ? 'text-black' : 'text-white'}`}>{s.value}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    {cache === 'loading' && <p className={`text-[8px] font-bold uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/30'}`}>Loading commission…</p>}

                                                    {/* Actions: suspend · set rate · slash */}
                                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                                        <button
                                                            disabled={busyKey('suspend')}
                                                            onClick={() => doRefAction('suspend', { address: u.address, suspended: !u.suspended }, u.suspended ? 'User reinstated in the program' : 'User suspended from the program')}
                                                            className={`flex items-center justify-center gap-2 py-3.5 px-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all disabled:opacity-50 ${u.suspended ? 'bg-[#1A6140] text-white hover:brightness-110' : 'bg-red-500/15 text-red-500 border border-red-500/30 hover:bg-red-500/25'}`}
                                                        >
                                                            {u.suspended ? <UserCheck size={13} /> : <UserX size={13} />} {u.suspended ? 'Unsuspend' : 'Suspend'}
                                                        </button>
                                                        <div className="flex gap-2">
                                                            <div className="relative flex-1 min-w-0">
                                                                <BadgePercent size={12} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-black/30' : 'text-white/30'}`} />
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    max="100"
                                                                    step="0.1"
                                                                    value={rateVal}
                                                                    onChange={e => setRateDrafts(prev => ({ ...prev, [u.address]: e.target.value }))}
                                                                    placeholder="Rate %"
                                                                    className={`w-full pl-8 pr-2 py-3 rounded-2xl border text-[10px] font-black outline-none transition-all ${isLight ? 'bg-black/5 border-black/10 focus:border-[#1A6140] text-black' : 'bg-black/40 border-white/10 focus:border-[#1A6140] text-white'}`}
                                                                />
                                                            </div>
                                                            <button
                                                                disabled={busyKey('set-rate')}
                                                                onClick={() => doRefAction('set-rate', { address: u.address, rate: rateVal.trim() === '' ? null : Number(rateVal) }, rateVal.trim() === '' ? 'Rate reset to program default' : 'Commission rate set')}
                                                                className="px-4 rounded-2xl bg-[#1A6140] text-white text-[9px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                                                            >
                                                                {busyKey('set-rate') ? '…' : 'Set'}
                                                            </button>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <div className="relative flex-1 min-w-0">
                                                                <Scissors size={12} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-black/30' : 'text-white/30'}`} />
                                                                <input
                                                                    type="number"
                                                                    min="0"
                                                                    step="0.01"
                                                                    value={slashVal}
                                                                    onChange={e => setSlashDrafts(prev => ({ ...prev, [u.address]: e.target.value }))}
                                                                    placeholder="Slash $"
                                                                    className={`w-full pl-8 pr-2 py-3 rounded-2xl border text-[10px] font-black outline-none transition-all ${isLight ? 'bg-black/5 border-black/10 focus:border-red-400 text-black' : 'bg-black/40 border-white/10 focus:border-red-400 text-white'}`}
                                                                />
                                                            </div>
                                                            <button
                                                                disabled={busyKey('slash')}
                                                                onClick={() => {
                                                                    const amt = Number(slashVal);
                                                                    if (!(amt > 0)) return notify('Enter an amount to slash', 'error');
                                                                    doRefAction('slash', { address: u.address, amount: amt }, `Slashed $${amt.toFixed(2)} from commission`);
                                                                }}
                                                                className="px-4 rounded-2xl bg-red-500/15 text-red-500 border border-red-500/30 text-[9px] font-black uppercase tracking-widest hover:bg-red-500/25 active:scale-95 transition-all disabled:opacity-50"
                                                            >
                                                                {busyKey('slash') ? '…' : 'Slash'}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <p className={`text-[8px] font-bold ${isLight ? 'text-black/30' : 'text-white/30'}`}>
                                                        Rate override (percent) applies to the deposit & volume commission this user earns. Blank resets to the program default. Slash permanently deducts from their commission balance.
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                    </div>
                )}

                {/* Suspensions tab — everyone currently suspended from the
                    referral program, with unsuspend and quick-slash control */}
                {activeNav === 'referrals' && wdSection === 'suspended' && (
                    <AdminCard title="Suspended Participants" icon={Ban} accent="#1A6140">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <p className={`text-[8px] font-bold uppercase tracking-wide ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                                    Suspended participants can still browse and place trades, but withdrawal requests are paused until reinstated.
                                </p>
                                <button onClick={() => fetchRefUsers()} className="p-3 rounded-2xl bg-[#1A6140]/10 text-[#1A6140] hover:bg-[#1A6140]/20 transition-all shrink-0">
                                    <RefreshCw size={14} />
                                </button>
                            </div>

                            {refUsers.filter(u => u.suspended).length === 0 ? (
                                <div className="py-8 text-center opacity-20 text-[9px] font-black uppercase tracking-widest">
                                    No suspended participants
                                </div>
                            ) : refUsers.filter(u => u.suspended).map(u => {
                                const cache = refStatCache[u.address];
                                const slashVal = slashDrafts[u.address] || '';
                                const busyKey = (ep) => refActionBusy === `${ep}:${u.address}`;
                                return (
                                    <div key={u.address} className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${isLight ? 'bg-white border-black/5' : 'bg-white/5 border-white/5'}`}>
                                        <div className="min-w-0">
                                            <div className={`text-[10px] font-black uppercase ${isLight ? 'text-black' : 'text-white'}`}>
                                                {u.username ? `@${u.username}` : `${(u.address || '').slice(0, 6)}…${(u.address || '').slice(-4)}`}
                                            </div>
                                            <div className={`text-[8px] font-bold uppercase font-mono ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                                                {u.referralCode ? `Code ${u.referralCode}` : 'No code'}{u.enrolledAt ? ` · ${(new Date(u.enrolledAt)).toLocaleDateString()}` : ''}
                                            </div>
                                            <div className={`text-[8px] font-bold uppercase tracking-widest ${isLight ? 'text-black/30' : 'text-white/30'}`}>
                                                Earned {cache && cache !== 'loading' ? `$${Number(cache.stats?.totalCommission || 0).toFixed(2)}` : '…'} · {cache && cache !== 'loading' ? String(cache.stats?.count ?? '…') : '…'} referrals
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 flex-wrap">
                                            <div className="flex gap-2">
                                                <div className="relative flex-1 min-w-0 w-28">
                                                    <Scissors size={12} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isLight ? 'text-black/30' : 'text-white/30'}`} />
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={slashVal}
                                                        onChange={e => setSlashDrafts(prev => ({ ...prev, [u.address]: e.target.value }))}
                                                        placeholder="Slash $"
                                                        className={`w-full pl-8 pr-2 py-3 rounded-2xl border text-[10px] font-black outline-none transition-all ${isLight ? 'bg-black/5 border-black/10 focus:border-red-400 text-black' : 'bg-black/40 border-white/10 focus:border-red-400 text-white'}`}
                                                    />
                                                </div>
                                                <button
                                                    disabled={busyKey('slash')}
                                                    onClick={() => {
                                                        const amt = Number(slashVal);
                                                        if (!(amt > 0)) return notify('Enter an amount to slash', 'error');
                                                        doRefAction('slash', { address: u.address, amount: amt }, `Slashed $${amt.toFixed(2)} from commission`);
                                                    }}
                                                    className="px-3 py-3 rounded-2xl bg-red-500/15 text-red-500 border border-red-500/30 text-[9px] font-black uppercase tracking-widest hover:bg-red-500/25 active:scale-95 transition-all disabled:opacity-50"
                                                >
                                                    {busyKey('slash') ? '…' : 'Slash'}
                                                </button>
                                            </div>
                                            <button
                                                disabled={busyKey('suspend')}
                                                onClick={() => doRefAction('suspend', { address: u.address, suspended: false }, 'User reinstated in the program')}
                                                className="flex items-center justify-center gap-2 py-3 px-4 rounded-2xl bg-[#1A6140] text-white text-[9px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                                            >
                                                <UserCheck size={13} /> {busyKey('suspend') ? '…' : 'Unsuspend'}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </AdminCard>
                )}
            <AnimatePresence>
                {cancelFor != null && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        onClick={processingId ? undefined : () => setCancelFor(null)}
                        className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
                    >
                        <motion.div
                            initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
                            onClick={e => e.stopPropagation()}
                            className={`w-full max-w-md p-6 md:p-7 rounded-[32px] border flex flex-col gap-5 ${isLight ? 'bg-white border-black/10' : 'bg-[#0D0D0D] border-white/10 shadow-2xl'}`}
                        >
                            <div className="flex items-center justify-between">
                                <h3 className={`text-base font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Cancel withdrawal request</h3>
                                <button onClick={() => setCancelFor(null)} className="p-2 rounded-full hover:bg-white/5 transition-colors">
                                    <X size={18} className={isLight ? 'text-black' : 'text-white'} />
                                </button>
                            </div>
                            <div>
                                <label className={`text-[9px] font-black uppercase tracking-widest opacity-30 block mb-3 ml-1 ${isLight ? 'text-black' : 'text-white'}`}>Reason (emailed to the user)</label>
                                <textarea
                                    value={cancelNote}
                                    onChange={e => setCancelNote(e.target.value)}
                                    placeholder="Why is this request being cancelled…"
                                    className={`w-full min-h-[110px] p-4 rounded-2xl border text-xs font-bold resize-none outline-none transition-all ${isLight ? 'bg-black/5 border-black/10 focus:border-[#1A6140] text-black' : 'bg-black/40 border-white/10 focus:border-[#1A6140] text-white'}`}
                                />
                            </div>
                            <p className={`text-[9px] font-bold opacity-40 uppercase leading-relaxed ${isLight ? 'text-black' : 'text-white'}`}>
                                The user is emailed that an administrator cancelled their withdrawal request. The amount releases back to their referral commission balance immediately.
                            </p>
                            <button
                                onClick={() => {
                                    const id = cancelFor;
                                    setCancelFor(null);
                                    const note = cancelNote;
                                    setCancelNote('');
                                    setRefWithdrawalStatus(id, 'rejected', note);
                                }}
                                disabled={processingId != null}
                                className="w-full py-4 rounded-2xl bg-red-500 text-white text-[10px] font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-50"
                            >
                                {processingId != null ? 'Processing…' : 'Confirm cancellation'}
                            </button>
                        </motion.div>
                    </motion.div>
                )}
             </AnimatePresence>
             </main>

            {/* MOBILE bottom tab bar — the five sections, glass strip, safe-area aware.
                Badges (pending withdrawals) show as amber dots. */}
            <div className={`md:hidden fixed bottom-0 inset-x-0 z-[60] flex items-stretch border-t backdrop-blur-3xl px-1.5 pt-1 overflow-x-auto no-scrollbar ${isLight ? 'bg-white/85 border-black/10' : 'bg-[#0A0A0A]/90 border-white/10'}`} style={{ paddingBottom: 'max(0.3rem, env(safe-area-inset-bottom))' }}>
                {visibleNav.map(t => {
                    const Icon = t.icon;
                    const active = activeNav === t.key;
                    const badge = t.key === 'referrals' ? refWithdrawals.filter(w => w.status === 'pending').length : 0;
                    return (
                        <button
                            key={t.key}
                            onClick={() => selectSection(t.key)}
                            className={`relative flex-1 min-w-[64px] flex flex-col items-center gap-1 py-2 rounded-2xl transition-all active:scale-95 ${active
                                ? 'text-[#3CB371]'
                                : isLight ? 'text-black/40' : 'text-white/40'}`}
                        >
                            {active && <motion.div layoutId="mob-tab-dot" className="absolute top-0 h-[3px] w-7 rounded-full bg-[#3CB371]" />}
                            <Icon size={18} className="flex-none" />
                            <span className="text-[6.5px] font-black uppercase tracking-widest truncate max-w-full">{t.label}</span>
                            {badge > 0 && (
                                <span className="absolute top-1 right-2 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[7px] font-black leading-none">{badge}</span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Persistence Layer Status — slim strip inside the main column */}
            <footer className={`hidden md:flex flex-none px-6 py-2.5 border-t backdrop-blur-3xl flex items-center justify-between ${isLight ? 'bg-white/50 border-[#1A6140]/10' : 'bg-[#0A0A0A]/60 border-white/5'}`}>
                <div className="flex items-center gap-5 min-w-0">
                    <div className="flex items-center gap-2">
                        <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-[#1A6140]' : 'bg-red-500'} animate-pulse`} />
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-40 whitespace-nowrap">{isConnected ? 'Node Connected' : 'Node Offline'}</span>
                    </div>
                    <div className={`hidden sm:block h-3 w-px ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
                    <div className="hidden sm:flex items-center gap-2">
                        <Shield size={11} className="text-[#1A6140] opacity-50" />
                        <span className="text-[8px] font-black uppercase tracking-widest opacity-30 whitespace-nowrap">Session Authorized</span>
                    </div>
                </div>
                <div className="text-[8px] font-mono opacity-20 uppercase tracking-[0.35em] whitespace-nowrap">
                    15market_v2.4.0
                </div>
            </footer>

            </div>
        </div>
    );
}
