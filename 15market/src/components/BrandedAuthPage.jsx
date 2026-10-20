import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy, useLoginWithEmail, useLoginWithOAuth, useWallets } from '@privy-io/react-auth';
import { useConnect, useAccount } from 'wagmi';
import { injected } from 'wagmi/connectors';
import { Mail, ArrowLeft, Loader2, Check, Wallet } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';
import { CountrySelect } from './CountrySelect';

/**
 * BrandedAuthPage — fully 15market-owned auth, fullscreen on every viewport.
 *
 * Privy owns authentication end to end: email one-time code, Google, Discord
 * and external wallet. There are NO passwords (Privy has no password auth, and
 * Supabase is only the database — see the backend note in nexus-core/index.js).
 *
 * Entry offers LOGIN and SIGNUP separately. Signup is a wizard:
 *   country → methods (email field, then Google / Discord / wallet below) →
 *   email: code verify → bio → username → trading-wallet finale
 *   wallet: connect → first name + username → finale (wallet is the main auth)
 *   google/discord: details prefilled from the provider → finale
 *
 * Login is email → code, plus the OAuth/wallet buttons. No Privy modal anywhere.
 *
 * A returning email user who starts the signup wizard is detected right after
 * the code verifies (their profile already exists) and is handed straight into
 * the app instead of being walked through onboarding again.
 *
 * Wallet model: email/google/discord accounts get the trading wallet ONLY;
 * only wallet-connect gets two wallets (connected = main, derived = trading).
 */
const inputCls = (isLight) => `w-full py-4 px-6 rounded-2xl border outline-none text-lg font-black transition-all placeholder:opacity-30 ${
    isLight
        ? 'bg-gray-50 border-gray-200 text-black focus:border-[#1A6140]'
        : 'bg-white/5 border-white/10 text-white focus:border-[#1A6140]'
}`;

const btnPrimary = 'w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 bg-[#1A6140] text-white shadow-xl hover:brightness-110 active:scale-[0.98] disabled:opacity-40';

const btnGhost = (isLight) => `w-full py-4 rounded-2xl font-black uppercase tracking-widest transition-all flex items-center justify-center gap-3 border active:scale-[0.98] disabled:opacity-40 ${
    isLight
        ? 'bg-white border-gray-200 text-[#0a261a] hover:border-[#1A6140] shadow-sm'
        : 'bg-white/5 border-white/10 text-white hover:border-[#1A6140]/60'
}`;

const stepAnim = {
    initial: { opacity: 0, x: 24 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -24 },
    transition: { duration: 0.2 },
};

