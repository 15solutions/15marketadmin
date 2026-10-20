import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { UnifiedWalletButton } from "./UnifiedWalletButton";
import { 
    BookOpen, Monitor, Smartphone, TrendingUp, TrendingDown, Clock, 
    Menu, X, ChevronDown, ArrowUpRight
} from "lucide-react";

const XLogo = () => (
    <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
);

const LandingBackground = ({ theme }) => {
    const isLight = false; // Always dark!
    const [mousePos, setMousePos] = useState({ x: -1000, y: -1000 });

    useEffect(() => {
        const handleMouseMove = (e) => {
            setMousePos({ x: e.clientX, y: e.clientY });
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);

    return (
        <div className={`absolute inset-0 overflow-hidden z-0 pointer-events-none ${isLight ? 'bg-[#f0f8f4]' : 'bg-[#050505]'} transition-colors duration-500`}>
            {/* Mouse Follow Glow */}
            <div
                className="absolute w-[450px] h-[450px] rounded-full blur-[100px] opacity-[0.25] pointer-events-none transition-all duration-300"
                style={{
                    left: mousePos.x - 225,
                    top: mousePos.y - 225,
                    background: `radial-gradient(circle, #1A6140 0%, transparent 70%)`,
                }}
            />
            {/* Cinematic Background Glows */}
            <div className="absolute top-[20%] right-[10%] w-[350px] h-[350px] rounded-full bg-[#1A6140]/10 blur-[100px] pointer-events-none" />
            <div className="absolute bottom-[10%] left-[5%] w-[300px] h-[300px] rounded-full bg-[#1A6140]/5 blur-[90px] pointer-events-none" />
        </div>
    );
};

const RisingBalance = () => {
    const [val, setVal] = useState(15.00);
    useEffect(() => {
        const i = setInterval(() => setVal(v => v + Math.random() * 0.15), 120);
        return () => clearInterval(i);
    }, []);
    return (
        <span className="ml-3 sm:ml-4 text-white bg-[#1A6140] px-3 py-0.5 text-sm sm:text-base rounded-full shadow-[0_0_15px_rgba(26, 97, 64,0.4)] inline-block align-middle font-bold">
            ${val.toFixed(2)}
        </span>
    );
};

export function LandingPage({ theme, onToggle, onDocs, isSmallScreen }) {
    const isLight = false; // Always dark!
    const [currentTextIndex, setCurrentTextIndex] = useState(0);
    const [displayText, setDisplayText] = useState("");
    const [isDeleting, setIsDeleting] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

    const phrases = [
        "real time binary prediction market",
        "trade the trend in real time",
        "earn profits in seconds"
    ];

    useEffect(() => {
        let timer;
        const currentPhrase = phrases[currentTextIndex];
        
        if (!isDeleting) {
            if (displayText.length < currentPhrase.length) {
                timer = setTimeout(() => {
                    setDisplayText(currentPhrase.substring(0, displayText.length + 1));
                }, 60);
            } else {
                timer = setTimeout(() => setIsDeleting(true), 2500);
            }
        } else {
            if (displayText.length > 0) {
                timer = setTimeout(() => {
                    setDisplayText(currentPhrase.substring(0, displayText.length - 1));
                }, 30);
            } else {
                setIsDeleting(false);
                setCurrentTextIndex((prev) => (prev + 1) % phrases.length);
            }
        }
        return () => clearTimeout(timer);
    }, [displayText, isDeleting, currentTextIndex]);

    const cardBg = isLight 
        ? "bg-white/60 border-black/[0.06] backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.03)]" 
        : "bg-white/[0.03] border-white/[0.05] backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.3)]";

    return (
        <div className={`min-h-screen w-screen ${isLight ? 'text-[#0a261a]' : 'text-white'} overflow-y-auto no-scrollbar font-sans relative flex flex-col items-center selection:bg-[#1A6140]/30 pb-16`} style={{ fontFamily: '"Comfortaa", cursive' }}>
            <LandingBackground theme={theme} />

            {/* TOP NAVIGATION BAR */}
            <nav className="w-full relative z-50 flex items-center justify-between px-6 md:px-10 max-w-7xl mx-auto pt-2 md:pt-0 pb-2 md:pb-0 h-auto md:h-20"
                 style={isSmallScreen ? { paddingTop: 'calc(env(safe-area-inset-top) + 12px)', height: 'auto' } : {}}>
                <div className="flex items-center gap-2">
                    <img
                        src={isLight ? "/goblogo.png" : "/gowlogo.png"}
                        alt="15market"
                        className="h-14 w-auto drop-shadow-[0_0_20px_rgba(26, 97, 64,0.3)]"
                    />
                </div>

                {/* Desktop Action Menu */}
                <div className="hidden md:flex items-center gap-3">
                    <button 
                        onClick={onDocs}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border transition-all ${
                            isLight 
                                ? 'bg-white border-black/5 hover:bg-black/5 text-[#0a261a]' 
                                : 'bg-white/5 border-white/5 hover:bg-white/10 text-white'
                        }`}
                    >
                        <BookOpen size={13} className="text-[#1A6140]" />
                        <span>Docs</span>
                    </button>
                    <a 
                        href="https://x.com/15_markets"
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 border transition-all ${
                            isLight 
                                ? 'bg-white border-black/5 hover:bg-black/5 text-[#0a261a]' 
                                : 'bg-white/5 border-white/5 hover:bg-white/10 text-white'
                        }`}
                    >
                        <XLogo />
                        <span>Contact</span>
                    </a>
                </div>

                {/* Mobile Dropdown Menu Trigger */}
                <div className="md:hidden relative z-50">
                    <button 
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className={`p-2.5 rounded-xl border transition-all ${
                            isLight 
                                ? 'bg-white border-black/5 hover:bg-black/5 text-[#0a261a]' 
                                : 'bg-white/5 border-white/5 hover:bg-white/10 text-white'
                        }`}
                    >
                        {mobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
                    </button>

                    {/* Mobile Dropdown Panel */}
                    <AnimatePresence>
                        {mobileMenuOpen && (
                            <motion.div 
                                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                                transition={{ duration: 0.15 }}
                                className={`absolute right-0 mt-2 w-44 rounded-2xl border p-2 flex flex-col gap-1 z-50 ${cardBg}`}
                            >
                                <button 
                                    onClick={() => { setMobileMenuOpen(false); onDocs(); }}
                                    className={`w-full px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 text-left transition-colors ${
                                        isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'
                                    }`}
                                >
                                    <BookOpen size={12} className="text-[#1A6140]" />
                                    <span>Docs</span>
                                </button>
                                <a 
                                    href="https://x.com/15_markets"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => setMobileMenuOpen(false)}
                                    className={`w-full px-3.5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 text-left transition-colors ${
                                        isLight ? 'hover:bg-black/5' : 'hover:bg-white/5'
                                    }`}
                                >
                                    <XLogo />
                                    <span>Contact Us</span>
                                </a>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </nav>

            {/* HERO INTRODUCTION */}
            <header className="w-full max-w-5xl mx-auto text-center px-6 pt-8 pb-6 relative z-10 flex flex-col items-center gap-4">
                <div className="h-[70px] sm:h-[90px] flex items-center justify-center">
                    <h1 className="text-xl sm:text-3xl md:text-4xl font-black tracking-tight uppercase leading-snug">
                        <span className="text-transparent bg-clip-text bg-gradient-to-b from-[#1A6140] to-[#123F28] inline-block filter drop-shadow-[0_0_15px_rgba(26, 97, 64,0.25)]">
                            {displayText}
                        </span>
                        <span className="inline-block w-[1.5px] h-[0.75em] bg-[#1A6140] ml-1.5 animate-pulse" />
                    </h1>
                </div>
                <p className={`text-[10px] sm:text-xs uppercase tracking-widest max-w-lg mx-auto opacity-75 font-semibold leading-relaxed ${isLight ? 'text-black/60' : 'text-white/50'}`}>
                    15market is a decentralized binary prediction market.<br />
                    Pick your direction, set your stake, set the duration of the trade and let the market decide in seconds.
                </p>

                <div className="mt-2 hover:scale-[1.03] transition-transform duration-500">
                    <UnifiedWalletButton theme="dark" />
                </div>
            </header>

            {/* SCREEN MOCKUPS SECTION (Desktop Macbook and Mobile iPhone side-by-side) */}
            <section className="w-full max-w-7xl mx-auto px-6 mt-8 relative z-10 flex flex-col lg:flex-row gap-8 items-center justify-center">
                
                {/* 1. MacBook Pro Mockup (Desktop side only) */}
                <div className="hidden lg:flex flex-1 w-full max-w-[800px] flex-col items-center relative">
                    {/* Mascot positioned with hand resting on the MacBook screen */}
                    <img 
                        src="/mascot.png" 
                        alt="Mascot" 
                        className="absolute right-[-231px] top-[-76px] h-[432px] z-30 pointer-events-none select-none"
                        style={{ filter: 'drop-shadow(0 28px 24px rgba(0,0,0,0.75)) drop-shadow(0 8px 40px rgba(26, 97, 64,0.22)) drop-shadow(-4px 0 20px rgba(0,0,0,0.5))' }}
                    />
                    {/* Screen Outer Bezel */}
                    <div className="w-full aspect-[16/9] bg-[#121212] rounded-t-[20px] p-2 border-[2px] border-[#333] shadow-[0_25px_60px_rgba(0,0,0,0.55)] flex flex-col relative overflow-hidden">
                        
                        {/* Screen Content Box */}
                        <div className="flex-1 bg-[#050505] rounded-[6px] overflow-hidden relative">
                            {/* MacBook Screen Notch */}
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-3 bg-black rounded-b-[4px] z-20 flex items-center justify-center gap-1.5 border-b border-x border-white/5">
                                {/* Camera lens */}
                                <span className="w-1 h-1 rounded-full bg-[#111]" />
                                {/* Green indicator light */}
                                <span className="w-[1.5px] h-[1.5px] rounded-full bg-[#1A6140]/80 animate-pulse" />
                            </div>
                            <img 
                                src="/deskto.png" 
                                alt="15market Desktop Terminal" 
                                className="w-full h-full object-cover bg-[#050505]"
                            />
                        </div>

                        {/* Webcam Notch */}
                        <div className="absolute top-0.5 left-1/2 -translate-x-1/2 w-12 h-1 bg-black rounded-b-sm z-30 border-b border-x border-[#222]" />
                    </div>
                    {/* Keyboard Lower Deck */}
                    <div className="w-[114%] h-2.5 bg-[#444] rounded-b-[4px] relative shadow-[0_10px_20px_rgba(0,0,0,0.3)]">
                        {/* Keyboard indent notch */}
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-16 h-1 bg-[#222] rounded-b-sm" />
                    </div>
                </div>

                {/* 2. iPhone 15 Pro with Dynamic Island Mockup (Mobile side only) */}
                <div className="flex lg:hidden w-[280px] flex-col items-center translate-y-[19px] relative z-10">
                    <img 
                        src="/mobilemock.png" 
                        alt="15market Mobile View" 
                        className="w-full h-auto drop-shadow-[0_25px_60px_rgba(0,0,0,0.8)]"
                    />
                </div>

            </section>
        </div>
    );
}
