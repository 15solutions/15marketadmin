import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
    BookOpen, ArrowLeft, BarChart2, Wallet, 
    Zap, HelpCircle, Compass, Sparkles, Send
} from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { 
    RenderIntro, RenderTrading, RenderNavbar, 
    RenderWallets, RenderHistory, RenderFAQ 
} from "./DocsSections";

const SECTIONS = [
    { id: "intro",   title: "Introduction",            icon: Compass },
    { id: "trading", title: "Trading & Chart Widget",   icon: BarChart2 },
    { id: "nav",     title: "Dashboard Navigation",    icon: Send },
    { id: "wallets", title: "Wallets & Transfer Hub",  icon: Wallet },
    { id: "history", title: "Ledgers & History",       icon: Zap },
    { id: "faq",     title: "Platform FAQ",            icon: HelpCircle },
];

export function DocsPage({ onBack, theme = "dark", onToggleTheme, isSmallScreen }) {
    const isLight = theme === "light";
    const [activeIdx, setActiveIdx] = useState(0);
    const contentRef = useRef(null);
    const scrollLock = useRef(false);

    // Simulator state (kept at parent to preserve on tab switches)
    const [simDir, setSimDir]         = useState("up");
    const [simDur, setSimDur]         = useState(5);
    const [simAmt, setSimAmt]         = useState(10);
    const [simRunning, setSimRunning] = useState(false);
    const [simResult, setSimResult]   = useState(null);
    const [simCountdown, setSimCd]    = useState(0);
    const [simTicks, setSimTicks]     = useState([]);

    // Wheel scroll -> change chapter
    useEffect(() => {
        const el = contentRef.current;
        if (!el) return;
        const handler = (e) => {
            if (scrollLock.current) return;
            scrollLock.current = true;
            if (e.deltaY > 0) setActiveIdx(i => Math.min(i + 1, SECTIONS.length - 1));
            else              setActiveIdx(i => Math.max(i - 1, 0));
            setTimeout(() => { scrollLock.current = false; }, 600);
        };
        el.addEventListener("wheel", handler, { passive: true });
        return () => el.removeEventListener("wheel", handler);
    }, []);

    const startSim = () => {
        if (simRunning) return;
        setSimRunning(true); setSimResult(null);
        let price = 64250; const start = price;
        const steps = (simDur * 1000) / 400; let step = 0;
        const ticks = [{ price }]; setSimTicks([...ticks]);
        const iv = setInterval(() => {
            step++;
            setSimCd(Math.ceil(simDur * (1 - step / steps)));
            price = parseFloat((price + (Math.random() - 0.48) * 9).toFixed(2));
            ticks.push({ price }); setSimTicks([...ticks]);
            if (step >= steps) {
                clearInterval(iv);
                const won = (simDir === "up" && price >= start) || (simDir === "down" && price < start);
                const mult = simDur === 5 ? 2.90 : simDur === 10 ? 2.40 : 1.90;
                const profit = won ? (simAmt * mult - simAmt).toFixed(2) : (-simAmt).toFixed(2);
                setSimResult({ won, profit }); setSimRunning(false);
            }
        }, 400);
    };

    const gl = isLight
        ? "bg-white/45 border-black/8 backdrop-blur-xl"
        : "bg-white/[0.04] border-white/[0.06] backdrop-blur-xl";
    const body = isLight ? "text-black/75" : "text-white/65";
    const muted = isLight ? "text-black/45" : "text-white/40";

    return (
        <div className={`h-screen w-full flex flex-col overflow-hidden relative ${isLight ? "bg-[#CFDCD5] text-black" : "bg-black text-white"}`}
             style={{ fontFamily: '"Comfortaa", cursive' }}>
            <style>{`.no-sb::-webkit-scrollbar{display:none}.no-sb{-ms-overflow-style:none;scrollbar-width:none}`}</style>

            {/* Glows */}
            <div className="pointer-events-none absolute top-0 right-0 w-96 h-96 rounded-full bg-[#1A6140]/10 blur-[100px]" />
            <div className="pointer-events-none absolute bottom-0 left-0 w-72 h-72 rounded-full bg-[#1A6140]/6 blur-[80px]" />

            {/* HEADER */}
            <div className="flex-none flex items-center justify-between px-5 md:px-10 pb-2 relative z-10 w-full"
                 style={isSmallScreen ? { paddingTop: 'calc(env(safe-area-inset-top) + 12px)' } : { paddingTop: '1.25rem' }}>
                <div className="flex items-center gap-4">
                    <button onClick={onBack} className={`w-10 h-10 rounded-2xl border flex items-center justify-center hover:-translate-x-1 transition-transform ${isLight ? "bg-white border-white text-black shadow-md" : "bg-white/5 border-white/5 text-white"}`}>
                        <ArrowLeft size={16} />
                    </button>
                    <div className="flex items-center gap-2">
                        <BookOpen size={18} className="text-[#1A6140]" />
                        <h1 className={`text-lg font-black uppercase tracking-widest ${isLight ? "text-[#0f2618]" : "text-white"}`}>Platform Documentation</h1>
                    </div>
                </div>

                {/* Theme Switcher — matches platform ThemeToggle */}
                <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            </div>

            {/* Mobile top tabs (clean flow, never overlaps) */}
            <div className="md:hidden flex-none flex gap-2 overflow-x-auto no-sb px-5 pb-3">
                {SECTIONS.map((s, i) => (
                    <button key={s.id} onClick={() => setActiveIdx(i)}
                        className={`flex-none px-3.5 py-2 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all ${i === activeIdx ? "bg-[#1A6140] text-white shadow-md" : isLight ? "bg-black/5 text-black/60 hover:bg-black/10" : "bg-white/5 text-white/50 hover:bg-white/10"}`}>
                        {s.title}
                    </button>
                ))}
            </div>

            {/* BODY */}
            <div className="flex flex-1 gap-4 px-5 md:px-10 pb-5 min-h-0 relative z-10">

                {/* SIDEBAR */}
                <div className="w-64 flex-none flex flex-col gap-3 overflow-y-auto no-sb hidden md:flex">
                    <div className={`rounded-[24px] border p-4 flex flex-col gap-1 ${gl}`}>
                        <div className="text-[9px] font-black uppercase tracking-widest text-[#1A6140] mb-2 px-2">Chapters</div>
                        {SECTIONS.map((s, i) => {
                            const Icon = s.icon;
                            const active = i === activeIdx;
                            return (
                                <button key={s.id} onClick={() => setActiveIdx(i)}
                                    className={`w-full px-4 py-2.5 rounded-2xl border border-transparent flex items-center gap-3 text-left transition-all text-xs font-bold uppercase tracking-wide
                                        ${active ? (isLight ? "bg-[#1A6140] text-white shadow translate-x-1" : "bg-[#1A6140]/20 text-[#1A6140] border-[#1A6140]/40 translate-x-1") : isLight ? "hover:bg-black/5 text-black/70" : "hover:bg-white/5 text-white/60"}`}
                                >
                                    <Icon size={14} className={active ? "text-inherit" : "text-[#1A6140]"} />
                                    {s.title}
                                </button>
                            );
                        })}
                    </div>
                    <div className={`rounded-[24px] border p-4 flex flex-col gap-2 relative overflow-hidden ${gl}`}>
                        <div className="absolute -right-6 -bottom-6 w-20 h-20 bg-[#1A6140]/10 rounded-full blur-xl" />
                        <div className="flex items-center gap-2 text-[#1A6140]"><Sparkles size={14} /><span className="text-[9px] font-black uppercase tracking-wider">Sub-45ms Execution</span></div>
                        <p className={`text-[11px] leading-relaxed ${body}`}>Session signers authorize trades silently in memory, bypassing browser popup latency entirely.</p>
                    </div>
                </div>

                {/* CONTENT — wheel scroll changes chapter */}
                <div ref={contentRef} className={`flex-1 rounded-[28px] border overflow-hidden relative ${gl}`}>
                    <AnimatePresence mode="wait">
                        <motion.div key={activeIdx}
                            initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -18 }}
                            transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
                            className="absolute inset-0 p-5 md:p-8 flex flex-col gap-4 overflow-y-auto no-sb pt-5 md:pt-8"
                        >
                            {/* Section heading — no icon box */}
                            <div>
                                <h2 className={`text-base md:text-lg font-black uppercase tracking-wider ${isLight ? "text-[#0f2618]" : "text-white"}`}>
                                    {SECTIONS[activeIdx].title}
                                </h2>
                                <div className="w-10 h-0.5 bg-[#1A6140] mt-1 rounded-full" />
                            </div>

                            {activeIdx === 0 && <RenderIntro isLight={isLight} body={body} />}
                            
                            {activeIdx === 1 && (
                                <RenderTrading 
                                    isLight={isLight} body={body} muted={muted}
                                    simDir={simDir} setSimDir={setSimDir}
                                    simDur={simDur} setSimDur={setSimDur}
                                    simAmt={simAmt} setSimAmt={setSimAmt}
                                    simRunning={simRunning} simCountdown={simCountdown}
                                    simTicks={simTicks} simResult={simResult}
                                    startSim={startSim}
                                />
                            )}
                            
                            {activeIdx === 2 && <RenderNavbar isLight={isLight} body={body} />}
                            
                            {activeIdx === 3 && <RenderWallets isLight={isLight} body={body} />}
                            
                            {activeIdx === 4 && <RenderHistory isLight={isLight} body={body} />}
                            
                            {activeIdx === 5 && <RenderFAQ isLight={isLight} body={body} />}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
}
