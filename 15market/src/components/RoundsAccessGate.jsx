import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, ShieldAlert, ShieldCheck, Users, Mail, Twitter, MessageCircle, Send, ExternalLink, RefreshCw } from 'lucide-react';
import { useAccount } from 'wagmi';
import { KEEPER_URL_ROUNDS } from '../constants';

/**
 * RoundsAccessGate
 * 
 * STRICT enforcement — NO localStorage fallback.
 * Access is verified against the backend on mount and re-checked every 60s.
 * The gate cannot be bypassed by localStorage manipulation.
 */
export default function RoundsAccessGate({ children, theme, active, onUnlock, verified = null }) {
    const { address } = useAccount();
    const [hasAccess, setHasAccess] = useState(verified === true);
    const [view, setView] = useState('gate'); // 'gate' | 'apply' | 'success'
    const [inputCode, setInputCode] = useState('');
    const [error, setError] = useState('');
    const [isChecking, setIsChecking] = useState(verified === null);
    const [isVerifying, setIsVerifying] = useState(false);
    const [isApplying, setIsApplying] = useState(false);
    const [appSuccess, setAppSuccess] = useState(false);
    const isDark = theme !== 'light';

    const recheckRef = useRef(null);
    const [formData, setFormData] = useState({ xHandle: '', discord: '', email: '' });

    // ─── Sync with Global Verified Prop ─────────────────────────────────────────
    useEffect(() => {
        if (verified !== null) {
            setHasAccess(verified);
            setIsChecking(false);
            if (verified) onUnlock?.();
        }
    }, [verified, onUnlock]);

    // ─── Server-Side Access Check (Periodic Only) ───────────────────────────────
    const checkAccess = useCallback(async () => {
        if (!address) {
            setIsChecking(false);
            setHasAccess(false);
            return;
        }
        // If we already have global verification, we skip the initial fetch 
        // but keep the function for periodic background re-checks.
        try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), 3000);

            const res = await fetch(`${KEEPER_URL_ROUNDS}/access/check/${address}`, {
                cache: 'no-store',
                signal: controller.signal
            });
            clearTimeout(id);
            if (!res.ok) throw new Error('Server error');
            const data = await res.json();
            const authorized = data.authorized === true;
            setHasAccess(authorized);
            if (authorized) onUnlock?.();
        } catch (e) {
            console.warn('[AccessGate] Backend re-check failed:', e.message);
        } finally {
            setIsChecking(false);
        }
    }, [address, onUnlock]);

    // Initial check + periodic re-verification every 60s
    useEffect(() => {
        if (!active) {
            setIsChecking(false);
            return;
        }

        // Only trigger initial fetch if verified is null (initial state)
        if (verified === null) {
            checkAccess();
        } else {
            setIsChecking(false);
        }

        // Re-verify every 60s — revoked wallets lose access on next cycle
        recheckRef.current = setInterval(checkAccess, 60000);
        return () => clearInterval(recheckRef.current);
    }, [active, checkAccess, verified]);

    // If the wallet changes, reset and re-check...
    useEffect(() => {
        if (verified === null) {
            setHasAccess(false);
            setIsChecking(!!address);
        }
        setInputCode('');
        setError('');
        setView('gate');
        if (active && address && verified === null) {
            checkAccess();
        }
    }, [address, verified, active, checkAccess]);

    // ─── Code Redemption ─────────────────────────────────────────────────────
    const handleVerify = async () => {
        const code = inputCode.trim().toUpperCase();
        if (!code || !address) return;
        setIsVerifying(true);
        setError('');

        try {
            const res = await fetch(`${KEEPER_URL_ROUNDS}/access/redeem`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, code })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setHasAccess(true);
                onUnlock?.();
            } else {
                setError(data.error || 'Invalid Access Code');
                setTimeout(() => setError(''), 5000);
            }
        } catch (e) {
            setError('Connection Error — Please try again.');
            setTimeout(() => setError(''), 5000);
        } finally {
            setIsVerifying(false);
        }
    };

    // ─── Apply for Access ─────────────────────────────────────────────────────
    const handleApply = async (e) => {
        e.preventDefault();
        if (!formData.xHandle || !formData.email || !address) return;
        setIsApplying(true);
        try {
            const res = await fetch(`${KEEPER_URL_ROUNDS}/access/apply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address, ...formData })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                setAppSuccess(true);
                setView('success');
            } else {
                setError(data.error || 'Submission failed. Please try again.');
            }
        } catch (e) {
            setError('Connection Error — Please try again.');
        } finally {
            setIsApplying(false);
        }
    };

    // ─── Guard conditions ─────────────────────────────────────────────────────

    // Only render children instantly when active=false (non-rounds mode) OR verified by server
    if (!active || hasAccess) return children;

    // While checking for Rounds mode specifically, show loading spinner
    if (isChecking) {
        return (
            <div className="w-full h-full min-h-[400px] flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 opacity-40">
                    <RefreshCw size={24} className="animate-spin" />
                    <span className="text-[10px] font-black uppercase tracking-widest">Verifying Access...</span>
                </div>
            </div>
        );
    }

    // ─── Gate UI ──────────────────────────────────────────────────────────────
    return (
        <div className="w-full h-full min-h-[600px] flex items-center justify-center p-4 relative overflow-hidden rounded-[32px]">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-xl z-0" />

            <AnimatePresence mode="wait">
                {/* CODE GATE */}
                {view === 'gate' && (
                    <motion.div
                        key="gate"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`relative z-10 max-w-md w-full p-8 rounded-[40px] border shadow-2xl ${isDark ? 'bg-[#0f110f] border-white/10 text-white' : 'bg-white border-[#1A6140]/20 text-black'
                            }`}
                    >
                        <div className="flex flex-col items-center text-center">
                            <motion.div
                                animate={{ scale: [1, 1.05, 1] }}
                                transition={{ repeat: Infinity, duration: 3 }}
                                className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 ${error ? 'bg-red-500/10' : 'bg-[#1A6140]/10'}`}
                            >
                                {error ? <ShieldAlert size={32} className="text-red-500" /> : <Lock size={32} className="text-[#1A6140]" />}
                            </motion.div>

                            <h2 className="text-3xl font-black uppercase tracking-tighter mb-2">Secure Access</h2>
                            <p className={`text-[10px] font-bold uppercase tracking-widest mb-8 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                                Invite-only Beta access to Rounds Terminal.
                            </p>

                            {!address && (
                                <div className="w-full p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 mb-6">
                                    <p className="text-[10px] font-black text-amber-400 uppercase tracking-widest">Connect your wallet to verify access</p>
                                </div>
                            )}

                            <div className="w-full space-y-4">
                                <input
                                    type="text"
                                    value={inputCode}
                                    onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                                    placeholder="ENTER ACCESS CODE"
                                    maxLength={12}
                                    disabled={!address || isVerifying}
                                    className={`w-full px-6 py-5 rounded-2xl text-center font-black tracking-widest outline-none border-2 transition-all disabled:opacity-40 ${isDark ? 'bg-white/5 border-white/5 focus:border-[#1A6140]/30' : 'bg-black/5 border-black/5 focus:border-[#1A6140]/30'
                                        } ${error ? 'border-red-500/50 animate-shake' : ''}`}
                                />
                                <button
                                    onClick={handleVerify}
                                    disabled={!inputCode.trim() || !address || isVerifying}
                                    className="w-full py-5 rounded-2xl bg-[#1A6140] hover:brightness-110 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-[#1A6140]/20 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    {isVerifying ? (
                                        <span className="flex items-center justify-center gap-2">
                                            <RefreshCw size={12} className="animate-spin" /> Verifying...
                                        </span>
                                    ) : 'Unlock Rounds'}
                                </button>
                                {error && (
                                    <motion.p
                                        initial={{ opacity: 0, y: -4 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="text-[10px] font-bold text-red-500 uppercase text-center"
                                    >
                                        {error}
                                    </motion.p>
                                )}
                            </div>

                            <div className="mt-8 pt-8 border-t border-white/5 w-full">
                                <p className={`text-[9px] font-black uppercase tracking-[0.3em] mb-4 text-center ${isDark ? 'text-white/20' : 'text-black/20'}`}>No code yet?</p>
                                <button
                                    onClick={() => setView('apply')}
                                    className="text-[10px] font-black text-[#1A6140] uppercase underline underline-offset-4 hover:opacity-80 transition-all"
                                >
                                    Request Beta Pass →
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* APPLICATION FORM */}
                {view === 'apply' && (
                    <motion.div
                        key="apply"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className={`relative z-10 max-w-md w-full p-8 rounded-[40px] border shadow-2xl ${isDark ? 'bg-[#0f110f] border-white/10 text-white' : 'bg-white border-[#1A6140]/20 text-black'
                            }`}
                    >
                        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Beta Application</h2>
                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-6 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                            Complete steps to request access.
                        </p>

                        <div className="space-y-3 mb-8">
                            <Step icon={<Twitter size={12} />} text="Follow @15_markets on X" link="https://x.com/15_markets" />
                            <Step icon={<Send size={12} />} text="Like, Retweet & Comment pinned post" link="https://x.com/15_markets" />
                        </div>

                        <form onSubmit={handleApply} className="space-y-4">
                            <GateInput icon={<Twitter size={14} />} placeholder="X USERNAME (e.g. @trader)" value={formData.xHandle} onChange={v => setFormData({ ...formData, xHandle: v })} isDark={isDark} required />
                            <GateInput icon={<MessageCircle size={14} />} placeholder="DISCORD ID (OPTIONAL)" value={formData.discord} onChange={v => setFormData({ ...formData, discord: v })} isDark={isDark} />
                            <GateInput icon={<Mail size={14} />} placeholder="EMAIL FOR ACCESS CODE" type="email" value={formData.email} onChange={v => setFormData({ ...formData, email: v })} isDark={isDark} required />

                            {error && <p className="text-[10px] font-bold text-red-500 uppercase text-center">{error}</p>}

                            <button
                                disabled={isApplying}
                                type="submit"
                                className="w-full py-5 rounded-2xl bg-[#1A6140] font-black uppercase text-[10px] tracking-widest shadow-lg shadow-[#1A6140]/20 mt-4 disabled:opacity-50"
                            >
                                {isApplying ? 'SUBMITTING...' : 'SUBMIT APPLICATION'}
                            </button>
                        </form>

                        <p className={`text-[9px] font-black uppercase tracking-widest mt-4 text-center ${isDark ? 'text-white/30' : 'text-black/30'}`}>
                            Your wallet address is automatically bound to your application.
                        </p>

                        <button
                            onClick={() => { setView('gate'); setError(''); }}
                            className={`w-full mt-6 text-[9px] font-black uppercase tracking-[0.2em] hover:opacity-60 transition-all ${isDark ? 'text-white/20' : 'text-black/20'}`}
                        >
                            ← Back to Unlock
                        </button>
                    </motion.div>
                )}

                {/* SUCCESS */}
                {view === 'success' && (
                    <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className={`relative z-10 max-w-md w-full p-8 rounded-[40px] border shadow-2xl text-center ${isDark ? 'bg-[#0f110f] border-white/10 text-white' : 'bg-white border-[#1A6140]/20 text-black'
                            }`}
                    >
                        <ShieldCheck size={48} className="text-[#1A6140] mx-auto mb-4" />
                        <h2 className="text-2xl font-black uppercase tracking-tighter mb-2">Application Sent!</h2>
                        <p className={`text-[10px] font-bold uppercase tracking-widest mb-6 ${isDark ? 'text-white/40' : 'text-black/40'}`}>
                            Please check your email for a unique access code.<br />Check back regularly — it may take some time.
                        </p>
                        <button
                            onClick={() => setView('gate')}
                            className="text-[10px] font-black text-[#1A6140] uppercase underline underline-offset-4"
                        >
                            ← Enter Code
                        </button>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const Step = ({ icon, text, link }) => (
    <a href={link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-[#1A6140]/30 transition-all group">
        <div className="p-1.5 rounded-lg bg-[#1A6140]/10 text-[#1A6140] group-hover:bg-[#1A6140]/20 transition-all">{icon}</div>
        <span className="text-[10px] font-bold uppercase tracking-tight text-white/60">{text}</span>
        <ExternalLink size={10} className="ml-auto text-white/20" />
    </a>
);

const GateInput = ({ icon, placeholder, value, onChange, type = 'text', isDark, required }) => (
    <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-[#1A6140] transition-all">{icon}</div>
        <input
            type={type}
            required={required}
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full pl-12 pr-6 py-4 rounded-xl text-xs font-bold outline-none border-2 transition-all ${isDark ? 'bg-white/5 border-white/5 focus:border-[#1A6140]/30' : 'bg-black/5 border-black/5 focus:border-[#1A6140]/30'
                }`}
        />
    </div>
);
