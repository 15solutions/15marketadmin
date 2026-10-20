import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ArrowLeft, LifeBuoy, ChevronDown, Zap, Clock, Link2,
    Wallet, Landmark, TrendingUp, ShieldCheck, HelpCircle
} from 'lucide-react';

/**
 * HelpPage — replaces the old Docs platform. This product does not need a
 * documents section; it needs a Help page: a short guide on how to trade and
 * a plain-language FAQ. Comfortaa everywhere, back button is icon-only,
 * navbar aligned with the dashboard, desktop internal scroll like /referral.
 */
export default function HelpPage({ onBack, theme, isSmallScreen }) {
    const isLight = theme === 'light';
    const [openFaq, setOpenFaq] = useState(0);
    const [openStep, setOpenStep] = useState(0);
    // Desktop: thin green scrollbar visible only while hovering the pane
    const scrollbarCss = `
        .help-scroll { overflow-y: auto; scrollbar-width: thin; scrollbar-color: rgba(26,97,64,0.45) transparent; }
        .help-scroll::-webkit-scrollbar { width: 10px; }
        .help-scroll::-webkit-scrollbar-track { background: transparent; }
        .help-scroll::-webkit-scrollbar-thumb { background: transparent; border-radius: 8px; }
        .help-scroll:hover::-webkit-scrollbar-thumb { background: rgba(26,97,64,0.45); }
        .help-scroll:hover { scrollbar-color: rgba(26,97,64,0.45) transparent; }
        .help-scroll::-webkit-scrollbar-corner { background: transparent; }
    `;

    const text = isLight ? 'text-black' : 'text-white';
    const faint = isLight ? 'text-black/50' : 'text-white/40';
    const card = `rounded-[24px] border ${isLight ? 'bg-white/60 border-black/5' : 'bg-black/40 border-white/10'}`;

    // ── How to trade guide ────────────────────────────────────────────────
    const steps = [
        {
            n: 1,
            title: 'Fund your trading wallet',
            icon: <Wallet size={15} />,
            body: [
                'Open the Transfer Hub from the dashboard and use Deposit. Every deposit is credited to your session (trading) wallet, which is the balance you trade with.',
                'Deposits are on-chain on Arc — you can fund from another wallet, or use the cross-chain guide in the hub to bring USDC over from another network.'
            ]
        },
        {
            n: 2,
            title: 'Pick a market and direction',
            icon: <TrendingUp size={15} />,
            body: [
                'Choose the asset you want to predict (BTC, ETH, SOL and more) in the sidebar, then study the live chart.',
                'Decide where the price will be when your trade settles: UP if you think it will be higher, DOWN if you think it will be lower.'
            ]
        },
        {
            n: 3,
            title: 'Set your stake and duration',
            icon: <Clock size={15} />,
            body: [
                'Enter how much USDC you want to stake (the slider can use your whole balance) and pick how long the trade lasts.',
                'Shorter trades settle faster and pay more, because predicting them is harder. Your potential payout is shown before you confirm.'
            ]
        },
        {
            n: 4,
            title: 'Confirm — settlement is automatic',
            icon: <Zap size={15} />,
            body: [
                'Hit Execute. The trade is committed on-chain the moment you confirm, so it is tamper-proof and transparent.',
                'When the timer ends, the trade settles automatically against the same price feed used to open it. Wins pay out straight to your session wallet instantly — withdraw any time from the Transfer Hub.'
            ]
        }
    ];

    // ── FAQ ───────────────────────────────────────────────────────────────
    const faqs = [
        {
            q: 'Is it instant settlement?',
            a: 'Yes. The moment your trade timer ends, the result is computed and settled automatically — there is no waiting for a counterparty or an admin. Winning stakes are credited to your session wallet immediately.'
        },
        {
            q: 'How long does a trade last?',
            a: 'You choose. Trades run from ultra-short (seconds) up to a few minutes depending on the duration you select before executing. Shorter durations carry higher volatility and higher payouts because they are harder to predict.'
        },
        {
            q: 'What chain is it built on?',
            a: '15market runs on Arc, a fast, low-fee network built for stablecoin applications, with USDC as both gas and the staking asset. Because gas and stakes are the same token, funding is simple and predictable.'
        },
        {
            q: 'How do I deposit?',
            a: 'Open the Transfer Hub from your dashboard and tap Deposit. You can send USDC directly on-chain to your deposit address, or follow the built-in cross-chain guide to bridge USDC from another network. Everything lands in your session (trading) wallet.'
        },
        {
            q: 'Can I deposit with fiat?',
            a: 'Not yet. Currently we have no fiat deposit integrated, but we are actively working on it: for Africa we are bringing on reputable payment gateways, and for America and Europe we are working on integrating Stripe. This is coming soon.'
        }
    ];

    return (
        <div className={`w-full h-screen overflow-hidden flex flex-col ${isLight ? 'text-black bg-[#EAF3EE]' : 'text-white bg-black'}`}
            style={{ fontFamily: '"Comfortaa", cursive' }}>
            <style>{scrollbarCss}</style>

            {/* Backdrop */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
                <div className="absolute top-[15%] left-[15%] w-[500px] h-[500px] bg-[#1A6140]/10 rounded-full blur-[130px] opacity-40" />
                <div className="absolute bottom-[10%] right-[10%] w-[400px] h-[400px] bg-[#1A6140]/10 rounded-full blur-[110px] opacity-30" />
            </div>

            {/* Top bar — aligned with the dashboard header */}
            <header
                className="relative z-20 flex-none flex items-center w-full"
                style={{
                    paddingLeft: 'calc(env(safe-area-inset-left) + 1.25rem)',
                    paddingRight: 'calc(env(safe-area-inset-right) + 1.25rem)',
                    paddingTop: isSmallScreen ? 'calc(env(safe-area-inset-top) + 1.25rem)' : 'calc(env(safe-area-inset-top) + 1rem)',
                    paddingBottom: '0.65rem'
                }}>
                {/* Back button — icon only */}
                <button
                    onClick={onBack}
                    aria-label="Back"
                    title="Back"
                    className={`w-11 h-11 rounded-[16px] border flex items-center justify-center shrink-0 active:scale-90 transition-all ${isLight ? 'bg-white border-black/10 hover:bg-black/5' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                >
                    <ArrowLeft size={19} className={isLight ? 'text-black/80' : 'text-white/80'} />
                </button>
                <div className="flex-1 flex justify-center items-center">
                    <img src={isLight ? '/goblogo.png' : '/gowlogo.png'} alt="15market" className="h-10 w-auto" />
                </div>
                <div className="w-11 h-11 flex-none flex items-center justify-center">
                    <LifeBuoy size={17} className="text-[#1A6140]" />
                </div>
            </header>

            {/* Content: desktop uses its own thin scrollbar; mobile scrolls natural */}
            <main className={`relative z-10 flex-1 min-h-0 ${isSmallScreen ? '' : 'help-scroll'} overflow-y-auto`}
                style={{
                    paddingLeft: 'calc(env(safe-area-inset-left) + 1.25rem)',
                    paddingRight: 'calc(env(safe-area-inset-right) + 1.25rem)',
                    paddingBottom: 'calc(env(safe-area-inset-bottom) + 2rem)'
                }}>

                <div className="max-w-2xl mx-auto w-full pt-2 flex flex-col gap-5">

                    {/* Heading */}
                    <div className="text-center py-1">
                        <div className="w-16 h-16 mx-auto rounded-full bg-[#1A6140]/15 border border-[#1A6140]/30 flex items-center justify-center mb-3">
                            <HelpCircle size={28} className="text-[#1A6140]" />
                        </div>
                        <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tighter">Help &amp; Trading Guide</h1>
                        <p className={`text-[11px] font-bold mt-1 ${faint}`}>How to trade on 15market in four steps — and the answers to the questions everyone asks.</p>
                    </div>

                    {/* GUIDE */}
                    <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-[#1A6140] px-1">How to trade</h2>
                    {steps.map((s, i) => (
                        <div key={s.n}>
                            <button
                                onClick={() => setOpenStep(openStep === i ? -1 : i)}
                                className={`${card} w-full text-left p-4 flex items-center justify-between gap-3 hover:border-[#1A6140]/40 transition-all`}
                            >
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="w-7 h-7 rounded-full bg-[#1A6140] text-white text-[11px] font-black flex items-center justify-center flex-none">{s.n}</span>
                                    <span className="font-black text-[14px] leading-tight min-w-0">{s.title}</span>
                                </div>
                                <span className="flex items-center gap-2 flex-none text-[#1A6140]">
                                    {s.icon}
                                    <ChevronDown size={15} className={`transition-transform duration-300 ${openStep === i ? 'rotate-180' : ''}`} />
                                </span>
                            </button>
                            <AnimatePresence initial={false}>
                                {openStep === i && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.28, ease: 'easeInOut' }}
                                        className="overflow-hidden"
                                    >
                                        <div className={`px-4 pt-3 pb-4 mx-2 mt-2 rounded-b-[18px] border border-t-0 ${isLight ? 'bg-white/50 border-black/5' : 'bg-black/30 border-white/10'}`}>
                                            {s.body.map((p, j) => (
                                                <p key={j} className={`text-[12px] leading-relaxed font-medium ${faint} ${j > 0 ? 'mt-2' : ''}`}>{p}</p>
                                            ))}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    ))}

                    {/* FAQ */}
                    <h2 className="text-[11px] font-black uppercase tracking-[0.25em] text-[#1A6140] px-1 pt-2">Frequently asked</h2>
                    <div className={`${card} overflow-hidden`}>
                        {faqs.map((f, i) => (
                            <div key={f.q} className={`${i > 0 ? (isLight ? 'border-t border-black/5' : 'border-t border-white/10') : ''}`}>
                                <button
                                    onClick={() => setOpenFaq(openFaq === i ? -1 : i)}
                                    className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-[#1A6140]/5 transition-colors"
                                >
                                    <span className="font-black text-[13px] leading-tight pr-2">{f.q}</span>
                                    <ChevronDown size={15} className={`text-[#1A6140] flex-none transition-transform duration-300 ${openFaq === i ? 'rotate-180' : ''}`} />
                                </button>
                                <AnimatePresence initial={false}>
                                    {openFaq === i && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{ duration: 0.28, ease: 'easeInOut' }}
                                            className="overflow-hidden"
                                        >
                                            <p className={`px-4 pb-4 text-[12px] leading-relaxed font-medium ${faint}`}>{f.a}</p>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        ))}
                    </div>

                    {/* Trust footer */}
                    <div className={`${card} p-4 flex items-center gap-3`}>
                        <ShieldCheck size={18} className="text-[#1A6140] flex-none" />
                        <p className={`text-[11px] font-bold leading-relaxed ${faint}`}>
                            Every trade is committed on-chain and settles automatically against the price feed it was opened on. No manual intervention, no hidden rules.
                        </p>
                    </div>
                </div>
            </main>
        </div>
    );
}