// Live availability line under username fields. Shows nothing until typed.
// The hint itself fails open (a stale "Available" on a network blip is not
// worth blocking the field), but the actual write is gated server-side and by
// the DB unique index, so a taken name can never be saved.
function UsernameStatus({ value, check, isLight }) {
    const v = String(value || '').trim();
    if (!v || check.forValue !== v) return null;
    const base = 'text-[11px] font-black mt-2';
    if (check.state === 'checking') {
        return <div className={`${base} ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>Checking availability…</div>;
    }
    if (check.state === 'taken') {
        return <div className={`${base} text-[#EF5350]`}>That username is taken.</div>;
    }
    if (check.state === 'free') {
        return <div className={`${base} text-[#1A6140]`}>Available ✓</div>;
    }
    return <div className={`${base} ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>3–20 letters, numbers or underscores.</div>;
}

export function BrandedAuthPage({ theme, onClose, onAuthenticated, initialStep }) {
    const isLight = theme === 'light';
    const { authenticated, user } = usePrivy();
    const { address: wagmiAddress } = useAccount();
    const { sendCode, loginWithCode } = useLoginWithEmail();
    const { initOAuth } = useLoginWithOAuth();
    const { connect, isPending: isWalletPending } = useConnect();

    // Wizard state. Header buttons land directly: Login -> login page,
    // Signup -> country first (entry only exists as a fallback).
    //
    // OAuth on mobile often leaves the page entirely (redirect) and comes
    // back to a fresh mount. Progress (never secrets: no password, no OTP)
    // persists in sessionStorage so the wizard resumes instead of restarting.
    const PROGRESS_KEY = '15m-signup-progress';
    const readProgress = () => {
        try {
            const saved = JSON.parse(sessionStorage.getItem(PROGRESS_KEY) || 'null');
            if (saved && typeof saved === 'object') return saved;
        } catch {}
        return {};
    };
    const [step, setStep] = useState(() => {
        if (initialStep === 'login') return 'login';
        if (initialStep !== 'signup') return 'entry';
        const s = readProgress().step;
        return ['country', 'methods', 'code', 'bio', 'username', 'names'].includes(s) ? s : 'country';
    }); // entry|login|country|methods|code|bio|username|finale
    const [method, setMethod] = useState(() => readProgress().method || null); // email|google|discord|wallet
    const [country, setCountry] = useState(() => readProgress().country || '');
    const [email, setEmail] = useState(() => readProgress().email || '');
    const [code, setCode] = useState('');
    const [firstName, setFirstName] = useState(() => readProgress().firstName || '');
    const [lastName, setLastName] = useState(() => readProgress().lastName || '');
    const [username, setUsername] = useState(() => readProgress().username || '');
    useEffect(() => {
        // Persist non-secret progress for redirect survival.
        try {
            if (step === 'entry' || step === 'login' || step === 'finale') {
                sessionStorage.removeItem(PROGRESS_KEY);
            } else {
                sessionStorage.setItem(PROGRESS_KEY, JSON.stringify({ step, method, country, email, firstName, lastName, username }));
            }
        } catch {}
    }, [step, method, country, email, firstName, lastName, username]);
    const [loginEmail, setLoginEmail] = useState('');
    const [busy, setBusy] = useState(null);
    const [error, setError] = useState('');
    // Info line (not an error): e.g. "you already have an account".
    const [notice, setNotice] = useState('');
    // Login via email code. When true the code step hands back to the login
    // handoff (existing account) instead of continuing into the signup wizard.
    const [codeForLogin, setCodeForLogin] = useState(false);
    // Policies + 18 gate: every signup path stays disabled until this is on.
    const [acceptedPolicies, setAcceptedPolicies] = useState(false);
    const requirePolicies = () => {
        if (acceptedPolicies) return true;
        fail('Accept the policies and confirm you are 18+ to continue.');
        return false;
    };
    const [assignedWallet, setAssignedWallet] = useState('');
    const savedOnce = useRef(false);
    const codeRefs = useRef([]);

    const fail = (msg) => { setError(msg); setNotice(''); setBusy(null); };
    const clearErr = () => { setError(''); setNotice(''); };

    // Progress markers (dots) for the signup wizard. Totals follow the
    // chosen path: email 6 screens, OAuth 4, wallet 3. Entry, login and
    // finale show none.
    const getMarkers = () => {
        if (step === 'country') return { index: 0, total: 5 };
        if (step === 'methods') return { index: 1, total: 5 };
        if (step === 'code') return { index: 2, total: 5 };
        if (step === 'bio') return method === 'email'
            ? { index: 3, total: 5 }
            : { index: 2, total: 4 };
        if (step === 'username') return method === 'email'
            ? { index: 4, total: 5 }
            : { index: 3, total: 4 };
        if (step === 'names') return { index: 2, total: 3 };
        return null;
    };
    const markers = getMarkers();

    const goBack = () => {
        clearErr();
        if (step === 'entry' || step === 'login' || step === 'finale') { quit(); return; }
        if (step === 'country') { setStep('entry'); return; }
        if (step === 'methods') { setStep('country'); return; }
        if (step === 'code') { setStep('methods'); return; }
        if (step === 'bio' || step === 'names') { setStep('methods'); return; }
        if (step === 'username') { setStep('bio'); return; }
    };

    // A completed PRIVY identity hands off — but ONLY from terminal states.
    // During the signup wizard (code and beyond) an authenticated flip is
    // expected mid-flow (OTP verified, OAuth returned). Closing there used
    // to yeet fresh users straight to trading, skipping bio and username
    // entirely. The wizard closes itself at the finale; the login
    // page closes the moment its login lands. (Deliberately NOT wagmi
    // isConnected either: auto-reconnect lands on its own schedule and used
    // to slam the page shut on open, looking like dead buttons.)
    useEffect(() => {
        if (authenticated && (step === 'login' || step === 'entry')) onAuthenticated?.();
    }, [authenticated, step, onAuthenticated]);

    // Redirect return: fresh mount, already authenticated, wizard restored
    // to where the redirect killed it — move past the methods screen so one
    // more OAuth tap isn't needed.
    useEffect(() => {
        if (authenticated && step === 'methods' && (method === 'google' || method === 'discord')) {
            setStep('bio');
        }
    }, [authenticated, step, method]);

    const quit = () => {
        try { sessionStorage.removeItem(PROGRESS_KEY); } catch {}
        onClose();
    };

    // OAuth prefill: names arrive with the provider profile.
    useEffect(() => {
        if (!authenticated || method === 'email' || method === 'wallet') return;
        try {
            const full = user?.google?.name || user?.discord?.username || '';
            if (full && !firstName) {
                const parts = String(full).split(/\s+/);
                setFirstName(parts[0] || '');
                if (!lastName && parts.length > 1) setLastName(parts.slice(1).join(' '));
            }
            const mail = user?.google?.email || user?.email?.address || '';
            if (mail && !email) setEmail(mail);
        } catch {}
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authenticated]);

    // Identity address for profile + trading-wallet assignment: connected
    // wallet first, else the Privy embedded wallet (email/social logins
    // have no wagmi address — without this fallback their finale could never
    // save).
    const { wallets } = useWallets();
    const embeddedAddress = (wallets || []).find(w => w.walletClientType === 'privy')?.address || null;
    const identityAddress = wagmiAddress || embeddedAddress || null;
    // Live refs so the waiter below always reads the newest values, not the
    // render closure it was created in.
    const wagmiRef = useRef(null);
    wagmiRef.current = wagmiAddress || null;
    const walletsRef = useRef([]);
    walletsRef.current = wallets || [];
    // Embedded wallets provision a few seconds AFTER login. The finale used
    // to fail instantly here ("wallet not ready") instead of waiting — now it
    // polls briefly for the address to appear.
    const resolveIdentityAddress = (timeoutMs = 20000) => new Promise((resolveAddr, rejectAddr) => {
        const started = Date.now();
        const tick = () => {
            const w = wagmiRef.current;
            const emb = (walletsRef.current || []).find(x => x?.walletClientType === 'privy')?.address || null;
            const addr = w || emb;
            if (addr) return resolveAddr(addr);
            if (Date.now() - started >= timeoutMs) {
                return rejectAddr(new Error('Wallet not ready yet. Check your connection and retry.'));
            }
            setTimeout(tick, 500);
        };
        tick();
    });

    // After Privy signs the user in, ask the backend whether this identity is
    // already onboarded. Used to hand a returning user who restarted the signup
    // wizard straight into the app. Fails open (treats them as new) so a
    // backend blip can never lock a brand-new user out of finishing signup.
    const hasOnboardedProfile = async () => {
        try {
            const addr = await resolveIdentityAddress();
            if (!addr) return false;
            const res = await fetch(`${KEEPER_URL_ARC}/profiles/${String(addr).toLowerCase()}`);
            if (!res.ok) return false;
            const data = await res.json().catch(() => null);
            return !!data?.onboarded;
        } catch {
            return false;
        }
    };

    // Username availability: debounced server check, fail-open. Guards read
    // nameCheck synchronously; the checker re-arms on every keystroke.
    const checkTimer = useRef(null);
    const [nameCheck, setNameCheck] = useState({ state: 'idle', forValue: '' });
    const checkUsername = (value, addrOverride) => {
        const v = String(value || '').trim();
        if (!v) { setNameCheck({ state: 'idle', forValue: '' }); return; }
        if (!/^[A-Za-z0-9_]{3,20}$/.test(v)) {
            setNameCheck({ state: 'invalid', forValue: v });
            return;
        }
        setNameCheck({ state: 'checking', forValue: v });
        if (checkTimer.current) clearTimeout(checkTimer.current);
        checkTimer.current = setTimeout(async () => {
            try {
                const controller = new AbortController();
                const tid = setTimeout(() => controller.abort(), 8000);
                const addr = addrOverride || identityAddress || '';
                const res = await fetch(
                    `${KEEPER_URL_ARC}/profiles/username/${encodeURIComponent(v)}${addr ? `?address=${encodeURIComponent(String(addr).toLowerCase())}` : ''}`,
                    { signal: controller.signal }
                );
                clearTimeout(tid);
                const data = await res.json().catch(() => ({}));
                setNameCheck((cur) => cur.forValue === v
                    ? { state: !res.ok || data.available ? 'free' : 'taken', forValue: v, degraded: !!data.degraded }
                    : cur);
            } catch {
                setNameCheck((cur) => cur.forValue === v ? { state: 'free', forValue: v, degraded: true } : cur);
            }
        }, 500);
    };
    // Synchronous gate for Continue/finish handlers. Re-arms the check when
    // the state is stale so a fast clicker waits one beat instead of slipping
    // through — or past a taken name.
    const ensureNameFree = () => {
        const v = username.trim();
        if (!/^[A-Za-z0-9_]{3,20}$/.test(v)) {
            fail('Usernames are 3–20 letters, numbers or underscores.');
            return false;
        }
        if (nameCheck.state === 'free' && nameCheck.forValue === v) return true;
        checkUsername(v);
        fail(nameCheck.state === 'taken' && nameCheck.forValue === v
            ? 'That username is taken. Try another.'
            : 'Checking availability — one moment…');
        return false;
    };

    // Returns { data, address } — callers must use the RETURNED address, not
    // the render-closure identityAddress (wallets can populate between renders).
    const saveProfile = async (extra = {}) => {
        const addr = extra.address || identityAddress || await resolveIdentityAddress();
        const res = await fetch(`${KEEPER_URL_ARC}/profiles`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: String(addr).toLowerCase(),
                username: username.trim(),
                firstName: firstName.trim() || undefined,
                lastName: lastName.trim() || undefined,
                country: country || undefined,
                onboarded: true,
                onboardedAt: Date.now(),
                ...extra.fields,
            }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || 'Could not save profile.');
        try {
            localStorage.setItem(`15market_onboarded_${String(addr).toLowerCase()}`, 'true');
            localStorage.setItem(`15market_profile_exists_${String(addr).toLowerCase()}`, 'true');
        } catch {}
        return { data, address: addr };
    };

    // ── Email signup ────────────────────────────────────────────────
    // Send the one-time code. Privy logs an existing email straight in and
    // creates a new user otherwise; a returning user who lands here is caught
    // right after the code verifies (see handleVerifyCode).
    const handleSendCode = async () => {
        if (!requirePolicies()) return;
        const clean = email.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return fail('Enter a valid email address.');
        setError('');
        setBusy('email');
        try {
            await sendCode({ email: clean });
            setStep('code');
        } catch (e) {
            fail(e?.message || 'Could not send a code. Check the address and retry.');
            return;
        }
        setBusy(null);
    };

    // Send a code for an EXISTING account (login path). This is the login
    // screen's primary action.
    const sendLoginCode = async () => {
        const clean = loginEmail.trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) return fail('Enter your email address first.');
        setError('');
        setBusy('login-code');
        try {
            await sendCode({ email: clean });
            setEmail(clean);
            setCodeForLogin(true);
            setStep('code');
        } catch (e) {
            fail(e?.message || 'Could not send a code. Check the address and retry.');
            return;
        }
        setBusy(null);
    };

    const handleVerifyCode = async (override) => {
        const value = (override ?? code).trim();
        if (value.length < 6) return fail('Enter the 6-digit code from your email.');
        setError('');
        setBusy('code');
        try {
            await loginWithCode({ code: value });
            // Login-code path: the user is now authenticated; hand back to the
            // login step so the handoff effect closes the page.
            if (codeForLogin) {
                setCodeForLogin(false);
                setStep('login');
                setBusy(null);
                return;
            }
            // Signup path: the code signed the user into Privy. If they already
            // have an onboarded profile this is really a LOGIN (they restarted
            // the signup wizard) — send them into the app instead of walking
            // them through onboarding again, which used to clobber profiles and
            // make their own username look "taken".
            if (await hasOnboardedProfile()) {
                setBusy(null);
                onAuthenticated?.();
                return;
            }
            setStep('bio'); // authenticated flips too; bio continues the wizard
        } catch (e) {
            fail(e?.message || 'That code did not work. Request a fresh one.');
            return;
        }
        setBusy(null);
    };

    // Individual OTP boxes: auto-advance, backspace rewind, paste-to-fill,
    // auto-submit on the sixth digit.
    const setCodeAt = (i, ch) => {
        const d = String(ch || '').replace(/\D/g, '').slice(-1);
        const arr = code.split('');
        while (arr.length < 6) arr.push('');
        arr[i] = d;
        const next = arr.join('').slice(0, 6);
        setCode(next);
        clearErr();
        if (d && i < 5) {
            codeRefs.current[i + 1]?.focus();
        }
        if (next.length === 6 && !busy) {
            handleVerifyCode(next);
        }
    };
    const handleCodeKeyDown = (i, e) => {
        if (e.key === 'Backspace' && !code[i] && i > 0) {
            e.preventDefault();
            const arr = code.split('');
            arr[i - 1] = '';
            setCode(arr.join(''));
            codeRefs.current[i - 1]?.focus();
        }
    };
    const handleCodePaste = (e) => {
        e.preventDefault();
        const digits = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
        if (!digits) return;
        setCode(digits);
        clearErr();
        const nextIdx = Math.min(digits.length, 5);
        codeRefs.current[nextIdx]?.focus();
        if (digits.length === 6 && !busy) {
            handleVerifyCode(digits);
        }
    };

    // ── OAuth (google / discord) ────────────────────────────────────
    // From the signup wizard we continue into the wizard (bio next). From the
    // LOGIN screen we must NOT: the policy checkbox is never shown there, and
    // routing to bio would drag a returning user through signup again. On login
    // we just let the authenticated flip close the page.
    const handleOAuth = async (provider, { enforcePolicies = true, continueSignup = true } = {}) => {
        if (enforcePolicies && !requirePolicies()) return;
        setError('');
        setBusy(provider);
        try {
            await initOAuth({ provider });
            // Redirect/popup completes → authenticated flips → prefill effect
            // runs → user continues at bio (signup) or the page closes (login).
            if (continueSignup) setStep('bio');
        } catch (e) {
            fail(e?.message || `${provider} sign-in failed. Try email instead.`);
            return;
        }
        setBusy(null);
    };

    // ── Wallet ──────────────────────────────────────────────────────
    const handleWallet = (next, { enforcePolicies = true } = {}) => {
        if (enforcePolicies && !requirePolicies()) return;
        setError('');
        if (typeof window === 'undefined' || !window.ethereum) {
            return fail('No browser wallet detected. Install MetaMask or Rabby first.');
        }
        setBusy('wallet');
        connect(
            { connector: injected() },
            {
                onSuccess: () => { setBusy(null); setStep(next); },
                onError: (e) => fail(e?.message || 'Wallet connection was rejected.'),
            }
        );
    };

    // ── Signup finale: profile only (Privy owns auth; no passwords) ─────
    const finishSignup = async () => {
        if (!ensureNameFree()) return;
        setError('');
        setBusy('finale');
        try {
            const { data } = await saveProfile();
            setAssignedWallet(data.walletAddress || '');
            setStep('finale');
        } catch (e) {
            fail(e?.message || 'Could not finish setup. Retry.');
            return;
        }
        setBusy(null);
    };

    // ── Wallet signup finale: first name + username only ────────────
    const finishWalletSignup = async () => {
        if (!firstName.trim()) return fail('Enter your first name.');
        if (!username.trim()) return fail('Choose a username.');
        // Same uniqueness gate as the email path — a wallet signup must not be
        // able to claim a taken username either.
        if (!ensureNameFree()) return;
        setError('');
        setBusy('finale');
        try {
            const { data } = await saveProfile({ address: wagmiAddress });
            setAssignedWallet(data.walletAddress || '');
            setStep('finale');
        } catch (e) {
            fail(e?.message || 'Could not finish setup. Retry.');
            return;
        }
        setBusy(null);
    };

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className={`fixed inset-0 z-[600] flex flex-col ${isLight ? 'bg-[#F4F7F5]' : 'bg-[#050505]'}`}
            style={{ fontFamily: '"Comfortaa", cursive' }}
        >
            <div className="flex items-center justify-between px-5" style={{ paddingTop: 'max(1.25rem, env(safe-area-inset-top))' }}>
                <button
                    onClick={goBack}
                    aria-label="Back"
                    className={`w-10 h-10 rounded-full border flex items-center justify-center active:scale-95 ${isLight ? 'border-gray-200 text-[#0a261a]/60' : 'border-white/10 text-white/60'}`}
                >
                    <ArrowLeft size={18} />
                </button>
                <div className="w-10" aria-hidden="true" />
            </div>

            <div className="flex-1 overflow-y-auto flex flex-col items-center justify-start px-6 pt-8 pb-8">
                <div className="w-full max-w-md flex flex-col items-center">
                    {markers && (
                        <div className="flex items-center gap-1.5 mb-6" aria-hidden="true">
                            {Array.from({ length: markers.total }).map((_, i) => (
                                <div
                                    key={i}
                                    className={`h-2 rounded-full transition-all duration-300 ${
                                        i < markers.index
                                            ? 'w-2 bg-[#1A6140]'
                                            : i === markers.index
                                              ? 'w-6 bg-[#1A6140]'
                                              : `w-2 ${isLight ? 'bg-black/15' : 'bg-white/15'}`
                                    }`}
                                />
                            ))}
                        </div>
                    )}
                    <AnimatePresence mode="wait">
                        {/* ── ENTRY: Login | Signup ── */}
                        {step === 'entry' && (
                            <motion.div key="entry" {...stepAnim} className="w-full flex flex-col items-center">
                                <h1 className={`text-3xl font-black uppercase tracking-tighter text-center ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>15market</h1>
                                <p className={`text-xs font-bold uppercase tracking-widest mt-2 mb-8 text-center ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>
                                    Real-time prediction markets
                                </p>
                                <div className="w-full flex flex-col gap-3">
                                    <button onClick={() => { clearErr(); setStep('country'); setMethod(null); }} className={btnPrimary}>Signup</button>
                                    <button onClick={() => { clearErr(); setStep('login'); }} className={btnGhost(isLight)}>Login</button>
                                </div>
                            </motion.div>
                        )}

                        {/* ── LOGIN ── */}
                        {step === 'login' && (
                            <motion.div key="login" {...stepAnim} className="w-full flex flex-col items-center">
                                <h1 className={`text-2xl font-black uppercase tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>Welcome back</h1>
                                <p className={`text-xs font-bold uppercase tracking-widest mt-2 mb-6 ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>Login to your account</p>
                                <div className="w-full flex flex-col gap-3">
                                    <input type="email" autoComplete="email" value={loginEmail} onChange={(e) => { setLoginEmail(e.target.value); clearErr(); }} onKeyDown={(e) => { if (e.key === 'Enter') sendLoginCode(); }} placeholder="Email address" className={`${inputCls(isLight)} !tracking-normal !text-base`} />
                                    <button onClick={sendLoginCode} disabled={busy !== null} className={btnPrimary}>
                                        {busy === 'login-code' ? <Loader2 size={18} className="animate-spin" /> : <><Mail size={18} /> Continue with email</>}
                                    </button>
                                    <div className="flex items-center gap-3 my-1">
                                        <div className={`flex-1 h-px ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-[#0a261a]/40' : 'text-white/30'}`}>or</span>
                                        <div className={`flex-1 h-px ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
                                    </div>
                                    <button onClick={() => handleOAuth('google', { enforcePolicies: false, continueSignup: false })} disabled={busy !== null} className={btnGhost(isLight)}>
                                        {busy === 'google' ? <Loader2 size={18} className="animate-spin" /> : <><span className="text-[18px] font-black leading-none">G</span> Google</>}
                                    </button>
                                    <button onClick={() => handleOAuth('discord', { enforcePolicies: false, continueSignup: false })} disabled={busy !== null} className={btnGhost(isLight)}>
                                        {busy === 'discord' ? <Loader2 size={18} className="animate-spin" /> : 'Discord'}
                                    </button>
                                    <button onClick={() => handleWallet('login', { enforcePolicies: false })} disabled={busy !== null || isWalletPending} className={btnGhost(isLight)}>
                                        {busy === 'wallet' || isWalletPending ? <Loader2 size={18} className="animate-spin" /> : 'Connect wallet'}
                                    </button>
                                    <button onClick={() => { clearErr(); setStep('country'); setMethod(null); }} className={`text-[11px] font-black uppercase tracking-widest mt-1 ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>
                                        New here? Create account
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* ── SIGNUP 1: country first ── */}
                        {step === 'country' && (
                            <motion.div key="country" {...stepAnim} className="w-full flex flex-col items-center">
                                <CountrySelect theme={theme} value={country} onChange={(code) => { setCountry(code); clearErr(); }} />
                                <button onClick={() => { if (!country) { setError('Pick your country to continue.'); return; } clearErr(); setStep('methods'); }} className={`${btnPrimary} mt-4`}>Continue</button>
                            </motion.div>
                        )}

                        {/* ── SIGNUP 2: email on top, Google / Discord / wallet below ── */}
                        {step === 'methods' && (
                            <motion.div key="methods" {...stepAnim} className="w-full flex flex-col items-center">
                                <h1 className={`text-2xl font-black uppercase tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>Create account</h1>
                                <p className={`text-xs font-bold uppercase tracking-widest mt-2 mb-6 ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>How do you want in?</p>
                                <div className="w-full flex flex-col gap-3">
                                    <input type="email" autoComplete="email" value={email} onChange={(e) => { setEmail(e.target.value); clearErr(); }} onKeyDown={(e) => { if (e.key === 'Enter') { setMethod('email'); handleSendCode(); } }} placeholder="Email address" className={`${inputCls(isLight)} !tracking-normal !text-base`} />
                                    <button onClick={() => { setMethod('email'); handleSendCode(); }} disabled={busy !== null || !acceptedPolicies} className={btnPrimary}>
                                        {busy === 'email' ? <Loader2 size={18} className="animate-spin" /> : <><Mail size={18} /> Continue with email</>}
                                    </button>
                                    <div className="flex items-center gap-3 my-1">
                                        <div className={`flex-1 h-px ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
                                        <span className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-[#0a261a]/40' : 'text-white/30'}`}>or</span>
                                        <div className={`flex-1 h-px ${isLight ? 'bg-black/10' : 'bg-white/10'}`} />
                                    </div>
                                    <button onClick={() => { setMethod('google'); handleOAuth('google'); }} disabled={busy !== null || !acceptedPolicies} className={btnGhost(isLight)}>
                                        {busy === 'google' ? <Loader2 size={18} className="animate-spin" /> : <><span className="text-[18px] font-black leading-none">G</span> Google</>}
                                    </button>
                                    <button onClick={() => { setMethod('discord'); handleOAuth('discord'); }} disabled={busy !== null || !acceptedPolicies} className={btnGhost(isLight)}>
                                        {busy === 'discord' ? <Loader2 size={18} className="animate-spin" /> : 'Discord'}
                                    </button>
                                    <button onClick={() => { setMethod('wallet'); handleWallet('names'); }} disabled={busy !== null || isWalletPending || !acceptedPolicies} className={btnGhost(isLight)}>
                                        {busy === 'wallet' || isWalletPending ? <Loader2 size={18} className="animate-spin" /> : <><Wallet size={18} /> Connect wallet</>}
                                    </button>
                                    <button
                                        onClick={() => { setAcceptedPolicies(v => !v); clearErr(); }}
                                        role="checkbox"
                                        aria-checked={acceptedPolicies}
                                        className="w-full flex items-start gap-3 text-left mt-1 px-1"
                                    >
                                        <span className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${acceptedPolicies ? 'bg-[#1A6140] border-[#1A6140]' : (isLight ? 'border-gray-300' : 'border-white/20')}`}>
                                            {acceptedPolicies && <Check size={14} className="text-white" strokeWidth={3.5} />}
                                        </span>
                                        <span className={`text-[11px] font-bold leading-relaxed ${isLight ? 'text-[#0a261a]/60' : 'text-white/50'}`}>
                                            I agree to the Terms of Use and Privacy Policy, and I confirm I am 18 years or older.
                                        </span>
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Email code verify ── */}
                        {step === 'code' && (
                            <motion.div key="code" {...stepAnim} className="w-full flex flex-col items-center">
                                <h1 className={`text-2xl font-black uppercase tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>Verify email</h1>
                                <p className={`text-xs font-bold uppercase tracking-widest mt-2 mb-6 ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>Code sent to {email.trim()}</p>
                                <div className="flex items-center justify-center gap-2" onPaste={handleCodePaste}>
                                    {[0, 1, 2, 3, 4, 5].map((i) => (
                                        <input
                                            key={i}
                                            ref={(el) => { codeRefs.current[i] = el; }}
                                            type="text"
                                            autoComplete={i === 0 ? 'one-time-code' : 'off'}
                                            inputMode="numeric"
                                            maxLength={1}
                                            value={code[i] || ''}
                                            onChange={(e) => setCodeAt(i, e.target.value)}
                                            onKeyDown={(e) => handleCodeKeyDown(i, e)}
                                            aria-label={`Digit ${i + 1}`}
                                            className={`w-11 h-14 text-center text-xl font-black rounded-2xl border outline-none transition-all ${
                                                isLight
                                                    ? 'bg-gray-50 border-gray-200 text-black focus:border-[#1A6140]'
                                                    : 'bg-white/5 border-white/10 text-white focus:border-[#1A6140]'
                                            } ${code[i] ? (isLight ? 'border-[#1A6140]/60' : 'border-[#1A6140]/60') : ''}`}
                                        />
                                    ))}
                                </div>
                                <button onClick={() => handleVerifyCode()} disabled={busy !== null} className={`${btnPrimary} mt-3`}>
                                    {busy === 'code' ? <Loader2 size={18} className="animate-spin" /> : 'Verify'}
                                </button>
                                <button onClick={() => {
                                    setCode('');
                                    codeRefs.current[0]?.focus();
                                    if (codeForLogin) {
                                        sendLoginCode();
                                    } else {
                                        handleSendCode();
                                    }
                                }} disabled={busy !== null} className="text-[11px] font-black uppercase tracking-widest text-[#1A6140] mt-3">Resend code</button>
                            </motion.div>
                        )}

                        {/* ── Bio: first + last (OAuth prefilled, editable) ── */}
                        {step === 'bio' && (
                            <motion.div key="bio" {...stepAnim} className="w-full flex flex-col items-center">
                                <h1 className={`text-2xl font-black uppercase tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>About you</h1>
                                <p className={`text-xs font-bold uppercase tracking-widest mt-2 mb-6 ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>Tell us who you are</p>
                                <div className="w-full flex flex-col gap-3">
                                    <input value={firstName} onChange={(e) => { setFirstName(e.target.value); clearErr(); }} placeholder="First name" maxLength={60} className={`${inputCls(isLight)} !tracking-normal !text-base`} />
                                    <input value={lastName} onChange={(e) => { setLastName(e.target.value); clearErr(); }} placeholder="Last name" maxLength={60} className={`${inputCls(isLight)} !tracking-normal !text-base`} />
                                    <button
                                        onClick={() => {
                                            if (!firstName.trim()) { setError('Enter your first name.'); return; }
                                            if (!lastName.trim()) { setError('Enter your last name.'); return; }
                                            clearErr();
                                            setStep('username');
                                        }}
                                        className={`${btnPrimary} mt-1`}
                                    >
                                        Continue
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Wallet names: first name + username only (wallet is the main auth) ── */}
                        {step === 'names' && (
                            <motion.div key="names" {...stepAnim} className="w-full flex flex-col items-center">
                                <h1 className={`text-2xl font-black uppercase tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>About you</h1>
                                <p className={`text-xs font-bold uppercase tracking-widest mt-2 mb-6 ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>Wallet connected</p>
                                <div className="w-full flex flex-col gap-3">
                                    <input value={firstName} onChange={(e) => { setFirstName(e.target.value); clearErr(); }} placeholder="First name" maxLength={60} className={`${inputCls(isLight)} !tracking-normal !text-base`} />
                                    <input value={username} onChange={(e) => { setUsername(e.target.value); clearErr(); checkUsername(e.target.value, wagmiAddress); }} placeholder="Username" maxLength={20} className={`${inputCls(isLight)} !tracking-normal !text-base`} />
                                    <UsernameStatus value={username} check={nameCheck} isLight={isLight} />
                                    <button
                                        onClick={() => { if (ensureNameFree()) finishWalletSignup(); }}
                                        disabled={busy !== null}
                                        className={`${btnPrimary} mt-1`}
                                    >
                                        {busy === 'finale' ? <Loader2 size={18} className="animate-spin" /> : 'Create account'}
                                    </button>
                                </div>
                            </motion.div>
                        )}

                        {/* ── Username ── */}
                        {step === 'username' && (
                            <motion.div key="username" {...stepAnim} className="w-full flex flex-col items-center">
                                <h1 className={`text-2xl font-black uppercase tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>Pick a username</h1>
                                <p className={`text-xs font-bold uppercase tracking-widest mt-2 mb-6 ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>How the tables know you</p>
                                <input value={username} onChange={(e) => { setUsername(e.target.value); clearErr(); checkUsername(e.target.value); }} placeholder="Username" maxLength={20} className={`${inputCls(isLight)} !tracking-normal !text-base`} />
                                <UsernameStatus value={username} check={nameCheck} isLight={isLight} />
                                <button
                                    onClick={() => { clearErr(); finishSignup(); }}
                                    disabled={busy !== null}
                                    className={`${btnPrimary} mt-4`}
                                >
                                    {busy === 'finale' ? <Loader2 size={18} className="animate-spin" /> : 'Continue'}
                                </button>
                            </motion.div>
                        )}

                        {/* ── Finale: trading wallet assigned ── */}
                        {step === 'finale' && (
                            <motion.div key="finale" {...stepAnim} className="w-full flex flex-col items-center">
                                <div className="w-14 h-14 rounded-full bg-[#1A6140]/15 border border-[#1A6140]/30 flex items-center justify-center mb-4">
                                    <Check size={26} className="text-[#1A6140]" strokeWidth={3} />
                                </div>
                                <h1 className={`text-2xl font-black uppercase tracking-tighter text-center ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>Trading wallet assigned</h1>
                                <p className={`text-xs font-bold uppercase tracking-widest mt-2 mb-4 text-center ${isLight ? 'text-[#0a261a]/50' : 'text-white/40'}`}>
                                    {method === 'wallet' ? 'Main + trading wallets ready' : 'Your only wallet — fund it to play'}
                                </p>
                                {assignedWallet && (
                                    <div className={`w-full p-4 rounded-2xl border text-center mb-4 ${isLight ? 'bg-black/5 border-[#1A6140]/20' : 'bg-white/5 border-white/10'}`}>
                                        <div className={`text-[9px] font-black uppercase tracking-widest mb-1 ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'}`}>Trading wallet</div>
                                        <div className={`text-sm font-mono font-bold break-all ${isLight ? 'text-[#0a261a]' : 'text-white/90'}`}>{assignedWallet}</div>
                                    </div>
                                )}
                                <button onClick={() => quit()} className={btnPrimary}>Enter 15market</button>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {notice && step === 'login' && (
                        <div className={`w-full mt-4 px-4 py-3 rounded-2xl border text-xs font-bold text-center ${isLight ? 'bg-[#1A6140]/10 border-[#1A6140]/30 text-[#0a261a]' : 'bg-[#1A6140]/10 border-[#1A6140]/30 text-white/80'}`}>
                            {notice}
                        </div>
                    )}
                    {error && (
                        <div className="w-full mt-4 px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold text-center">
                            {error}
                        </div>
                    )}
                </div>
            </div>

        </motion.div>
    );
}

export default BrandedAuthPage;
