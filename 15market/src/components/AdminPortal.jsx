// Admin Portal gateway — Supabase Auth edition.
//
// Mounted at /admin. Two states:
//   1. Unauthenticated → branded login (email + password against Supabase
//      Auth). When NO admin exists yet, the same page shows the one-time
//      ROOT ADMIN BOOTSTRAP form — the first account to speckle this form is
//      the root admin, permanently.
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
        const res = await fetch(`${KEEPER_URL_ARC}/admin/auth/me`, {
            headers: { Authorization: `Bearer ${getSession()?.accessToken || ''}` }
        });
        if (res.status === 401) { clearSession(); setStatus('login'); return; }
        if (!res.ok) {
            setLoginError('Admin store unreachable. Try again in a moment.');
            setStatus('login');
            return;
        }
        const me = await res.json();
        setAuth(me);
        // Hydrate the bootstrap status too, so a failed /me reveal on the next
        // sign-out can show the right form.
        try {
            const sRes = await fetch(`${KEEPER_URL_ARC}/admin/auth/status`);
            if (sRes.ok) setBootStatus(await sRes.json());
        } catch (e) { /* bootstrap info optional */ }
        setStatus('ready');
    }, []);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            // Rotate a stale session first so a returning admin lands straight in.
            if (!sessionValid()) {
                try { await refreshSession(); } catch (e) { /* will fall through to login */ }
            }
            if (cancelled) return;
            if (sessionValid()) {
                await loadAuthContext();
            } else {
                setStatus('login');
                try {
                    const res = await fetch(`${KEEPER_URL_ARC}/admin/auth/status`);
                    if (res.ok) setBootStatus(await res.json());
                } catch (e) { /* bootstrap info optional */ }
            }
        })();
        // Opportunistic token rotation every 45 minutes so a long admin
        // session never hits a hard 401 mid-action.
        const iv = setInterval(() => { refreshSession().catch(() => {}); }, 45 * 60 * 1000);
        return () => { cancelled = true; clearInterval(iv); };
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
                body: JSON.stringify({ email: bootEmail.trim(), password: bootPassword })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Bootstrap failed');
            // Auto sign-in right away with the fresh credentials.
            await loginWithPassword(bootEmail.trim(), bootPassword);
            setBootPassword('');
            setBootMsg({ type: 'ok', text: 'Root admin created. Signing you in…' });
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
        setStatus('login');
        notify?.('Signed out of the admin portal', 'success');
    };

    const shell = `min-h-screen w-full flex items-center justify-center p-4 ${isLight ? 'bg-[#8CB09D]' : 'bg-[#050505]'}`;
    const card = `w-full max-w-md p-8 md:p-10 rounded-[36px] border flex flex-col gap-6 ${isLight ? 'bg-white/70 border-[#1A6140]/20 shadow-xl' : 'bg-[#0D0D0D]/90 border-white/5 shadow-2xl'} backdrop-blur-xl`;
    const text = isLight ? 'text-black' : 'text-white';
    const field = `w-full pl-12 pr-4 py-4 rounded-2xl border text-sm font-bold outline-none transition-all ${isLight ? 'bg-white border-black/10 focus:border-[#1A6140]' : 'bg-black/40 border-white/10 focus:border-[#1A6140]'} ${text}`;

    // The dashboard mounts full-bleed on its own shell (h-screen layout).
    if (status === 'ready' && auth) {
        return (
            <React.Suspense fallback={(
                <div className={shell} style={{ fontFamily: '"Comfortaa", "cursive"' }}>
                    <div className="flex flex-col items-center gap-4">
                        <Loader2 size={30} className="animate-spin text-[#1A6140]" />
                        <p className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Mounting ops console…</p>
                    </div>
                </div>
            )}>
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
        return (
            <div className={shell} style={{ fontFamily: '"Comfortaa", "cursive"' }}>
                <div className="flex flex-col items-center gap-4">
                    <Loader2 size={30} className="animate-spin text-[#1A6140]" />
                    <p className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Verifying session…</p>
                </div>
            </div>
        );
    }

    return (
        <div className={shell} style={{ fontFamily: '"Comfortaa", "cursive"' }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;700;900&display=swap');
                .admin-portal, .admin-portal * { font-family: 'Comfortaa', sans-serif; }
            `}</style>
            <AnimatePresence mode="wait">
            {(
                    <motion.div
                        key="auth"
                        initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -24 }}
                        transition={{ duration: 0.35, ease: 'circOut' }}
                        className="w-full max-w-md"
                    >
                        <div className={card}>
                            <div className="flex items-center justify-between -mb-2">
                                <button
                                    onClick={onBack || (() => window.location.href = '/')}
                                    className={`p-2.5 rounded-full border transition-all ${isLight ? 'bg-white border-black/10 text-black' : 'bg-white/5 border-white/5 text-white'} active:scale-95`}
                                >
                                    <ArrowLeft size={16} />
                                </button>
                                <div className="w-10 h-10 rounded-2xl bg-[#1A6140] flex items-center justify-center shadow-lg shadow-[#1A6140]/30">
                                    <Shield size={18} className="text-white" />
                                </div>
                            </div>
                            <div>
                                <h1 className={`text-2xl font-black uppercase tracking-tighter ${text}`}>
                                    {bootStatus && bootStatus.initialized === false ? (bootStatus.rootEmailLocked ? 'Root Setup' : 'Admin Setup') : 'Admin Portal'}
                                </h1>
                                <p className={`text-[10px] font-bold uppercase tracking-widest opacity-40 mt-1 ${text}`}>
                                    {bootStatus && bootStatus.initialized === false ? 'One-time — this account becomes the root admin' : 'Supabase Auth · email & password'}
                                </p>
                            </div>

                            {bootStatus && bootStatus.initialized === false ? (
                                <>
                                    {bootMsg && (
                                        <div className={`flex items-start gap-2 p-3 rounded-2xl text-[10px] font-bold uppercase tracking-wide ${bootMsg.type === 'ok' ? 'bg-[#1A6140]/10 text-[#1A6140]' : 'bg-red-500/10 text-red-400'}`}>
                                            {bootMsg.type === 'ok' ? <CheckCircle2 size={13} className="mt-0.5" /> : <AlertTriangle size={13} className="mt-0.5" />}
                                            {bootMsg.text}
                                        </div>
                                    )}
                                    <div className="relative">
                                        <Mail size={15} className={`absolute left-4 top-1/2 -translate-y-1/2 opacity-40 ${text}`} />
                                        <input value={bootEmail} onChange={e => setBootEmail(e.target.value)} placeholder="root@15market.com" className={field} />
                                    </div>
                                    <div className="relative">
                                        <Lock size={15} className={`absolute left-4 top-1/2 -translate-y-1/2 opacity-40 ${text}`} />
                                        <input type="password" value={bootPassword} onChange={e => setBootPassword(e.target.value)} placeholder="master password — min 8 chars" className={field} />
                                    </div>
                                    <button
                                        onClick={handleBootstrap}
                                        disabled={busy === 'bootstrap' || !bootEmail.trim() || bootPassword.length < 8}
                                        className="w-full py-4 bg-[#1A6140] text-white rounded-3xl font-black uppercase tracking-[0.25em] text-[10px] shadow-[0_20px_40px_-10px_rgba(26,97,64,0.35)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-3"
                                    >
                                        {busy === 'bootstrap' ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
                                        Create root admin
                                    </button>
                                    <p className={`text-[9px] font-bold opacity-30 leading-relaxed ${text}`}>
                                        This form is only shown while no admin exists. The account created here is the permanent root — only it can mint further admins and moderators.
                                    </p>
                                </>
                            ) : (
                                <>
                                    {loginError && (
                                        <div className="flex items-start gap-2 p-3 rounded-2xl bg-red-500/10 text-red-400 text-[10px] font-bold uppercase tracking-wide">
                                            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {loginError}
                                        </div>
                                    )}
                                    <div className="relative">
                                        <Mail size={15} className={`absolute left-4 top-1/2 -translate-y-1/2 opacity-40 ${text}`} />
                                        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="admin email" onKeyDown={e => e.key === 'Enter' && email && password && handleLogin()} className={field} />
                                    </div>
                                    <div className="relative">
                                        <Lock size={15} className={`absolute left-4 top-1/2 -translate-y-1/2 opacity-40 ${text}`} />
                                        <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="password" onKeyDown={e => e.key === 'Enter' && email && password && handleLogin()} className={field} />
                                    </div>
                                    <button
                                        onClick={handleLogin}
                                        disabled={busy === 'login' || !email.trim() || !password}
                                        className="w-full py-4 bg-[#1A6140] text-white rounded-3xl font-black uppercase tracking-[0.25em] text-[10px] shadow-[0_20px_40px_-10px_rgba(26,97,64,0.35)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-3"
                                    >
                                        {busy === 'login' ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
                                        Sign in
                                    </button>
                                    <p className={`text-[9px] font-bold opacity-30 leading-relaxed ${text}`}>
                                        Lost access? The root admin can be re-approached via Supabase Auth (Authentication → Users) to add a new admin.
                                    </p>
                                </>
                            )}
                        </div>
                    </motion.div>
            )}
            </AnimatePresence>
        </div>
    );
}
