import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
    ArrowLeft, RefreshCw, Landmark, Building2, Wallet,
    ShieldCheck, CheckCircle2, XCircle, Clock, ChevronDown, Check, Globe
} from 'lucide-react';
import { KEEPER_URL_ARC, COUNTRY_LIST } from '../constants';

// ─── Fiat Withdrawal page ─────────────────────────────────────────────────
// Select the funding account (Trading / Main) → pick the country from the
// list → unique methods reveal. Nigeria unlocks bank transfer (bank · account name ·
// account number · amount); any other country is coming soon for now.
// Confirming debits the chosen account server-side and pushes the request
// to the admin console. Approve / deny decisions arrive by email.

const card = (isLight) => `p-4 md:p-5 rounded-[24px] border ${isLight
    ? 'bg-white border-black/5 shadow-[0_4px_12px_rgba(14,77,48,0.08)]'
    : 'bg-[#151515] border-white/5 shadow-xl'}`;
const chipText = (isLight) => isLight ? 'text-black/40' : 'text-white/40';
const field = (isLight) => `w-full px-4 py-3.5 rounded-2xl border outline-none transition-all ${isLight
    ? 'bg-black/5 border-black/10 focus:border-[#0E4D30]' : 'bg-white/5 border-white/10 focus:border-[#0E4D30]'}`;

const flagUrl = (code) => `https://flagcdn.com/w40/${String(code || '').toLowerCase()}.png`;

