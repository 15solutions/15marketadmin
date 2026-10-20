import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { KEEPER_URL_ARC } from '../constants';
import {
    Gift, Users, Copy, Check, ArrowLeft, Wallet, TrendingUp,
    Percent, BadgeCheck, Clock, LogOut, XCircle, Sparkles, RefreshCw
} from 'lucide-react';

// Minimum commission withdrawal — requests below this are rejected server-side.
const MIN_WITHDRAWAL = 25;

const statusChip = {
    pending: { icon: Clock, cls: 'bg-amber-500/15 text-amber-500 border-amber-500/30', label: 'Pending' },
    paid: { icon: BadgeCheck, cls: 'bg-[#1A6140]/15 text-[#1A6140] border-[#1A6140]/30', label: 'Paid' },
    rejected: { icon: XCircle, cls: 'bg-red-500/15 text-red-400 border-red-500/30', label: 'Rejected' }
};

const truncateAddr = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—');
const fmt = (n) => `$${Number(n || 0).toFixed(2)}`;
const fmtUsd0 = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export function ReferralHub({ address, userProfile, notify, theme, onBack }) {
    const isLight = theme === 'light';
    const [loading, setLoading] = useState(true);
    const [info, setInfo] = useState(null);        // { referralCode, referralEnrolled, referredBy }
    const [stats, setStats] = useState(null);      // { count, totalDeposits, totalVolume, totalCommission, referrals[] }
    const [withdrawals, setWithdrawals] = useState([]);
    const [enrolling, setEnrolling] = useState(false);
    const [wdAmount, setWdAmount] = useState('');
    const [wdBusy, setWdBusy] = useState(false);
    const [error, setError] = useState('');
    const [copiedKey, setCopiedKey] = useState(null);

    const enrolled = info?.referralEnrolled === true;
    const referralCode = info?.referralCode || '';
    const shareLink = referralCode ? `${window.location.origin}/?ref=${referralCode}` : '';
    const available = Math.max(0, Number(stats?.totalCommission || 0) - withdrawals.filter(w => w.status !== 'rejected').reduce((s, w) => s + Number(w.amount || 0), 0));
    const canWithdraw = available >= MIN_WITHDRAWAL;

    const refresh = useCallback(async () => {
        if (!address) { setLoading(false); setError('Connect a wallet to access the referral program.'); return; }
        try {
            const [infoRes, statsRes, wdRes] = await Promise.all([
                fetch(`${KEEPER_URL_ARC}/referral/info/${address.toLowerCase()}`),
                fetch(`${KEEPER_URL_ARC}/referral/stats/${address.toLowerCase()}`),
                fetch(`${KEEPER_URL_ARC}/referral/withdrawals/${address.toLowerCase()}`)
            ]);
            if (infoRes.ok) setInfo(await infoRes.json());
            if (statsRes.ok) setStats(await statsRes.json());
            if (wdRes.ok) setWithdrawals(await wdRes.json());
        } catch (e) {
            setError('Could not reach the referral program — try again.');
        } finally {
            setLoading(false);
        }
    }, [address]);

    useEffect(() => { setLoading(true); refresh(); }, [refresh]);

    const copy = (text, key) => {
        navigator.clipboard.writeText(text);
        setCopiedKey(key);
        notify?.('Copied to clipboard!', 'success');
        setTimeout(() => setCopiedKey(null), 1600);
    };

    const enroll = async () => {
        if (!address) { setError('Connect a wallet to enroll.'); return; }
        setEnrolling(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/referral/enroll/${address.toLowerCase()}`, { method: 'POST' });
            if (res.ok) {
                notify?.('Enrolled! Your referral code is live.', 'success');
                await refresh();
            } else {
                const err = await res.json().catch(() => ({}));
                setError(err.error || 'Enrollment failed — try again.');
            }
        } catch (e) {
            setError('Network error — try again.');
        } finally {
            setEnrolling(false);
        }
    };

    const requestWithdrawal = async () => {
        const amt = parseFloat(wdAmount);
        if (!(amt > 0)) { setError('Enter an amount to withdraw.'); return; }
        setWdBusy(true);
        setError('');
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/referral/withdraw/${address.toLowerCase()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: amt })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                notify?.('Withdrawal requested — the team will process it manually.', 'success');
                setWdAmount('');
                await refresh();
            } else {
                setError(data.error || 'Request failed — try again.');
            }
        } catch (e) {
            setError('Network error — try again.');
        } finally {
            setWdBusy(false);
        }
    };

    const card = `p-4 rounded-[24px] border ${isLight ? 'bg-white border-black/5 shadow-[0_4px_12px_rgba(26,97,64,0.08)]' : 'bg-[#151515] border-white/5 shadow-xl'}`;
    const chipText = isLight ? 'text-black/40' : 'text-white/40';

    return (
        <div className={`ref-hub min-h-screen w-full ${isLight ? 'bg-[#F4F7F5]' : 'bg-[#0A0A0A]'} ${isLight ? 'text-[#0a261a]' : 'text-white'} pb-24`}
            style={{ fontFamily: "'Comfortaa', sans-serif" }}>
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Comfortaa:wght@400;500;600;700&display=swap');
                .ref-hub, .ref-hub * { font-family: 'Comfortaa', sans-serif !important; letter-spacing: normal; }
                .ref-hub .tracking-widest, .ref-hub .tracking-\\[0\\.3em\\] { letter-spacing: 0.18em; }
            `}</style>
            {/* Header */}
            <div className="flex items-center justify-between px-4 md:px-8 pt-6 pb-2 max-w-[1200px] mx-auto w-full">
                <button
                    onClick={onBack}
                    className={`p-2.5 px-4 rounded-2xl border flex items-center gap-2 ${isLight ? 'bg-white border-black/5' : 'bg-white/5 border-white/5'} hover:scale-105 active:scale-95 transition-all`}
                >
                    <ArrowLeft size={16} className="text-[#1A6140]" />
                    <span className="text-[10px] font-bold tracking-widest">Back</span>
                </button>
                <div className="flex items-center gap-2">
                    {/* Asset recolored in place: glyph is now ~#19784D — brighter than the
                        #1A6140 brand green without going neon. Used by the trading area too. */}
                    <img
                        src={isLight ? '/goblogo.png' : '/gowlogo.png'}
                        alt="15market"
                        className="h-[54px] md:h-[66px] object-contain"
                    />
                </div>
                <div className="w-10" />
            </div>

            {/* Page title */}
            <div className="flex items-center justify-center gap-2 max-w-[1200px] mx-auto w-full px-4 mt-1">
                <Gift size={16} className="text-[#1A6140]" />
                <h1 className="text-lg md:text-xl font-bold tracking-wide">Referral Program</h1>
            </div>

            <div className="max-w-[1200px] mx-auto px-4 md:px-8 mt-4 flex flex-col gap-5">
                {error && (
                    <div className={`p-4 rounded-2xl border text-xs font-bold text-red-400 ${isLight ? 'bg-red-500/10 border-red-500/20' : 'bg-red-500/10 border-red-500/30'}`}>
                        ⚠️ {error}
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-24">
                        <RefreshCw size={24} className="animate-spin text-[#1A6140]/40 mr-3" /><span className="text-[10px] font-black uppercase tracking-widest opacity-40">Loading referral program…</span>
                    </div>
                ) : !enrolled ? (
                    /* ── PRE-ENROLLMENT: guide + commission breakdown + enroll ── */
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 max-w-2xl mx-auto w-full">
                        <div className={card}>
                            <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${chipText}`}>Step 1</p>
                            <h2 className="text-lg font-black uppercase tracking-tighter mb-3">How to register</h2>
                            <ol className="flex flex-col gap-3">
                                {[
                                    <>Have a 15market account — sign up with <b>email, Google, Discord or a wallet</b> if you haven't yet, and pick a display name at onboarding.</>,
                                    <>Come back to this page and tap <b>Enroll</b> below. That mints your unique referral code and shareable link instantly — it's free and takes one tap.</>,
                                    <>Share your <b>link</b> (or read out your <b>code</b>): friends can enter either during signup, or later in Settings → Profile → Referral Program.</>
                                ].map((s, i) => (
                                    <li key={i} className="flex gap-3">
                                        <span className="shrink-0 w-5 h-5 rounded-full bg-[#1A6140] text-white text-[9px] font-black flex items-center justify-center mt-0.5">{i + 1}</span>
                                        <span className={`text-xs font-bold leading-relaxed ${isLight ? 'text-[#0a261a]/70' : 'text-white/60'}`}>{s}</span>
                                    </li>
                                ))}
                            </ol>
                        </div>

                        <div className={card}>
                            <p className={`text-[9px] font-black uppercase tracking-widest mb-1 ${chipText}`}>Step 2</p>
                            <h2 className="text-lg font-black uppercase tracking-tighter mb-3">How it works</h2>
                            <p className={`text-xs font-bold leading-relaxed mb-4 ${isLight ? 'text-[#0a261a]/60' : 'text-white/50'}`}>
                                Every user you refer is yours forever. You earn two separate commissions on their activity — deposits and trading volume — and you can request a manual payout of your commission balance any time it clears the minimum.
                            </p>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="p-4 rounded-2xl bg-[#1A6140]/10 border border-[#1A6140]/25">
                                    <Percent size={16} className="text-[#1A6140] mb-2" />
                                    <p className="text-2xl font-black text-[#1A6140]">10%</p>
                                    <p className="text-[9px] font-black uppercase tracking-widest mt-1 text-[#1A6140]">Deposit commission</p>
                                    <p className={`text-[8px] font-bold mt-1 ${chipText}`}>On every USDC your referrals deposit</p>
                                </div>
                                <div className="p-4 rounded-2xl bg-[#1A6140]/10 border border-[#1A6140]/25">
                                    <TrendingUp size={16} className="text-[#1A6140] mb-2" />
                                    <p className="text-2xl font-black text-[#1A6140]">10%</p>
                                    <p className="text-[9px] font-black uppercase tracking-widest mt-1 text-[#1A6140]">Volume commission</p>
                                    <p className={`text-[8px] font-bold mt-1 ${chipText}`}>On everything they stake and trade</p>
                                </div>
                            </div>
                            <p className={`text-[8px] font-bold mt-4 ${chipText}`}>
                                Payouts are manual (off-chain): you apply for a withdrawal once your available commission reaches ${MIN_WITHDRAWAL} USDC, and the team sends it — no on-chain transfers, nothing automatic.
                            </p>
                        </div>

                        <button
                            onClick={enroll}
                            disabled={enrolling}
                            className="w-full py-5 bg-[#1A6140] text-white rounded-[24px] font-black uppercase tracking-widest text-xs shadow-[0_15px_30px_-10px_rgba(26,97,64,0.4)] hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            <Sparkles size={16} />{enrolling ? 'Enrolling…' : 'Enroll now — get my code'}
                        </button>
                    </motion.div>
                ) : (
                    /* ── ENROLLED: referral dashboard ── */
                    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-5 max-w-2xl mx-auto w-full">
                        {/* Code + link */}
                        <div className={card}>
                            <div className="flex items-center gap-2 mb-3">
                                <BadgeCheck size={14} className="text-[#1A6140]" />
                                <p className="text-[9px] font-black uppercase tracking-widest text-[#1A6140]">You're enrolled — your referral kit</p>
                            </div>
                            <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#1A6140]/10 border border-[#1A6140]/25 mb-3">
                                <div className="min-w-0">
                                    <p className={`text-[8px] font-black uppercase tracking-widest ${chipText} mb-1`}>Referral code</p>
                                    <p className="text-xl font-black tracking-[0.3em] text-[#1A6140]">{referralCode}</p>
                                </div>
                                <button onClick={() => copy(referralCode, 'code')} className={`p-3 rounded-xl ${isLight ? 'bg-white hover:bg-black/5' : 'bg-white/5 hover:bg-white/10'} border border-[#1A6140]/25 transition-all shrink-0`}>
                                    {copiedKey === 'code' ? <Check size={15} className="text-[#1A6140]" /> : <Copy size={15} className="text-[#1A6140]" />}
                                </button>
                            </div>
                            <div className="flex items-center justify-between gap-3 p-4 rounded-2xl bg-[#1A6140]/10 border border-[#1A6140]/25">
                                <div className="min-w-0">
                                    <p className={`text-[8px] font-black uppercase tracking-widest ${chipText} mb-1`}>Referral link</p>
                                    <p className="text-[10px] font-mono truncate text-[#1A6140]">{shareLink}</p>
                                </div>
                                <button onClick={() => copy(shareLink, 'link')} className={`p-3 rounded-xl ${isLight ? 'bg-white hover:bg-black/5' : 'bg-white/5 hover:bg-white/10'} border border-[#1A6140]/25 transition-all shrink-0`}>
                                    {copiedKey === 'link' ? <Check size={15} className="text-[#1A6140]" /> : <Copy size={15} className="text-[#1A6140]" />}
                                </button>
                            </div>
                        </div>

                        {/* Metrics */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                            <div className={card}>
                                <Users size={14} className="text-[#1A6140] mb-2" />
                                <p className="text-2xl font-black">{stats?.count ?? 0}</p>
                                <p className={`text-[8px] font-black uppercase tracking-widest mt-1 ${chipText}`}>Users referred</p>
                            </div>
                            <div className={card}>
                                <TrendingUp size={14} className="text-[#1A6140] mb-2" />
                                <p className="text-2xl font-black text-[#1A6140]">{fmt(stats?.totalCommission)}</p>
                                <p className={`text-[8px] font-black uppercase tracking-widest mt-1 ${chipText}`}>Commission made</p>
                            </div>
                            <div className={card}>
                                <Wallet size={14} className="text-[#1A6140] mb-2" />
                                <p className="text-2xl font-black">{stats ? fmtUsd0(stats.totalDeposits + stats.totalVolume) : '$0'}</p>
                                <p className={`text-[8px] font-black uppercase tracking-widest mt-1 ${chipText}`}>Their deposits + volume</p>
                            </div>
                        </div>
                        {stats && stats.count > 0 && (
                            <p className={`text-[9px] font-bold ${chipText}`}>
                                Breakdown: {fmt(stats.totalDeposits)} deposits · {fmt(stats.totalVolume)} traded volume = {fmt(stats.depositCommission)} + {fmt(stats.volumeCommission)} commission
                            </p>
                        )}

                        {/* Withdraw */}
                        <div className={card}>
                            <div className="flex items-center gap-2 mb-1">
                                <LogOut size={14} className="text-[#1A6140]" />
                                <p className="text-[10px] font-black uppercase tracking-widest">Withdraw commission</p>
                            </div>
                            <p className={`text-[9px] font-bold mb-4 ${chipText}`}>
                                Not on-chain and nothing automatic — you apply for a withdrawal of a chosen amount and the team processes it manually. Minimum {fmt(MIN_WITHDRAWAL)}.
                            </p>
                            <div className="flex gap-2 mb-3">
                                <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={wdAmount}
                                    onChange={(e) => setWdAmount(e.target.value)}
                                    placeholder="0.00"
                                    disabled={!canWithdraw}
                                    className={`flex-1 min-w-0 px-4 py-3.5 rounded-2xl border text-sm font-black outline-none transition-all disabled:opacity-40 ${isLight ? 'bg-black/5 border-black/10 focus:border-[#1A6140]' : 'bg-white/5 border-white/10 focus:border-[#1A6140]'}`}
                                />
                                <button
                                    onClick={requestWithdrawal}
                                    disabled={!canWithdraw || wdBusy}
                                    className={`px-5 rounded-2xl font-black uppercase tracking-widest text-[9px] transition-all shrink-0 flex items-center gap-2 ${canWithdraw ? 'bg-[#1A6140] text-white hover:brightness-110 active:scale-95' : 'bg-white/5 text-white/20 border border-white/10'} disabled:opacity-60`}
                                >
                                    {wdBusy ? '…' : 'Request'}
                                </button>
                            </div>
                            <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest">
                                <span className={chipText}>Available</span>
                                <span className={canWithdraw ? 'text-[#1A6140]' : 'text-amber-500'}>
                                    {fmt(available)} {!canWithdraw && `· needs ${fmt(MIN_WITHDRAWAL - available)} more`}
                                </span>
                            </div>
                            {!canWithdraw && (
                                <div className={`relative h-1.5 rounded-full mt-3 overflow-hidden ${isLight ? 'bg-black/10' : 'bg-white/10'}`}>
                                    <motion.div
                                        className="absolute inset-y-0 left-0 rounded-full bg-[#1A6140]/40"
                                        animate={{ width: `${Math.min(100, (available / MIN_WITHDRAWAL) * 100)}%` }}
                                        transition={{ duration: 0.5 }}
                                    />
                                </div>
                            )}

                            {withdrawals.length > 0 && (
                                <div className="mt-4 flex flex-col gap-2">
                                    <p className={`text-[8px] font-black uppercase tracking-widest ${chipText}`}>Past requests</p>
                                    {withdrawals.map(w => {
                                        const Chip = statusChip[w.status] || statusChip.pending;
                                        return (
                                            <div key={w.id} className={`flex items-center justify-between p-3 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                                <div>
                                                    <p className={`text-sm font-black ${isLight ? 'text-black' : 'text-white'}`}>{fmt(w.amount)}</p>
                                                    <p className={`text-[8px] font-bold ${chipText}`}>{w.requested_at ? new Date(w.requested_at).toLocaleDateString() : ''}</p>
                                                </div>
                                                <span className={`px-3 py-1 rounded-full border text-[8px] font-black uppercase tracking-widest ${Chip.cls}`}>{Chip.label}</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Recent referrals */}
                        {stats?.referrals?.length > 0 && (
                            <div className={card}>
                                <p className={`text-[10px] font-black uppercase tracking-widest mb-3`}>Your referrals</p>
                                <div className="flex flex-col gap-2">
                                    {stats.referrals.slice(0, 10).map(r => (
                                        <div key={r.address} className={`flex items-center justify-between p-3 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'}`}>
                                            <div className="min-w-0">
                                                <p className={`text-[11px] font-black truncate ${isLight ? 'text-black' : 'text-white'}`}>{r.username ? `@${r.username}` : truncateAddr(r.address)}</p>
                                                <p className={`text-[8px] font-bold ${chipText}`}>{r.joinedAt ? `Joined ${new Date(r.joinedAt).toLocaleDateString()}` : truncateAddr(r.address)}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className="text-[11px] font-black text-[#1A6140]">{fmt(r.commission)}</p>
                                                <p className={`text-[8px] font-bold ${chipText}`}>{fmt(r.deposits)} dep · {fmt(r.volume)} vol</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.div>
                )}
            </div>
        </div>
    );
}

export default ReferralHub;
