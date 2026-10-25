// Admin Portal gateway — Supabase Auth edition.
//
// Mounted at /admin. Two states:
//   1. Unauthenticated → full-screen branded login (identical design language
//      to the user side's BrandedAuthPage): fixed inset-0, Comfortaa, centered
//      max-w-md column, no card box — content sits directly on the same
//      #050505 (dark) / #F4F7F5 (light) canvas. When NO admin exists yet, the
//      same screen shows the one-time ROOT ADMIN BOOTSTRAP form — the first
//      account to complete it is the root admin, permanently.
//   2. Authenticated → loads the role/permission snapshot (/admin/auth/me)
//      and mounts the full AdminDashboard with that context.
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Shield, Mail, Lock, Loader2, CheckCircle2, AlertTriangle, UserPlus } from "lucide-react";
import { KEEPER_URL_ARC } from "../constants";
import { getSession, sessionValid, clearSession, loginWithPassword, refreshSession } from "../utils/adminAuth";

const AdminDashboard = React.lazy(() => import("./AdminDashboard").then(m => ({ default: m.AdminDashboard })));

export function AdminPortal({ onBack, notify }) {
    const [status, setStatus] = useState('checking'); // checking | login | ready
    const [auth, setAuth] = useState(null);           // { role, isRoot, permissions, email }
    const [bootStatus, setBootStatus] = useState(null); // { initialized }
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [bootEmail, setBootEmail] = useState('');
    const [bootPassword, setBootPassword] = useState('');
    const [busy, setBusy] = useState('');
    const [loginError, setLoginError] = useState('');
    const [bootMsg, setBootMsg] = useState(null);
    const isLight = localStorage.getItem("15market_theme") === 'light';

    const loadAuthContext = useCallback(async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/admin/auth/me`, {
                headers: { Authorization: `Bearer ${getSession()?.accessToken || ''}` },
                signal: AbortSignal.timeout(8000)
            });
            if (res.status === 401) { clearSession(); setStatus('login'); return; }
            if (!res.ok) {
                setLoginError('Admin store unreachable. Try again in a moment.');
                setStatus('login');
                return;
            }
            const me = await res.json();
            setAuth(me);
            try {
                const sRes = await fetch(`${KEEPER_URL_ARC}/admin/auth/status`, {
                    signal: AbortSignal.timeout(5000)
                });
                if (sRes.ok) setBootStatus(await sRes.json());
            } catch (e) { /* bootstrap info optional */ }
            setStatus('ready');
        } catch (e) {
            // Timeout or network error — drop to login so the screen is never
            // stuck on a spinner indefinitely.
            clearSession();
            setLoginError('Backend unreachable. Check your connection and try again.');
            setStatus('login');
        }
    }, []);

    useEffect(() => {
        let cancelled = false;
        // Hard safety net: if status is still 'checking' after 10s, force login.
        const safetyTimer = setTimeout(() => {
            if (!cancelled) setStatus(s => s === 'checking' ? 'login' : s);
        }, 10000);

        (async () => {
            if (!sessionValid()) {
                try { await refreshSession(); } catch (e) { /* falls through to login */ }
            }
            if (cancelled) return;
            if (sessionValid()) {
                await loadAuthContext();
            } else {
                setStatus('login');
                try {
                    const res = await fetch(`${KEEPER_URL_ARC}/admin/auth/status`, {
                        signal: AbortSignal.timeout(5000)
                    });
                    if (res.ok) setBootStatus(await res.json());
                } catch (e) { /* bootstrap info optional */ }
            }
        })();
        const iv = setInterval(() => { refreshSession().catch(() => {}); }, 45 * 60 * 1000);
        return () => { cancelled = true; clearInterval(iv); clearTimeout(safetyTimer); };
    }, [loadAuthContext]);

    const handleLogin = async () => {
        setLoginError('');
        setBusy('login');
        try {
            await loginWithPassword(email.trim(), password);
            setPassword('');
            await loadAuthContext();
        } catch (e) {
            setLoginError(e.message || 'Login failed');
        } finally {
            setBusy('');
        }
    };

    const handleBootstrap = async () => {
        setBootMsg(null);
        setBusy('bootstrap');
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/admin/auth/bootstrap`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: bootEmail, password: bootPassword })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Bootstrap failed');
            // Auto sign-in right away with the fresh credentials.
            await loginWithPassword(bootEmail, bootPassword);
            setBootPassword('');
            await loadAuthContext();
        } catch (e) {
            setBootMsg({ type: 'error', text: e.message || 'Bootstrap failed' });
        } finally {
            setBusy('');
        }
    };

    const signOut = () => {
        clearSession();
        setAuth(null);
        setBootStatus(null);
        setStatus('login');
        notify?.('Signed out of the admin portal', 'success');
    };

    // ─── Authed → full dashboard (its own full-bleed shell) ──────────────
    if (status === 'ready' && auth) {
        return (
            <React.Suspense fallback={<FullScreenSpinner isLight={isLight} label="Mounting ops console…" />}>
                <AdminDashboard
                    onBack={onBack || (() => window.location.href = '/')}
                    theme={localStorage.getItem("15market_theme") || "dark"}
                    notify={notify}
                    auth={{ ...auth, signOut }}
                />
            </React.Suspense>
        );
    }
    if (status !== 'login') {
        return <div style={{ fontFamily: '"Comfortaa", cursive' }}><FullScreenSpinner isLight={isLight} label="Verifying session…" standalone /></div>;
    }

    // ─── Login / one-time root setup — full screen, user-side design ─────
    const needsBootstrap = bootStatus && bootStatus.initialized === false;
    const ink = isLight ? 'text-[#0a261a]' : 'text-white';
    const inkSoft = isLight ? 'text-[#0a261a]/50' : 'text-white/40';
    const inputCls = `w-full py-4 px-6 rounded-2xl border outline-none text-lg font-black transition-all placeholder:opacity-30 tracking-normal ${
        isLight ? 'bg-gray-50 border-gray-200 text-[#0a261a] focus:border-[#1A6140] focus:shadow-[0_0_20px_-6px_rgba(26,97,64,0.4)]'
                : 'bg-white/5 border-white/10 text-white focus:border-[#1A6140] focus:shadow-[0_0_20px_-6px_rgba(26,97,64,0.45)]'
    }`;
    const stepAnim = { initial: { opacity: 0, x: 24 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -24 }, transition: { duration: 0.2 } };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.25 }}
            className={`fixed inset-0 z-[600] flex flex-col ${isLight ? 'bg-[#F4F7F5]' : 'bg-[#050505]'}`}
            style={{ fontFamily: '"Comfortaa", cursive' }}
        >
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;700;900&display=swap');
                .admin-portal, .admin-portal * { font-family: 'Comfortaa', sans-serif; }
            `}</style>

            {/* Ambient green glow — mirrors the user app's background flair */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div className={`absolute top-[-12%] right-[-8%] w-[520px] h-[520px] rounded-full blur-[130px] ${isLight ? 'bg-[#1A6140]/10' : 'bg-[#1A6140]/8'}`} />
                <div className={`absolute bottom-[-12%] left-[-8%] w-[520px] h-[520px] rounded-full blur-[130px] ${isLight ? 'bg-[#1A6140]/6' : 'bg-[#1A6140]/5'}`} />
            </div>

            {/* Top bar — back chip only; the brand shows as the logo below */}
            <div className="flex-none flex items-center justify-between px-5 z-10" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
                <button
                    onClick={onBack || (() => window.location.href = '/')}
                    aria-label="Back"
                    className={`w-10 h-10 rounded-full border flex items-center justify-center active:scale-95 ${isLight ? 'border-gray-200 text-[#0a261a]/60' : 'border-white/10 text-white/60'}`}
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="w-10" />
            </div>

            {/* Centered column — content directly on the canvas, no card.
                justify-start + auto margins so a tall form scrolls instead of
                clipping its heading like justify-center would. */}
            <div className="flex-1 overflow-y-auto flex flex-col px-6 py-10 relative z-10">
                <div className="w-full max-w-md flex flex-col items-center m-auto">
                    <AnimatePresence mode="wait">
                        <motion.div key={needsBootstrap ? 'bootstrap' : 'login'} {...stepAnim} className="w-full flex flex-col items-center">
                            {/* Brand — the same wordmark the user app uses, theme-picked,
                                with an ADMIN badge split off by a vertical hairline */}
                            <div className="flex items-center gap-4 mb-8">
                                <img
                                    src={isLight ? '/goblogo.png' : '/gowlogo.png'}
                                    alt="15market"
                                    className="h-[40px] w-[140px] object-cover object-center flex-none md:h-[46px] md:w-[160px]"
                                    style={{ filter: 'drop-shadow(0 0 26px rgba(26,97,64,0.45))' }}
                                />
                                <span className={`w-px h-10 flex-none ${isLight ? 'bg-black/15' : 'bg-white/20'}`} />
                                <span className="text-[11px] font-black uppercase tracking-[0.35em] text-[#1A6140] flex-none">Admin</span>
                            </div>

                            <div className="w-full flex flex-col gap-3">
                                {needsBootstrap ? (
                                    <>
                                        {bootMsg && (
                                            <div className={`w-full flex items-start gap-2 p-3 rounded-2xl text-xs font-bold ${bootMsg.type === 'ok' ? 'bg-[#1A6140]/10 text-[#1A6140]' : 'bg-red-500/10 text-red-400'} shadow-[0_0_25px_-12px_rgba(0,0,0,0.5)]`}>
                                                {bootMsg.type === 'ok' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                                                {bootMsg.text}
                                            </div>
                                        )}
                                        <input
                                            autoComplete="email"
                                            value={bootEmail}
                                            onChange={e => setBootEmail(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && bootEmail && bootPassword.length >= 8 && handleBootstrap()}
                                            placeholder="Email address"
                                            className={`${inputCls} !tracking-normal !text-base`}
                                        />
                                        <input
                                            type="password"
                                            autoComplete="new-password"
                                            value={bootPassword}
                                            onChange={e => setBootPassword(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && bootEmail && /(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/.test(bootPassword) && handleBootstrap()}
                                            placeholder="Password (8+, Aa1!)"
                                            className={`${inputCls} !tracking-normal !text-base`}
                                        />
                                        <button
                                            onClick={handleBootstrap}
                                            disabled={busy === 'bootstrap' || !bootEmail.trim() || bootPassword.length < 8 || !(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/.test(bootPassword))}
                                            className="w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 bg-[#1A6140] text-white shadow-[0_0_35px_-8px_rgba(26,97,64,0.6)] hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                                        >
                                            {busy === 'bootstrap' ? <Loader2 size={18} className="animate-spin" /> : <><UserPlus size={18} /> Continue</>}
                                        </button>
                                        <p className={`text-[10px] font-bold text-center leading-relaxed mt-1 ${inkSoft}`}>
                                            Secure your account with a password. One-time setup.
                                        </p>
                                    </>
                                ) : (
                                    <>
                                        {loginError && (
                                            <div className="w-full flex items-start gap-2 p-3 rounded-2xl bg-red-500/10 text-red-400 text-xs font-bold shadow-[0_0_25px_-12px_rgba(0,0,0,0.5)]">
                                                <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {loginError}
                                            </div>
                                        )}
                                        <input
                                            type="email"
                                            autoComplete="email"
                                            value={email}
                                            onChange={e => setEmail(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && email && password && handleLogin()}
                                            placeholder="Email address"
                                            className={`${inputCls} !tracking-normal !text-base`}
                                        />
                                        <input
                                            type="password"
                                            autoComplete="current-password"
                                            value={password}
                                            onChange={e => setPassword(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && email && password && handleLogin()}
                                            placeholder="Password"
                                            className={`${inputCls} !tracking-normal !text-base`}
                                        />
                                        <button
                                            onClick={handleLogin}
                                            disabled={busy === 'login' || !email.trim() || !password}
                                            className="w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 bg-[#1A6140] text-white shadow-[0_0_35px_-8px_rgba(26,97,64,0.6)] hover:brightness-110 active:scale-[0.98] disabled:opacity-40"
                                        >
                                            {busy === 'login' ? <Loader2 size={18} className="animate-spin" /> : <><Lock size={18} /> Sign in</>}
                                        </button>
                                    </>
                                )}
                            </div>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </motion.div>
    );
}

function FullScreenSpinner({ isLight, label, standalone = false }) {
    return (
        <div
            className={`${standalone ? 'fixed inset-0 z-[600]' : 'min-h-screen w-full'} flex items-center justify-center ${isLight ? 'bg-[#F4F7F5]' : 'bg-[#050505]'}`}
        >
            <div className="flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-3xl bg-[#1A6140] flex items-center justify-center shadow-[0_0_45px_-8px_rgba(26,97,64,0.65)]">
                    <Loader2 size={22} className="animate-spin text-white" />
                </div>
                <p className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'}`}>{label}</p>
            </div>
        </div>
    );
}
