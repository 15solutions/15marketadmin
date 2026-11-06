import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

// Daily change indicator for a KPI: percent move versus the metric's value at
// the start of today (UTC; the backend takes the baseline). Magnitudes are
// written in exponential notation once they are too large or too small to
// read as a plain percentage, e.g. +1.25e+4% or -3.40e-3%.

export function formatDailyPct(pct) {
    if (pct === null || pct === undefined) return 'NEW';
    if (!Number.isFinite(pct)) return 'NEW';
    if (pct === 0) return '0.00%';
    const sign = pct > 0 ? '+' : '-';
    const abs = Math.abs(pct);
    if (abs >= 10000 || abs < 0.01) return `${sign}${abs.toExponential(2)}%`;
    return `${sign}${abs.toFixed(2)}%`;
}

/**
 * @param pct     number | null   percent change today (null = grew from zero)
 * @param invert  boolean         true when "up" is bad (e.g. open disputes)
 */
export function DailyChange({ pct, invert = false, size = 'md' }) {
    // Backend has not reported a daily figure yet (older backend build, or the
    // first stats pulse has not landed): keep the slot visible, not hidden.
    if (pct === undefined) {
        return (
            <div
                className={`flex items-center gap-1 font-black tabular-nums leading-none whitespace-nowrap opacity-30 ${size === 'sm' ? 'text-[8px]' : 'text-[9px]'}`}
                title="Waiting for daily change data from the backend"
            >
                <Minus size={size === 'sm' ? 9 : 10} strokeWidth={3} className="flex-none" />
                <span>--%</span>
                <span className="opacity-60 font-bold uppercase tracking-widest">today</span>
            </div>
        );
    }

    const flat = pct === 0;
    const up = pct === null || pct > 0;
    const good = flat ? null : (invert ? !up : up);
    const tone = good === null
        ? 'text-current opacity-40'
        : good ? 'text-[#0E4D30]' : 'text-[#EF5350]';
    const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
    const text = size === 'sm' ? 'text-[8px]' : 'text-[9px]';

    return (
        <div
            className={`flex items-center gap-1 font-black tabular-nums leading-none whitespace-nowrap ${text} ${tone}`}
            title="Change since the start of today (UTC)"
        >
            <Icon size={size === 'sm' ? 9 : 10} strokeWidth={3} className="flex-none" />
            <span>{formatDailyPct(pct)}</span>
            <span className="opacity-50 font-bold uppercase tracking-widest">today</span>
        </div>
    );
}

export default DailyChange;

// ─── Client-side daily baseline ───────────────────────────────────────────
// The backend normally sends `stats.daily`. When it does not (older backend
// build, first pulse still in flight) the console counts the day itself:
// each metric's first live reading of the UTC day becomes its baseline, kept
// in localStorage, so the counter starts at 0% and moves with every change.

const BASELINE_KEY = '15market_admin_daily_baseline_v1';
const METRIC_KEYS = [
    'totalWallets', 'totalTrades', 'totalVolume', 'platformRevenue', 'activeCount',
    'activeStakesTotal', 'treasuryBalance', 'pendingDisputes', 'bullBearRatio'
];
const utcDay = () => new Date().toISOString().slice(0, 10);

function loadBaseline() {
    try {
        const raw = JSON.parse(localStorage.getItem(BASELINE_KEY) || 'null');
        if (raw && raw.day === utcDay() && raw.baseline && typeof raw.baseline === 'object') return raw;
    } catch (e) { /* fall through to a fresh day */ }
    return { day: utcDay(), baseline: {} };
}

/**
 * @param stats  the live stats object from the console
 * @param ready  true once a real stats pulse has been applied (so the zeros
 *               the console starts with are never taken as a baseline)
 * @returns      { key: { pct } } — backend figure when present, else counted here
 */
export function useDailyChanges(stats, ready) {
    const [store, setStore] = useState(loadBaseline);

    // Record first-of-day readings (and roll to a fresh baseline at midnight UTC).
    useEffect(() => {
        if (!ready) return;
        setStore(prev => {
            let next = prev.day === utcDay() ? prev : { day: utcDay(), baseline: {} };
            let changed = next !== prev;
            for (const key of METRIC_KEYS) {
                const v = Number(stats?.[key]);
                if (!Number.isFinite(v) || key in next.baseline) continue;
                if (next === prev) next = { day: prev.day, baseline: { ...prev.baseline } };
                next.baseline[key] = v;
                changed = true;
            }
            if (!changed) return prev;
            try { localStorage.setItem(BASELINE_KEY, JSON.stringify(next)); } catch (e) { /* quota */ }
            return next;
        });
    }, [ready, stats]);

    return useMemo(() => {
        const out = {};
        for (const key of METRIC_KEYS) {
            const backend = stats?.daily?.[key];
            if (backend && backend.pct !== undefined) { out[key] = backend; continue; }
            if (!ready) continue;
            // No reading yet for this metric (e.g. the payload has not carried
            // it): it sits at 0% until its first value becomes the baseline.
            if (!(key in store.baseline)) { out[key] = { pct: 0, base: null }; continue; }
            const base = store.baseline[key];
            const cur = Number(stats?.[key]);
            if (!Number.isFinite(cur)) continue;
            let pct;
            if (base === 0) pct = cur === 0 ? 0 : null;
            else pct = ((cur - base) / Math.abs(base)) * 100;
            out[key] = { pct, base };
        }
        return out;
    }, [stats, ready, store]);
}
