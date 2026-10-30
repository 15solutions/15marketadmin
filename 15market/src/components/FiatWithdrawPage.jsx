import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowLeft, RefreshCw, Landmark, Building2, Wallet,
    ShieldCheck, CheckCircle2, XCircle, Clock
} from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';

// ─── Fiat Withdrawal page ─────────────────────────────────────────────────
// Select the funding account (Trading / Main) → type the country → unique
// methods reveal. Nigeria unlocks bank transfer (bank · account name ·
// account number · amount); any other country is coming soon for now.
// Confirming debits the chosen account server-side and pushes the request
// to the admin console. Approve / deny decisions arrive by email.

const card = (isLight) => `p-4 md:p-5 rounded-[24px] border ${isLight
    ? 'bg-white border-black/5 shadow-[0_4px_12px_rgba(26,97,64,0.08)]'
    : 'bg-[#151515] border-white/5 shadow-xl'}`;
const chipText = (isLight) => isLight ? 'text-black/40' : 'text-white/40';
const field = (isLight) => `w-full px-4 py-3.5 rounded-2xl border outline-none transition-all ${isLight
    ? 'bg-black/5 border-black/10 focus:border-[#1A6140]' : 'bg-white/5 border-white/10 focus:border-[#1A6140]'}`;

const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const statusChip = {
    pending: { icon: Clock, cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30', label: 'Pending review' },
    approved: { icon: CheckCircle2, cls: 'bg-[#1A6140]/10 text-[#1A6140] border-[#1A6140]/30', label: 'Approved' },
    denied: { icon: XCircle, cls: 'bg-red-500/10 text-red-500 border-red-500/30', label: 'Denied' }
};

export function FiatWithdrawPage({ address, isLight, notify, onBack, sessionBalance, evmBalance }) {
    // Balances come straight from the app's own live values: the trading
    // wallet is the session ledger, the main wallet is the Privy on-chain
    // balance. Only the request ledger is fetched here.
    const [source, setSource] = useState(null);       // 'trading' | 'main'
    const sessionBal = Number(sessionBalance ?? 0);
    const mainBal = Number(evmBalance ?? 0);
    const [country, setCountry] = useState('');
    const [methods, setMethods] = useState(null);        // /fiat/methods response
    const [methodsBusy, setMethodsBusy] = useState(false);
    const [bankName, setBankName] = useState('');
    const [accountName, setAccountName] = useState('');
    const [accountNumber, setAccountNumber] = useState('');
    const [amount, setAmount] = useState('');
    const [submitBusy, setSubmitBusy] = useState(false);
    const [past, setPast] = useState([]);
    const [refreshTick, setRefreshTick] = useState(0);

    // Past requests for the "your requests" strip.
    const refresh = useCallback(async () => {
        if (!address) return;
        const addr = address.toLowerCase();
        try {
            const mine = await fetch(`${KEEPER_URL_ARC}/fiat/withdrawals/${addr}`).then(r => r.ok ? r.json() : null).catch(() => null);
            setPast(Array.isArray(mine?.withdrawals) ? mine.withdrawals : []);
        } catch (e) { /* non-fatal */ }
    }, [address]);

    useEffect(() => { refresh(); }, [refresh, refreshTick]);

    // Country lookup — debounced; each keystroke asks the backend which
    // fiat methods (if any) that country carries.
    useEffect(() => {
        setBankName(''); setAccountName(''); setAccountNumber(''); setMethods(null);
        if (!country.trim()) return;
        setMethodsBusy(true);
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`${KEEPER_URL_ARC}/fiat/methods?country=${encodeURIComponent(country.trim())}`);
                const data = await res.json().catch(() => null);
                setMethods(res.ok && data ? data : { available: false, country: country.trim().toLowerCase() });
            } catch (e) {
                setMethods({ available: false });
            } finally {
                setMethodsBusy(false);
            }
        }, 450);
        return () => clearTimeout(t);
    }, [country]);

    const selectedBank = methods?.banks?.find(b => b.name === bankName) || null;
    const chosenBalance = source === 'trading' ? sessionBal : mainBal;
    const amt = Number(amount);
    const canSubmit = !!source && !!methods?.available && !!bankName && accountName.trim().length >= 3
        && /^\d{10}$/.test(accountNumber.replace(/\s+/g, '')) && Number.isFinite(amt) && amt > 0
        && (source !== 'trading' || (sessionBal != null && amt <= sessionBal));

    const submit = async () => {
        if (!canSubmit || submitBusy) return;
        setSubmitBusy(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/fiat/withdraw/${address.toLowerCase()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source, amount: amt, country: methods?.country || country.trim(),
                    bankName, accountName: accountName.trim(), accountNumber: accountNumber.replace(/\s+/g, '')
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Request failed');
            notify(`Withdrawal request submitted — ${fmt(amt)} debited from your ${source} wallet`, 'success');
            setAmount(''); setAccountNumber(''); setAccountName(''); setBankName('');
            setRefreshTick(t => t + 1);
        } catch (e) {
            notify(e.message, 'error');
        } finally {
            setSubmitBusy(false);
        }
    };

    return (
        <div className={`fixed inset-0 z-[80] overflow-hidden flex flex-col font-sans ${isLight ? 'bg-white' : 'bg-[#070a09]'} transition-all duration-500`}
            style={{ fontFamily: '"Comfortaa", cursive' }}>
            {/* Header */}
            <div className="w-full shrink-0 relative z-10 safe-top">
                <div className="w-full px-4 md:px-12 h-16 md:h-24 md:pt-8 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={onBack}
                            className={`p-3 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/80' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all hover:scale-110 active:scale-95`}>
                            <ArrowLeft size={20} />
                        </button>
                        <h2 className={`text-xl font-black uppercase tracking-tighter ${isLight ? 'text-black/80' : 'text-white'} leading-none`}>Fiat Withdrawal</h2>
                    </div>
                    <button onClick={() => setRefreshTick(t => t + 1)}
                        className={`p-3 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/80' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all`}>
                        <RefreshCw size={20} />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                <div className="max-w-xl mx-auto px-4 md:px-6 mt-2 mb-10 flex flex-col gap-3 md:gap-5">

                    {/* STEP 1 — which account */}
                    <div className={card(isLight)}>
                        <p className="text-[10px] font-black uppercase tracking-widest mb-3">1 · Withdraw from which account?</p>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { key: 'trading', label: 'Trading Wallet', bal: sessionBal, icon: Wallet },
                                { key: 'main', label: 'Main Wallet', bal: mainBal, icon: Landmark }
                            ].map(acc => {
                                const on = source === acc.key;
                                return (
                                    <button key={acc.key} onClick={() => setSource(acc.key)}
                                        className={`p-4 rounded-2xl border text-left transition-all active:scale-[0.97] ${on
                                            ? 'bg-[#1A6140]/10 border-[#1A6140]/50'
                                            : (isLight ? 'bg-black/[0.03] border-black/5 hover:border-[#1A6140]/25' : 'bg-white/[0.03] border-white/5 hover:border-[#1A6140]/25')}`}>
                                        <acc.icon size={16} className={on ? 'text-[#1A6140]' : chipText(isLight)} />
                                        <p className={`text-[10px] md:text-xs font-black uppercase tracking-widest mt-2 ${on ? 'text-[#1A6140]' : (isLight ? 'text-black/70' : 'text-white/70')}`}>{acc.label}</p>
                                        <p className={`text-[9px] font-bold mt-1 ${chipText(isLight)}`}>{acc.bal != null ? fmt(acc.bal) : '…'}</p>
                                    </button>
                                );
                            })}
                        </div>
                        {source && <p className={`text-[8px] font-bold mt-3 ${chipText(isLight)}`}>Withdrawing {fmt(0)} minimum — the amount will be debited the moment you confirm.</p>}
                    </div>

                    {/* STEP 2 — country */}
                    <div className={card(isLight)}>
                        <p className="text-[10px] font-black uppercase tracking-widest mb-3">2 · Where are you cashing out?</p>
                        <input
                            value={country}
                            onChange={(e) => setCountry(e.target.value)}
                            placeholder="Type your country — e.g. Nigeria"
                            className={field(isLight) + ' text-[11px] font-bold'}
                            spellCheck={false}
                        />
                        {methodsBusy && <p className={`text-[9px] font-black uppercase tracking-widest mt-3 ${chipText(isLight)}`}>Checking methods…</p>}
                        {methods && !methodsBusy && methods.available && (
                            <div className="mt-3 p-3 rounded-2xl bg-[#1A6140]/10 border border-[#1A6140]/25 flex items-center gap-3">
                                <Building2 size={15} className="text-[#1A6140] shrink-0" />
                                <p className="text-[9px] font-black uppercase tracking-widest text-[#1A6140]">
                                    Bank Transfer available in {methods.name} — continue below
                                </p>
                            </div>
                        )}
                        {methods && !methodsBusy && methods.available === false && !!country.trim() && (
                            <div className="mt-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25">
                                <p className="text-[9px] font-black uppercase tracking-widest text-amber-500">
                                    Fiat withdrawal is coming soon for {methods.name || country.trim()}
                                </p>
                                <p className={`text-[8px] font-bold mt-1.5 ${chipText(isLight)}`}>This payout method is not available in your country yet — we will notify you when it opens.</p>
                            </div>
                        )}
                    </div>

                    {/* STEP 3 — bank transfer details (Nigeria) */}
                    {source && methods?.available && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={card(isLight)}>
                            <p className="text-[10px] font-black uppercase tracking-widest mb-3">3 · Bank transfer details</p>
                            <div className="flex flex-col gap-3">
                                <div className="relative">
                                    <select
                                        value={bankName}
                                        onChange={(e) => setBankName(e.target.value)}
                                        className={field(isLight) + ` text-[11px] font-bold appearance-none pr-10 ${!bankName ? (isLight ? 'text-black/30' : 'text-white/30') : ''}`}
                                    >
                                        <option value="">Select your bank</option>
                                        {(methods.banks || []).map(b => <option key={b.code} value={b.name}>{b.name}</option>)}
                                    </select>
                                    <ChevronDown size={14} className={`absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none ${chipText(isLight)}`} />
                                </div>
                                <input value={accountName} onChange={(e) => setAccountName(e.target.value)}
                                    placeholder="Account name (as registered at the bank)"
                                    className={field(isLight) + ' text-[11px] font-bold'} />
                                <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
                                    placeholder="Account number (10 digits)"
                                    inputMode="numeric"
                                    className={field(isLight) + ' text-[11px] font-bold tracking-wider'} />
                                <div>
                                    <div className="relative">
                                        <input type="number" min="0" step="0.01" value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder={source === 'trading' ? `Amount (USDC) — available ${fmt(sessionBal)}` : 'Amount (USDC)'}
                                            className={field(isLight) + ` text-sm font-black ${source === 'trading' && sessionBal != null && Number(amount) > sessionBal ? 'border-red-500/60' : ''}`} />
                                        {source === 'trading' && sessionBal > 0 && (
                                            <button onClick={() => setAmount(String(sessionBal))}
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase tracking-widest text-[#1A6140]">
                                                Max
                                            </button>
                                        )}
                                    </div>
                                    {source === 'trading' && sessionBal != null && Number(amount) > sessionBal && (
                                        <p className="text-[8px] font-black uppercase tracking-widest text-red-500 mt-1.5">Amount exceeds your trading balance</p>
                                    )}
                                </div>
                            </div>

                            {/* Confirm summary */}
                            <div className="mt-4 p-3 rounded-2xl border border-dashed border-[#1A6140]/30 flex items-center gap-3">
                                <ShieldCheck size={15} className="text-[#1A6140] shrink-0" />
                                <div className="min-w-0">
                                    <p className={`text-[9px] font-bold leading-relaxed ${chipText(isLight)}`}>
                                        Confirming debits <b className="text-[#1A6140]">{fmt(amt || 0)}</b> from your <b className="text-[#1A6140]">{source} wallet</b> and files the request with the team for a {methods.name} bank transfer{selectedBank ? ` to ${selectedBank.name}` : ''}.
                                    </p>
                                </div>
                            </div>
                            <button onClick={submit} disabled={!canSubmit || submitBusy}
                                className="w-full mt-4 py-4 bg-[#1A6140] text-white rounded-[20px] font-black uppercase tracking-[0.2em] text-[9px] shadow-xl shadow-[#1A6140]/25 hover:brightness-110 active:scale-[0.97] transition-all disabled:opacity-40">
                                {submitBusy ? 'Submitting…' : 'Confirm & send request'}
                            </button>
                        </motion.div>
                    )}

                    {/* Past requests */}
                    {past.length > 0 && (
                        <div className={card(isLight)}>
                            <p className="text-[10px] font-black uppercase tracking-widest mb-3">Your requests</p>
                            <div className="flex flex-col gap-2">
                                {past.slice(0, 8).map(r => {
                                    const chip = statusChip[r.status] || statusChip.pending;
                                    return (
                                        <div key={r.id} className="flex items-center gap-3 p-3 rounded-2xl border border-black/5 bg-black/[0.02]">
                                            <chip.icon size={14} className="shrink-0 text-[#1A6140]" />
                                            <div className="min-w-0 flex-1">
                                                <p className={`text-[10px] font-black ${isLight ? 'text-black' : 'text-white'}`}>{fmt(r.amount)} · {r.bankName} ••{r.accountNumber.slice(-4)}</p>
                                                <p className={`text-[8px] font-bold ${chipText(isLight)}`}>{r.source} wallet · {new Date(r.createdAt).toLocaleString()}</p>
                                            </div>
                                            <span className={`flex-none text-[7px] font-black uppercase tracking-widest px-2 py-1 rounded-lg border ${chip.cls}`}>{chip.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
