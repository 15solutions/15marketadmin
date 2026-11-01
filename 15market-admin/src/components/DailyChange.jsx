import React from 'react';
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
        : good ? 'text-[#3CB371]' : 'text-[#EF5350]';
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
