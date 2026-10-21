import React, { useState, useEffect } from "react";
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
    Activity,
    ArrowLeft,
    Globe,
    TrendingUp,
    DollarSign,
    Users,
    Gift,
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
    LogOut
} from "lucide-react";
import { KEEPER_URL_ARC } from "../constants";
import { adminFetch, clearSession } from "../utils/adminAuth";
import { GlobalTradeScroller } from "./GlobalTradeScroller";
import { socketService } from "../utils/socket";

// Admin tabs. Even mobile widths keep every tool reachable — the tab row
// scrolls horizontally as a chip strip instead of collapsing.
const ADMIN_TABS = [
    { key: 'overview', label: 'Overview', icon: Activity },
    { key: 'referral', label: 'Referral Program', icon: Gift },
    { key: 'requests', label: 'Withdrawal Requests', icon: Landmark },
    { key: 'admins', label: 'Admins & Mods', icon: Shield }
];

export function AdminDashboard({ onBack, theme, notify, platformSettings: initialSettings, auth }) {
    const isLight = theme === 'light';
    
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
    const [isConnected, setIsConnected] = useState(true);
    const [syncProgress, setSyncProgress] = useState(0);

    const [stats, setStats] = useState({
        totalVolume: "0.00",
        totalTrades: "0",
        activeUsers: "0",
        treasuryBalance: "0.00"
    });
    
    const [recentActivity, setRecentActivity] = useState([]);
    const [liveUsers, setLiveUsers] = useState([]); // { lat, lng, id } for map
    const [userProfiles, setUserProfiles] = useState({});
    // Referral commission withdrawal requests (manual payouts — not on-chain).
    const [refWithdrawals, setRefWithdrawals] = useState([]);

    const fetchRefWithdrawals = async () => {
        try {
            const res = await adminFetch(`${KEEPER_URL_ARC}/admin/referral/withdrawals`);
            if (res.ok) setRefWithdrawals(await res.json());
        } catch (e) { /* list stays empty; the card shows a retry button */ }
    };

    useEffect(() => {
        fetchRefWithdrawals();
    }, []);

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
            if (adminTab === 'referral') fetchRefUsers();
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            setProcessingId(null);
        }
    };

    // ── Referral Program Management (migration 010) ──────────────────────
    const [adminTab, setAdminTab] = useState('overview');
    const [refUsers, setRefUsers] = useState([]);
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
            if (res.ok) setRefUsers(Array.isArray(data) ? data : []);
        } catch (e) { /* card shows a retry button */ }
    };

    // Expand a user: fetch their commission stats + withdrawals once, lazily —
    // the bulk admin read stays light while still showing real numbers.
    const toggleRefUser = async (addr) => {
        const next = openRefUser === addr ? null : addr;
        setOpenRefUser(next);
        if (next && !refStatCache[addr]) {
            setRefStatCache(prev => ({ ...prev, [addr]: 'loading' }));
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
        }
    };

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
        if (adminTab === 'referral') fetchRefUsers();
    }, [adminTab]);

    const fetchProfile = async (addr) => {
        if (!addr) return;
        const lowAddr = addr.toLowerCase();
        if (userProfiles[lowAddr]) return;
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/profile?address=${lowAddr}`);
            if (res.ok) {
                const data = await res.json();
                setUserProfiles(prev => ({ ...prev, [lowAddr]: data }));
            }
        } catch (e) {}
    };

    // Real-time Event Subscriptions
    useEffect(() => {
        socketService.connect();

        // 1. Metrics Pulse
        const unbindMetrics = socketService.on('admin_metrics_update', (data) => {
            setStats(prev => ({
                ...prev,
                totalVolume: data.totalVolume,
                totalTrades: data.totalTrades,
                activeUsers: data.activeUsers,
                treasuryBalance: data.treasuryBalance
            }));
            setIsConnected(true);
        });

        // 2. New Trade (Sub-second Indexing)
        const unbindTrades = socketService.on('new_trade', (trade) => {
            setRecentActivity(prev => [trade, ...prev].slice(0, 50));
            if (trade.userAddr) fetchProfile(trade.userAddr);
        });

        // 3. User Onboarding (Geo Pin)
        const unbindUsers = socketService.on('user_onboarded', (user) => {
            const newPin = {
                id: Date.now(),
                x: Math.random() * 80 + 10, // Randomish for demo, could use IP geo
                y: Math.random() * 60 + 20
            };
            setLiveUsers(prev => [...prev, newPin]);
            if (user.address) fetchProfile(user.address);
            setTimeout(() => {
                setLiveUsers(prev => prev.filter(p => p.id !== newPin.id));
            }, 5000);
        });

        // 4. Initial Fetch
        const fetchStats = async () => {
            try {
                const res = await fetch(`${KEEPER_URL_ARC}/protocol-stats`);
                if (res.ok) {
                    const data = await res.json();
                    setStats(data);
                }
                
                // Also fetch recent activity history
                const histRes = await fetch(`${KEEPER_URL_ARC}/history`);
                if (histRes.ok) {
                    const histData = await histRes.json();
                    setRecentActivity(histData.slice(0, 50));
                    // Prefetch profiles for history
                    histData.slice(0, 20).forEach(h => {
                        if (h.owner) fetchProfile(h.owner);
                        if (h.userAddr) fetchProfile(h.userAddr);
                    });
                }
            } catch (e) {}
        };
        fetchStats();

        return () => {
            unbindMetrics();
            unbindTrades();
            unbindUsers();
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
            
            if (!res.ok) throw new Error("Broadcast failed");
            
            notify("Global Broadcast Initiated", "success");
            setBroadcastText("");
        } catch (e) {
            notify("Broadcast Error: " + e.message, "error");
        } finally {
            setIsSaving(false);
        }
    };

    // ── Auth context (Supabase-Auth admin) ──────────────────────────────
    const isRoot = auth?.isRoot === true || auth?.role === 'root';
    const adminPerms = auth?.permissions || [];
    const hasPerm = (p) => isRoot || adminPerms.includes('*') || adminPerms.includes(p);
    const canRequests = hasPerm('ref.withdrawals');
    const canReferral = hasPerm('ref.manage');
    const canSettings = hasPerm('platform.settings');
    const canBroadcast = hasPerm('broadcast.send');

    // Row-based tabs: only ones the signed-in admin is allowed to open.
    const visibleTabs = ADMIN_TABS.filter(t => {
        if (t.key === 'requests') return canRequests;
        if (t.key === 'referral') return canReferral;
        if (t.key === 'admins') return isRoot;
        return true;
    });

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
        if (adminTab === 'admins' && auth?.isRoot) fetchAdminRoster();
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
        <div className={`h-screen w-full flex flex-col overflow-hidden ${isLight ? 'bg-[#F4F7F5]' : 'bg-[#050505]'} relative`}>
            {/* Background Flair */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#1A6140]/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#1A6140]/3 rounded-full blur-[120px]" />
            </div>

            {/* Header */}
            <header className={`flex-none ${isLight ? 'bg-white/50 border-[#1A6140]/20' : 'bg-[#0D0D0D]/50 border-white/5'} border-b backdrop-blur-3xl z-50`}>
                <div className="max-w-[1600px] mx-auto px-8 py-5 flex items-center justify-between">
                    <div className="flex items-center gap-6">
                        <button 
                            onClick={onBack}
                            className={`p-3 rounded-full border transition-all ${isLight ? 'bg-white border-[#1A6140]/20 hover:bg-[#1A6140]/10 text-black' : 'bg-white/5 border-white/5 hover:bg-white/10 text-white'} active:scale-95`}
                        >
                            <ArrowLeft size={18} />
                        </button>
                        <div className="flex flex-col">
                            <h1 className={`text-xl font-black uppercase tracking-tighter flex items-center gap-3 ${isLight ? 'text-black' : 'text-white'}`}>
                                Admin Citadel
                            </h1>
                            <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest mt-0.5">Platform Security & Broadcast Center</p>
                        </div>
                    </div>

                    <div className="flex items-center gap-4">
                        <div className={`flex items-center gap-3 px-4 py-2 rounded-2xl border ${isLight ? 'bg-[#1A6140]/5 border-[#1A6140]/10' : 'bg-white/5 border-white/5'}`}>
                            {isConnected ? <Wifi size={14} className="text-[#1A6140]" /> : <WifiOff size={14} className="text-red-500" />}
                            <span className={`text-[10px] font-black uppercase tracking-widest ${isConnected ? 'text-[#1A6140]' : 'text-red-500'}`}>
                                Latency: 42ms
                            </span>
                        </div>
                        {auth?.email && (
                            <div className={`hidden md:flex items-center gap-3 px-4 py-2 rounded-2xl border ${isLight ? 'bg-white border-[#1A6140]/20' : 'bg-white/5 border-white/5'}`}>
                                <div className="w-7 h-7 rounded-full bg-[#1A6140] flex items-center justify-center text-white text-[9px] font-black uppercase">
                                    {auth.email.slice(0, 2)}
                                </div>
                                <div className="flex flex-col">
                                    <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black' : 'text-white'}`}>{auth.email}</span>
                                    <span className="text-[7px] font-black uppercase tracking-widest text-[#1A6140]">{auth.isRoot ? 'Root Admin' : auth.role || 'Admin'}</span>
                                </div>
                                <button
                                    onClick={auth.signOut || auth.onSignOut}
                                    title="Sign out"
                                    className={`p-2 rounded-xl transition-all active:scale-95 ${isLight ? 'bg-black/[0.04] hover:bg-red-500/10 text-black/40 hover:text-red-500' : 'bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-500'}`}
                                >
                                    <LogOut size={13} />
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 overflow-y-auto no-scrollbar p-4 md:p-10 z-10">
                {/* MARKET SCROLLER (Marquee) — same participation feed as the user side */}
                <div className="max-w-[1400px] mx-auto w-full overflow-hidden relative rounded-[10px] mb-5">
                    <GlobalTradeScroller theme={theme} />
                </div>

                {/* Tab bar — chip strip that scrolls horizontally on narrow screens */}
                <div className="max-w-[1400px] mx-auto flex items-center gap-2 mb-6 md:mb-8 overflow-x-auto no-scrollbar">
                    {visibleTabs.map(t => {
                        const Icon = t.icon;
                        const active = adminTab === t.key;
                        const badge = t.key === 'requests' ? refWithdrawals.filter(w => w.status === 'pending').length : 0;
                        return (
                            <button
                                key={t.key}
                                onClick={() => setAdminTab(t.key)}
                                className={`flex items-center gap-2 px-4 md:px-5 py-3 rounded-2xl border text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${active ? 'bg-[#1A6140] text-white border-[#1A6140] shadow-lg shadow-[#1A6140]/20' : isLight ? 'bg-white/60 border-black/10 text-black/50 hover:text-black' : 'bg-white/5 border-white/10 text-white/40 hover:text-white'}`}
                            >
                                <Icon size={13} />
                                {t.label}
                                {badge > 0 && (
                                    <span className="px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[8px] font-black leading-none">{badge}</span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {adminTab === 'overview' && (
                <div className="max-w-[1400px] mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
                    
                    {/* Security & Maintenance Controls (COL 1-7) */}
                    <div className="lg:col-span-7 flex flex-col gap-8">
                        {canSettings && (
                        <AdminCard title="Security Protocols" icon={Shield} accent="#1A6140">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {/* Maintenance Toggle */}
                                <div className={`p-6 rounded-[24px] border ${platformSettings.maintenanceMode ? 'bg-[#1A6140]/10 border-[#1A6140]/40' : 'bg-white/5 border-white/5'} transition-all`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-2xl ${platformSettings.maintenanceMode ? 'bg-[#1A6140] text-white' : 'bg-white/5 text-white/40'}`}>
                                                <Settings size={20} className={platformSettings.maintenanceMode ? 'animate-spin-slow' : ''} />
                                            </div>
                                            <div>
                                                <h4 className="text-[11px] font-black uppercase">Maintenance Mode</h4>
                                                <p className="text-[9px] opacity-40 font-bold uppercase mt-1">Full System Lock</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => updateSettings({ maintenanceMode: !platformSettings.maintenanceMode })}
                                            className={`w-14 h-8 rounded-full relative p-1 transition-all ${platformSettings.maintenanceMode ? 'bg-[#1A6140]' : 'bg-white/10'}`}
                                        >
                                            <motion.div 
                                                animate={{ x: platformSettings.maintenanceMode ? 24 : 0 }}
                                                className="w-6 h-6 rounded-full bg-white shadow-lg"
                                            />
                                        </button>
                                    </div>
                                    <p className="text-[10px] opacity-50 leading-relaxed font-medium">
                                        Redirects all users to a maintenance screen. Prevents any interactions with the protocol.
                                    </p>
                                </div>

                                {/* Trading Halted Toggle */}
                                <div className={`p-6 rounded-[24px] border ${platformSettings.tradingHalted ? 'bg-red-500/10 border-red-500/40' : 'bg-white/5 border-white/5'} transition-all`}>
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-4">
                                            <div className={`p-3 rounded-2xl ${platformSettings.tradingHalted ? 'bg-red-500 text-white' : 'bg-white/5 text-white/40'}`}>
                                                <Lock size={20} />
                                            </div>
                                            <div>
                                                <h4 className="text-[11px] font-black uppercase">Trading Halted</h4>
                                                <p className="text-[9px] opacity-40 font-bold uppercase mt-1">Kill Switch</p>
                                            </div>
                                        </div>
                                        <button 
                                            onClick={() => updateSettings({ tradingHalted: !platformSettings.tradingHalted })}
                                            className={`w-14 h-8 rounded-full relative p-1 transition-all ${platformSettings.tradingHalted ? 'bg-red-500' : 'bg-white/10'}`}
                                        >
                                            <motion.div 
                                                animate={{ x: platformSettings.tradingHalted ? 24 : 0 }}
                                                className="w-6 h-6 rounded-full bg-white shadow-lg"
                                            />
                                        </button>
                                    </div>
                                    <p className="text-[10px] opacity-50 leading-relaxed font-medium">
                                        Freezes all trading execution. Users can browse but cannot place bets.
                                    </p>
                                </div>
                            </div>

                            <div className="mt-8 p-6 bg-amber-500/5 border border-amber-500/20 rounded-[28px] flex items-center gap-6">
                                <AlertTriangle size={32} className="text-amber-500 flex-none" />
                                <div>
                                    <h4 className="text-[10px] font-black uppercase text-amber-500 mb-1">Warning: Admin Authority</h4>
                                    <p className="text-[9px] font-medium opacity-60">Changes to security protocols propagate globally in real-time. Ensure node synchronization before proceeding with major maintenance windows.</p>
                                </div>
                            </div>
                        </AdminCard>
                        )}

                        <AdminCard title="Platform Metrics" icon={Activity} accent="#1A6140">
                             <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {[
                                    { label: 'Total Volume', value: `$${parseFloat(stats.totalVolume).toLocaleString()}`, icon: DollarSign, color: '#1A6140' },
                                    { label: 'Active Users', value: stats.activeUsers, icon: Users, color: '#3b82f6' },
                                    { label: 'Total Trades', value: stats.totalTrades, icon: TrendingUp, color: '#f59e0b' },
                                    { label: 'Treasury', value: `${parseFloat(stats.treasuryBalance).toFixed(2)} ARC`, icon: Zap, color: '#ef4444' }
                                ].map((stat, i) => (
                                    <div key={i} className={`p-4 rounded-2xl border ${isLight ? 'bg-white border-black/5' : 'bg-white/5 border-white/5 shadow-inner'}`}>
                                        <div className="flex items-center gap-2 mb-2 opacity-40">
                                            <stat.icon size={12} style={{ color: stat.color }} />
                                            <span className="text-[8px] font-black uppercase tracking-widest">{stat.label}</span>
                                        </div>
                                        <div className={`text-lg font-black tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>{stat.value}</div>
                                    </div>
                                ))}
                             </div>
                        </AdminCard>

                        <AdminCard title="Global User Presence" icon={Globe} accent="#3b82f6">
                            <div className={`relative w-full aspect-[2/1] rounded-3xl overflow-hidden border ${isLight ? 'bg-[#1A6140]/5 border-[#1A6140]/10' : 'bg-black/40 border-white/5'}`}>
                                {/* Simplified SVG World Map */}
                                <svg className="w-full h-full opacity-20" viewBox="0 0 800 400" fill="currentColor">
                                    <path d="M150,100 Q200,80 250,100 T350,120 T450,100 T550,80 T650,100 T750,120 L750,300 Q650,320 550,300 T450,280 T350,300 T250,320 T150,300 Z" opacity="0.5" />
                                    <circle cx="200" cy="150" r="40" />
                                    <circle cx="500" cy="200" r="60" />
                                    <circle cx="650" cy="120" r="30" />
                                </svg>
                                
                                {/* Live Pulsing Pins */}
                                <AnimatePresence>
                                    {liveUsers.map(user => (
                                        <motion.div
                                            key={user.id}
                                            initial={{ scale: 0, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 2, opacity: 0 }}
                                            className="absolute w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_15px_#3b82f6]"
                                            style={{ left: `${user.x}%`, top: `${user.y}%` }}
                                        >
                                            <div className="absolute inset-x-[-4px] inset-y-[-4px] border-2 border-blue-500 rounded-full animate-ping" />
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                                
                                <div className="absolute bottom-4 left-6 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                                    <span className="text-[8px] font-black uppercase tracking-widest opacity-40">Live Incoming Traffic</span>
                                </div>
                            </div>
                        </AdminCard>
                    </div>

                    {/* Broadcast Center (COL 8-12) */}
                    <div className="lg:col-span-5">
                        {canBroadcast && (
                        <AdminCard title="Broadcast Center" icon={Radio} accent="#1A6140">
                            <div className="flex flex-col gap-6">
                                <div>
                                    <label className="text-[9px] font-black uppercase opacity-30 tracking-[0.2em] block mb-3 ml-1">Live Message</label>
                                    <textarea 
                                        value={broadcastText}
                                        onChange={(e) => setBroadcastText(e.target.value)}
                                        placeholder="Enter system broadcast message..."
                                        className={`w-full min-h-[140px] p-6 rounded-3xl border text-sm font-bold resize-none transition-all outline-none ${isLight ? 'bg-white border-[#1A6140]/10 focus:border-[#1A6140]/40' : 'bg-black/40 border-white/10 focus:border-[#1A6140]/30'}`}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[9px] font-black uppercase opacity-30 tracking-[0.2em] block mb-3 ml-1">Persistence (Min)</label>
                                        <div className="flex items-center gap-3">
                                            {[1, 10, 60].map(m => (
                                                <button 
                                                    key={m}
                                                    onClick={() => setBroadcastDuration(m * 60)}
                                                    className={`flex-1 py-3 rounded-xl border text-[10px] font-black transition-all ${broadcastDuration === m * 60 ? 'bg-[#1A6140] text-white border-[#1A6140]' : 'bg-white/5 border-white/5 opacity-50 hover:opacity-100'}`}
                                                >
                                                    {m}m
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black uppercase opacity-30 tracking-[0.2em] block mb-3 ml-1">Alert Level</label>
                                        <div className="flex items-center gap-3">
                                            {['info', 'success', 'warning', 'error'].map(level => (
                                                <button 
                                                    key={level}
                                                    onClick={() => updateSettings({ bannerLevel: level })}
                                                    className={`w-8 h-8 rounded-full border transition-all flex items-center justify-center ${platformSettings.bannerLevel === level ? 'ring-2 ring-[#1A6140] border-transparent' : 'border-white/10 opacity-30 shadow-sm'}`}
                                                    style={{ backgroundColor: level === 'info' ? '#3b82f6' : level === 'success' ? '#1A6140' : level === 'warning' ? '#f59e0b' : '#ef4444' }}
                                                >
                                                    <div className="w-1.5 h-1.5 rounded-full bg-white" />
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <button 
                                    onClick={handleUpdateBroadcast}
                                    disabled={isSaving || !broadcastText}
                                    className="w-full py-5 bg-[#1A6140] text-white rounded-3xl font-black uppercase tracking-[0.3em] text-[10px] shadow-[0_20px_40px_-10px_rgba(26, 97, 64,0.3)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40"
                                >
                                    <div className="flex items-center justify-center gap-3">
                                        <Radio size={16} />
                                        <span>Transmit Broadcast</span>
                                    </div>
                                </button>

                                <div className={`p-5 rounded-2xl border ${isLight ? 'bg-white/50 border-[#1A6140]/10' : 'bg-white/[0.03] border-white/5'}`}>
                                    <div className="flex items-center gap-3 mb-2">
                                        <Activity size={14} className="text-[#1A6140]" />
                                        <h4 className="text-[10px] font-black uppercase">Current Transmission</h4>
                                    </div>
                                    <p className="text-[11px] font-bold opacity-60 leading-relaxed italic">
                                        {platformSettings.systemBanner || "No active manual broadcast. Platform running standard tickers."}
                                    </p>
                                </div>
                            </div>
                        </AdminCard>
                        )}

                        <AdminCard title="Recent Activity" icon={Clock} accent="#f59e0b">
                            <div className="flex flex-col gap-2 max-h-[400px] overflow-y-auto no-scrollbar">
                                {recentActivity.length === 0 ? (
                                    <div className="py-10 text-center opacity-20 text-[9px] font-black uppercase tracking-widest">
                                        No recent trades detected
                                    </div>
                                ) : (
                                    recentActivity.map((act, i) => (
                                        <motion.div 
                                            initial={{ x: -20, opacity: 0 }}
                                            animate={{ x: 0, opacity: 1 }}
                                            key={act.id || i}
                                            className={`p-3 rounded-2xl border flex items-center justify-between ${isLight ? 'bg-white border-black/5' : 'bg-white/5 border-white/5'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-9 h-9 rounded-xl overflow-hidden flex items-center justify-center ${act.direction === 'UP' ? 'bg-[#1A6140]/10 text-[#1A6140]' : 'bg-red-500/10 text-red-500'}`}>
                                                    {userProfiles[(act.userAddr || act.owner || "").toLowerCase()]?.avatar ? (
                                                        <img 
                                                            src={userProfiles[(act.userAddr || act.owner || "").toLowerCase()].avatar} 
                                                            className="w-full h-full object-cover"
                                                            alt=""
                                                        />
                                                    ) : (
                                                        act.direction === 'UP' ? <TrendingUp size={14} /> : <TrendingUp size={14} className="rotate-180" />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="text-[10px] font-black uppercase flex items-center gap-2">
                                                        {userProfiles[(act.userAddr || act.owner || "").toLowerCase()]?.username || `${(act.userAddr || act.owner || "0x").slice(0, 6)}...`}
                                                        {act.type === 'TRADE_PLACED' && <div className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />}
                                                    </div>
                                                    <div className="text-[8px] opacity-40 font-bold uppercase">{act.symbol} • ${act.amount}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className={`text-[10px] font-black ${act.won ? 'text-[#1A6140]' : (act.type === 'TRADE_PLACED' ? 'text-amber-500' : 'text-red-500')}`}>
                                                    {act.type === 'TRADE_PLACED' ? 'PENDING' : (act.won ? `+$${act.payout}` : 'LOST')}
                                                </div>
                                                <div className="text-[8px] opacity-20 font-mono capitalize">{new Date(act.timestamp).toLocaleTimeString()}</div>
                                            </div>
                                        </motion.div>
                                    ))
                                )}
                            </div>
                        </AdminCard>
                     </div>
                </div>
                )}

                {/* Withdrawal Requests tab — approve pays out, cancel emails the user */}
                {adminTab === 'requests' && (
                    <AdminCard title="Withdrawal Requests" icon={Gift} accent="#1A6140">
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                                    {[['all', 'All'], ['pending', 'Pending'], ['paid', 'Approved'], ['rejected', 'Cancelled']].map(([k, l]) => (
                                        <button
                                            key={k}
                                            onClick={() => setWdFilter(k)}
                                            className={`px-4 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest whitespace-nowrap transition-all ${wdFilter === k ? 'bg-[#1A6140] text-white border-[#1A6140]' : isLight ? 'bg-white border-black/10 text-black/40' : 'bg-white/5 border-white/10 text-white/40'}`}
                                        >
                                            {l}
                                        </button>
                                    ))}
                                </div>
                                <button onClick={fetchRefWithdrawals} className="p-2 rounded-xl bg-[#1A6140]/10 text-[#1A6140] hover:bg-[#1A6140]/20 transition-all">
                                    <RefreshCw size={13} />
                                </button>
                            </div>

                            <div className="flex flex-col gap-2 max-h-[560px] overflow-y-auto no-scrollbar">
                                {(wdFilter === 'all' ? refWithdrawals : refWithdrawals.filter(w => w.status === wdFilter)).length === 0 ? (
                                    <div className="py-8 text-center opacity-20 text-[9px] font-black uppercase tracking-widest">
                                        No withdrawal requests
                                    </div>
                                ) : (wdFilter === 'all' ? refWithdrawals : refWithdrawals.filter(w => w.status === wdFilter)).map(w => (
                                    <motion.div
                                        key={w.id}
                                        initial={{ opacity: 0, y: 8 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${isLight ? 'bg-white border-black/5' : 'bg-white/5 border-white/5'}`}
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
                            <p className={`text-[8px] font-bold opacity-30 uppercase tracking-wide ${isLight ? 'text-black' : 'text-white'}`}>
                                Approving marks the request paid and emails the user. Cancelling releases the hold back to their commission balance and emails them with the reason.
                            </p>
                        </div>
                    </AdminCard>
                )}

                {/* Referral Program Management tab — suspend/rate/slash */}
                {adminTab === 'referral' && (
                    <AdminCard title="Referral Program Management" icon={Gift} accent="#1A6140">
                        <div className="flex flex-col gap-4">
                            {/* Enrolled-user search */}
                            <div className="flex items-center gap-3">
                                <div className="relative flex-1 min-w-0">
                                    <Search size={14} className={`absolute left-4 top-1/2 -translate-y-1/2 ${isLight ? 'text-black/30' : 'text-white/30'}`} />
                                    <input
                                        value={refUsersQ}
                                        onChange={e => setRefUsersQ(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') fetchRefUsers(); }}
                                        placeholder="Search username or address…"
                                        className={`w-full pl-11 pr-4 py-3.5 rounded-2xl border text-xs font-bold outline-none transition-all ${isLight ? 'bg-white border-black/10 focus:border-[#1A6140] text-black' : 'bg-black/40 border-white/10 focus:border-[#1A6140] text-white'}`}
                                    />
                                </div>
                                <button onClick={() => fetchRefUsers()} className="p-3 rounded-2xl bg-[#1A6140]/10 text-[#1A6140] hover:bg-[#1A6140]/20 transition-all shrink-0">
                                    <RefreshCw size={14} />
                                </button>
                            </div>

                            <div className="flex flex-col gap-2 max-h-[560px] overflow-y-auto no-scrollbar">
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
                                        <div key={u.address} className={`rounded-2xl border overflow-hidden ${open ? (isLight ? 'border-[#1A6140]/40' : 'border-[#1A6140]/30') : (isLight ? 'border-black/5' : 'border-white/5')} ${isLight ? 'bg-white' : 'bg-white/5'} transition-colors`}>
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
                                                    {/* Commission readout (lazy-fetched) */}
                                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                                        {[
                                                            { label: 'Total Commission', value: cache && cache !== 'loading' ? `$${Number(cache.stats?.totalCommission || 0).toFixed(2)}` : '…' },
                                                            { label: 'Referrals', value: cache && cache !== 'loading' ? String(cache.stats?.count ?? '…') : '…' },
                                                            { label: 'Pending', value: cache && cache !== 'loading' ? `$${Number(cache.pending || 0).toFixed(2)}` : '…' },
                                                            { label: 'Paid Out', value: cache && cache !== 'loading' ? `$${Number(cache.paid || 0).toFixed(2)}` : '…' }
                                                        ].map((s, i) => (
                                                            <div key={i} className={`p-3 rounded-xl border ${isLight ? 'bg-black/[0.03] border-black/5' : 'bg-black/30 border-white/5'}`}>
                                                                <div className={`text-[7px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>{s.label}</div>
                                                                <div className={`text-sm font-black ${isLight ? 'text-black' : 'text-white'}`}>{s.value}</div>
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
                    </AdminCard>
                )}
            {/* Admins & Moderators (root-only) — Supabase Auth identity */}
            {adminTab === 'admins' && isRoot && (
                <AdminCard title="Admins & Moderators" icon={Shield} accent="#1A6140">
                    <div className="flex flex-col gap-4">
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                            <p className={`text-[8px] font-black uppercase tracking-widest opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>
                                Identity: Supabase Auth · root is permanent · permissions are granular
                            </p>
                            <button
                                onClick={() => setShowCreateAdmin(v => !v)}
                                className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${showCreateAdmin ? 'bg-white/5 border border-white/10 text-white/60' : 'bg-[#1A6140] text-white hover:brightness-110'}`}
                            >
                                {showCreateAdmin ? 'Close form' : '+ New admin / mod'}
                            </button>
                        </div>

                        {showCreateAdmin && (
                            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className={`p-5 rounded-3xl border flex flex-col gap-4 ${isLight ? 'bg-black/[0.03] border-black/10' : 'bg-black/30 border-white/10'}`}>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <input
                                        value={newAdmin.email}
                                        onChange={e => setNewAdmin(prev => ({ ...prev, email: e.target.value }))}
                                        placeholder="email"
                                        className={`px-4 py-3 rounded-2xl border text-[11px] font-black outline-none transition-all ${isLight ? 'bg-white border-black/10 focus:border-[#1A6140] text-black' : 'bg-black/40 border-white/10 focus:border-[#1A6140] text-white'}`}
                                    />
                                    <input
                                        type="password"
                                        value={newAdmin.password}
                                        onChange={e => setNewAdmin(prev => ({ ...prev, password: e.target.value }))}
                                        placeholder="temp password (min 8)"
                                        className={`px-4 py-3 rounded-2xl border text-[11px] font-black outline-none transition-all ${isLight ? 'bg-white border-black/10 focus:border-[#1A6140] text-black' : 'bg-black/40 border-white/10 focus:border-[#1A6140] text-white'}`}
                                    />
                                    <div className="flex gap-2">
                                        {[['admin', 'Admin'], ['moderator', 'Moderator']].map(([r, l]) => (
                                            <button
                                                key={r}
                                                onClick={() => setNewAdmin(prev => ({ ...prev, role: r, permissions: ROLE_PRESETS[r] }))}
                                                className={`flex-1 py-3 rounded-2xl border text-[9px] font-black uppercase tracking-widest transition-all ${newAdmin.role === r ? 'bg-[#1A6140] text-white border-[#1A6140]' : isLight ? 'bg-white border-black/10 text-black/40' : 'bg-white/5 border-white/10 text-white/40'}`}
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
                                    disabled={createAdminBusy || !newAdmin.email.trim() || newAdmin.password.length < 8}
                                    className="w-full py-3.5 rounded-2xl bg-[#1A6140] text-white text-[9px] font-black uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40"
                                >
                                    {createAdminBusy ? 'Creating…' : 'Create account'}
                                </button>
                            </motion.div>
                        )}

                        <div className="flex flex-col gap-2 max-h-[540px] overflow-y-auto no-scrollbar">
                            {rosterBusy && adminRoster.length === 0 ? (
                                <div className="py-8 text-center opacity-20 text-[9px] font-black uppercase tracking-widest">Loading roster…</div>
                            ) : adminRoster.length === 0 ? (
                                <div className="py-8 text-center opacity-20 text-[9px] font-black uppercase tracking-widest">No admins found</div>
                            ) : adminRoster.map(row => {
                                const isRootRow = row.role === 'root';
                                return (
                                    <div key={row.id} className={`p-4 rounded-2xl border flex flex-col md:flex-row md:items-center justify-between gap-3 ${isLight ? 'bg-white border-black/5' : 'bg-white/5 border-white/5'}`}>
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
                                            <div className={`text-[8px] font-bold uppercase font-mono opacity-40 mt-1 ${isLight ? 'text-black' : 'text-white'}`}>
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

            {/* Persistence Layer Status */}
            <footer className={`flex-none p-5 border-t backdrop-blur-3xl px-10 flex items-center justify-between ${isLight ? 'bg-white/50 border-[#1A6140]/10' : 'bg-[#050505]/50 border-white/5'}`}>
                <div className="flex items-center gap-8">
                    <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-[#1A6140]' : 'bg-red-500'} animate-pulse`} />
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Persistence Layer Stable</span>
                    </div>
                    <div className="h-4 w-px bg-white/5" />
                    <div className="flex items-center gap-3">
                        <Shield size={14} className="text-[#1A6140] opacity-50" />
                        <span className="text-[9px] font-black uppercase tracking-widest opacity-40">Admin Token Authorized</span>
                    </div>
                </div>
                <div className={`text-[9px] font-mono opacity-20 uppercase tracking-[0.5em]`}>
                    15Market_Citadel_v2.4.0
                </div>
            </footer>
        </div>
    );
}