// Branded dropdown list (native <select> renders OS chrome). Options are
// { value, label, flag? }; the open list scrolls and closes on outside tap.
function PickList({ isLight, value, onChange, options, placeholder, icon: Icon, disabled }) {
    const [open, setOpen] = useState(false);
    const selected = options.find(o => o.value === value) || null;
    return (
        <div className="relative w-full">
            <button
                type="button"
                disabled={disabled}
                onClick={() => setOpen(v => !v)}
                aria-haspopup="listbox"
                aria-expanded={open}
                className={field(isLight) + ' text-[11px] font-bold flex items-center gap-3 text-left cursor-pointer disabled:opacity-40'}
            >
                {selected?.flag ? (
                    <img src={flagUrl(selected.flag)} alt="" className="w-6 h-4 object-cover rounded-[3px] shrink-0" loading="lazy" />
                ) : Icon ? (
                    <Icon size={15} className={`shrink-0 ${chipText(isLight)}`} />
                ) : null}
                <span className={`flex-1 truncate ${selected ? (isLight ? 'text-black' : 'text-white') : chipText(isLight)}`}>
                    {selected ? selected.label : placeholder}
                </span>
                <ChevronDown size={14} className={`shrink-0 transition-transform ${chipText(isLight)} ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} aria-hidden="true" />
                    <div
                        role="listbox"
                        className={`absolute left-0 right-0 top-full mt-2 z-20 max-h-56 overflow-y-auto rounded-2xl border shadow-2xl ${
                            isLight ? 'bg-white border-gray-200' : 'bg-[#0d0d0d] border-white/10'
                        }`}
                    >
                        {options.map(o => {
                            const active = o.value === value;
                            return (
                                <button
                                    key={o.value}
                                    type="button"
                                    role="option"
                                    aria-selected={active}
                                    onClick={() => { onChange(o.value); setOpen(false); }}
                                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                                        active ? 'bg-[#0E4D30]/15' : (isLight ? 'hover:bg-black/5' : 'hover:bg-white/5')
                                    }`}
                                >
                                    {o.flag && <img src={flagUrl(o.flag)} alt="" className="w-6 h-4 object-cover rounded-[3px] shrink-0" loading="lazy" />}
                                    <span className={`flex-1 text-[11px] font-bold ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>{o.label}</span>
                                    {active && <Check size={14} className="text-[#0E4D30] shrink-0" strokeWidth={3} />}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

const fmt = (n) => `$${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const statusChip = {
    pending: { icon: Clock, cls: 'bg-amber-500/10 text-amber-500 border-amber-500/30', label: 'Pending review' },
    approved: { icon: CheckCircle2, cls: 'bg-[#0E4D30]/10 text-[#0E4D30] border-[#0E4D30]/30', label: 'Approved' },
    denied: { icon: XCircle, cls: 'bg-red-500/10 text-red-500 border-red-500/30', label: 'Denied' }
};

export function FiatWithdrawPage({ address, isLight, notify, onBack, sessionBalance, evmBalance, sendToEscrow, signMessage }) {
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
    const [busyLabel, setBusyLabel] = useState('');
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

    // Country lookup — picking a country asks the backend which fiat methods
    // (if any) that country carries.
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
        }, 150);
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
        if (source === 'main' && !methods?.escrow) {
            notify('Fiat vault is not configured yet — try again later', 'error');
            return;
        }
        setSubmitBusy(true);
        try {
            // ── The money moves first ──
            // trading → the backend sweeps the funds from the trading wallet
            // to the fiat vault on-chain while this request runs.
            // main → the user's own wallet signs the vault transfer here,
            // then the request files with the receipt attached.
            // In-progress feedback lives IN THIS BUTTON (state label), never
            // on the page — only the finished verdict takes the screen.
            let escrowTx = null;
            if (source === 'main') {
                setBusyLabel('Confirm the vault transfer in your wallet…');
                escrowTx = await sendToEscrow(methods.escrow, amt);
            } else {
                setBusyLabel('Moving funds to the fiat vault…');
            }
            setBusyLabel('Filing the request…');
            // A fiat claim files a real money movement — the backend only
            // accepts one signed by the wallet owner, naming the amount.
            const fiatMsg = `--- 15MARKET PROTOCOL ---\nACTION: FIAT WITHDRAWAL\nADDRESS: ${address.toLowerCase()}\nSOURCE: ${source === 'main' ? 'MAIN WALLET' : 'TRADING WALLET'}\nAMOUNT: ${amt}\nTIMESTAMP: ${Date.now()}`;
            const fiatSig = signMessage ? await signMessage(fiatMsg) : null;
            if (!fiatSig) throw new Error('Approve the withdrawal request signature in your wallet to continue');
            const res = await fetch(`${KEEPER_URL_ARC}/fiat/withdraw/${address.toLowerCase()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    source, amount: amt, country: methods?.country || country.trim(),
                    bankName, accountName: accountName.trim(), accountNumber: accountNumber.replace(/\s+/g, ''),
                    txHash: escrowTx,
                    message: fiatMsg,
                    signature: fiatSig
                })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(data.error || 'Request failed');
            notify(`Withdrawal request submitted — ${fmt(amt)} is in the platform vault`, 'success');
            setAmount(''); setAccountNumber(''); setAccountName(''); setBankName('');
            setRefreshTick(t => t + 1);
        } catch (e) {
            const msg = e?.code === 4001 || /reject|denied/i.test(e?.message || '') ? 'Vault transfer cancelled' : e.message;
            notify(msg, 'error');
        } finally {
            setSubmitBusy(false);
            setBusyLabel('');
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
                                            ? 'bg-[#0E4D30]/10 border-[#0E4D30]/50'
                                            : (isLight ? 'bg-black/[0.03] border-black/5 hover:border-[#0E4D30]/25' : 'bg-white/[0.03] border-white/5 hover:border-[#0E4D30]/25')}`}>
                                        <acc.icon size={16} className={on ? 'text-[#0E4D30]' : chipText(isLight)} />
                                        <p className={`text-[10px] md:text-xs font-black uppercase tracking-widest mt-2 ${on ? 'text-[#0E4D30]' : (isLight ? 'text-black/70' : 'text-white/70')}`}>{acc.label}</p>
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
                        <PickList
                            isLight={isLight}
                            value={country}
                            onChange={setCountry}
                            options={COUNTRY_LIST.map(c => ({ value: c.name, label: c.name, flag: c.code }))}
                            placeholder="Select your country"
                            icon={Globe}
                        />
                        {methodsBusy && <p className={`text-[9px] font-black uppercase tracking-widest mt-3 ${chipText(isLight)}`}>Checking methods…</p>}
                        {methods && !methodsBusy && methods.available && (
                            <div className="mt-3 p-3 rounded-2xl bg-[#0E4D30]/10 border border-[#0E4D30]/25 flex items-center gap-3">
                                <Building2 size={15} className="text-[#0E4D30] shrink-0" />
                                <p className="text-[9px] font-black uppercase tracking-widest text-[#0E4D30]">
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
                                <PickList
                                    isLight={isLight}
                                    value={bankName}
                                    onChange={setBankName}
                                    options={(methods.banks || []).map(b => ({ value: b.name, label: b.name }))}
                                    placeholder="Select your bank"
                                    icon={Building2}
                                />
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
                                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] font-black uppercase tracking-widest text-[#0E4D30]">
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
                            <div className="mt-4 p-3 rounded-2xl border border-dashed border-[#0E4D30]/30 flex items-center gap-3">
                                <ShieldCheck size={15} className="text-[#0E4D30] shrink-0" />
                                <div className="min-w-0">
                                    <p className={`text-[9px] font-bold leading-relaxed ${chipText(isLight)}`}>
                                        Confirming moves <b className="text-[#0E4D30]">{fmt(amt || 0)}</b> from your <b className="text-[#0E4D30]">{source} wallet</b> to the platform vault on-chain, then files the request with the team for a {methods.name} bank transfer{selectedBank ? ` to ${selectedBank.name}` : ''}.
                                    </p>
                                </div>
                            </div>
                            <button onClick={submit} disabled={!canSubmit || submitBusy}
                                className="w-full mt-4 py-4 bg-[#0E4D30] text-white rounded-[20px] font-black uppercase tracking-[0.2em] text-[9px] shadow-xl shadow-[#0E4D30]/25 hover:brightness-110 active:scale-[0.97] transition-all disabled:opacity-40">
                                {submitBusy ? (busyLabel || 'Processing…') : 'Confirm & send request'}
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
                                            <chip.icon size={14} className="shrink-0 text-[#0E4D30]" />
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
