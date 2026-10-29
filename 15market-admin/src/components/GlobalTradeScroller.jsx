import React, { useEffect, useState, useRef, useMemo, useCallback, memo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, ArrowDown, Megaphone } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';
import { socketService } from '../utils/socket';

function GlobalTradeScrollerComponent({ theme, isV1 = false }) {
    const [history, setHistory] = useState(() => {
        try {
            const saved = localStorage.getItem("15market_global_history_v2");
            return saved ? JSON.parse(saved) : [];
        } catch (e) { return []; }
    });
    const [profiles, setProfiles] = useState({});
    const [activeBroadcast, setActiveBroadcast] = useState(null);
    const lastFetchRef = useRef(0);

    // Broadcast choreography — a megaphone icon sprints through the strip from
    // beyond the right edge, parks at the left end, THEN the message marquee
    // starts running. When the broadcast ends (expiry / withdrawal) the icon
    // sprints out to the right and off screen before the trades ticker returns.
    // idle → icon-in → announce → icon-out → idle
    const [phase, setPhase] = useState('idle');
    const phaseRef = useRef('idle');
    const activeRef = useRef(null);
    const exitAtRef = useRef(0);
    const stripRef = useRef(null);
    const [stripW, setStripW] = useState(900);

    useEffect(() => { phaseRef.current = phase; }, [phase]);
    useEffect(() => { activeRef.current = activeBroadcast; }, [activeBroadcast]);

    // Track the strip width so the icon sprints from beyond the right edge
    // (and exits past it) at any viewport size.
    useEffect(() => {
        const measure = () => setStripW(stripRef.current?.clientWidth || 900);
        measure();
        window.addEventListener('resize', measure);
        return () => window.removeEventListener('resize', measure);
    }, []);

    const announceBroadcast = useCallback((msg) => {
        setActiveBroadcast(msg);
        // A fresh broadcast (or a replacement while the last one is exiting)
        // restarts the entrance; a replacement mid-show keeps the icon parked.
        setPhase(p => (p === 'idle' || p === 'icon-out') ? 'icon-in' : p);
    }, []);

    const endBroadcastShow = useCallback(() => {
        exitAtRef.current = Date.now();
        setPhase(p => (p === 'idle' ? p : 'icon-out'));
    }, []);

    const isLight = theme === 'light';

    const truncate = (str) => str ? `${str.slice(0, 4)}...${str.slice(-4)}` : "";

    const fetchGlobalData = useCallback(async () => {
        try {
            const arcRes = await fetch(`${KEEPER_URL_ARC}/history`);
            if (arcRes.ok) {
                const arcData = await arcRes.json();
                if (Array.isArray(arcData)) {
                    arcData.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
                    const finalHistory = arcData.slice(0, 80);

                    const newJson = JSON.stringify(finalHistory.map(h => h.id));
                    const oldJson = JSON.stringify(history.map(h => h.id));
                    if (newJson !== oldJson) {
                        setHistory(finalHistory);
                        localStorage.setItem("15market_global_history_v2", JSON.stringify(finalHistory));
                    }

                    let updatedProfiles = { ...profiles };
                    const ownersToFetch = Array.from(new Set(finalHistory.map(item => item.owner)))
                        .filter(owner => owner && !updatedProfiles[owner]);

                    if (ownersToFetch.length > 0) {
                        await Promise.all(ownersToFetch.map(async (owner) => {
                            try {
                                const keeperRes = await fetch(`${KEEPER_URL_ARC}/profile?address=${owner}`);
                                if (keeperRes.ok) {
                                    const keeperData = await keeperRes.json();
                                    if (keeperData && keeperData.username) {
                                        updatedProfiles[owner] = keeperData;
                                        return;
                                    }
                                }
                                updatedProfiles[owner] = { username: truncate(owner) };
                            } catch (e) {
                                updatedProfiles[owner] = { username: truncate(owner) };
                            }
                        }));
                        setProfiles(prev => ({ ...prev, ...updatedProfiles }));
                    }
                }
            }
            lastFetchRef.current = Date.now();
        } catch (err) {
            console.error("Global Scroller Sync Error:", err);
        }
    }, []);

    useEffect(() => {
        fetchGlobalData();
        const interval = setInterval(fetchGlobalData, 12000);

        // Real-time Socket Listener for Zero-Latency Broadcasts.
        // The backend emits `broadcast` with a `message` field (older builds
        // listened for `new_broadcast`/`text`, which never fired — the banner
        // was dead). Both fields arrive today, so read either.
        const unbindBroadcast = socketService.on('broadcast', (msg) => {
            if (!msg) return;
            const text = msg.message || msg.text;
            if (msg.withdrawn || (msg.expiry && msg.expiry <= Date.now())) {
                // Ends the show (icon sprints out) — but only if THIS broadcast
                // is the one currently on display.
                const shown = activeRef.current;
                if (shown && String(shown.id) === String(msg.id)) endBroadcastShow();
                return;
            }
            if (text && msg.expiry > Date.now()) {
                announceBroadcast(msg);
            }
        });

        const fetchBroadcast = async () => {
            try {
                // Check Maintenance Mode
                const settingsSaved = localStorage.getItem('15market_citadel_settings');
                if (settingsSaved) {
                    const settings = JSON.parse(settingsSaved);
                    if (settings.maintenanceMode) {
                        announceBroadcast({
                            id: 'maintenance-mode',
                            type: 'MAINTENANCE',
                            text: 'SYSTEM UNDER MAINTENANCE — TRADING OPERATIONS SUSPENDED',
                            expiry: Date.now() + 99999999
                        });
                        return;
                    }
                }

                const res = await fetch(`${KEEPER_URL_ARC}/broadcast`);
                if (res.ok) {
                    const b = await res.json();
                    const text = b && (b.message || b.text);
                    if (b && !b.withdrawn && text && b.expiry > Date.now()) {
                        announceBroadcast(b);
                    } else if (phaseRef.current === 'icon-in' || phaseRef.current === 'announce') {
                        // Server says the broadcast is gone (expired or
                        // withdrawn): run the exit choreography instead of
                        // yanking the strip mid-animation.
                        endBroadcastShow();
                    }
                }
            } catch (e) { }
        };

        fetchBroadcast();
        const bInterval = setInterval(fetchBroadcast, 30000);

        return () => {
            clearInterval(interval);
            clearInterval(bInterval);
            unbindBroadcast();
        };
    }, []);

    // Self-ending: if the page missed the server's expiry/withdrawal pulse,
    // the broadcast still ends exactly on time — the icon sprints out and the
    // trades ticker returns.
    useEffect(() => {
        if (!activeBroadcast || !activeBroadcast.expiry) return undefined;
        const ms = activeBroadcast.expiry - Date.now();
        if (ms <= 0) { endBroadcastShow(); return undefined; }
        const timer = setTimeout(endBroadcastShow, ms + 200);
        return () => clearTimeout(timer);
    }, [activeBroadcast, endBroadcastShow]);

    const ghostTrades = useMemo(() => {
        const symbols = ["ETH", "BTC"];
        return Array.from({ length: 8 }).map((_, i) => ({
            id: `ghost-${i}`,
            owner: "0x0000000000000000000000000000000000000000",
            username: ["Alpha_Bot", "Pulse_V1", "Sonic_X", "Whale_88"][i % 4],
            amount: (Math.random() * 5 + 1).toFixed(2),
            symbol: symbols[i % symbols.length],
            direction: Math.random() > 0.5 ? "UP" : "DOWN",
            timestamp: Date.now() - (i * 30000),
            isGhost: true
        }));
    }, []);

    // Participation feed — every trade shows, whatever its status. Win/loss
    // is never shown here: the strip indexes who traded WHAT, which way, and
    // how many shares they bought.
    const mergedHistory = useMemo(() => {
        const participants = (history || []).filter(t => t && (t.amount || t.shares));
        if (participants.length === 0) return ghostTrades;
        participants.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return participants.slice(0, 40);
    }, [history, ghostTrades]);

    const repeatedHistory = useMemo(() => {
        if (!mergedHistory || mergedHistory.length === 0) return [];
        let list = [...mergedHistory];
        while (list.length < 30) { list = [...list, ...mergedHistory]; }
        return [...list, ...list];
    }, [mergedHistory]);

    // Key changes when new trades arrive, causing animation to reset so fresh trades are visible immediately
    const scrollerKey = useMemo(() => {
        if (!mergedHistory || mergedHistory.length === 0) return 'empty';
        return `${mergedHistory[0]?.id}-${mergedHistory.length}`;
    }, [mergedHistory]);

    const v1Bg = isLight ? 'bg-white zigzag-ticker shadow-sm' : 'bg-[#0a0a0a] zigzag-ticker zigzag-outline';

    // Theme treatment (per product spec): dark mode = BLACK-filtered asset
    // logos and black texts; light mode = WHITE-filtered logos and white
    // texts. The icon inverts to match the text ink.
    const inkFilter = isLight ? 'brightness(0) invert(1)' : 'brightness(0)'; // logo paint
    const inkClass = isLight ? 'text-white' : 'text-black';
    const inkSoftClass = isLight ? 'text-white/70' : 'text-black/70';

    return (
        <div ref={stripRef} className={`w-full ${isV1 ? 'h-5 md:h-6 lg:h-10 ' + v1Bg : 'h-7 md:h-7 lg:h-10 bg-[#1A6140]'} relative z-[45] overflow-hidden`} style={{ fontFamily: '"Comfortaa", cursive' }}>
            {/* Smooth Transition Layer for Broadcasts */}
            <AnimatePresence mode="wait">
                {activeBroadcast ? (
                    <motion.div
                        key="broadcast-ticker"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0, transition: { duration: 0.25 } }}
                        transition={{ duration: 0.4, ease: "circOut" }}
                        className="absolute inset-0"
                    >
                        {/* ── Message marquee — starts running once the icon parks ── */}
                        {(phase === 'announce' || phase === 'icon-out') && (
                            <motion.div
                                initial={{ opacity: 0, x: -34 }}
                                animate={{ opacity: phase === 'icon-out' ? 0 : 1, x: 0 }}
                                transition={{ duration: phase === 'icon-out' ? 0.25 : 0.55, ease: 'circOut' }}
                                className="absolute inset-0 flex items-center z-0"
                            >
                                <div
                                    className={`flex items-center whitespace-nowrap ${isV1 ? 'bg-amber-500/10' : ''}`}
                                    style={{ animation: 'ticker-move 60s linear infinite', willChange: 'transform' }}
                                >
                                    {[0, 1].map((half) => (
                                        <div key={half} className="flex items-center">
                                            {[...Array(8)].map((_, i) => (
                                                <div key={i} className="flex items-center gap-3 px-8">
                                                    <span className={`${isV1 ? 'text-[11px] font-black' : 'text-[10px]'} uppercase tracking-[0.2em] ${isV1 ? 'text-amber-500' : inkClass}`}>
                                                        {activeBroadcast.message || activeBroadcast.text}
                                                    </span>
                                                    {/* Diamond separator — shape accent between repeats */}
                                                    <span className={`w-1.5 h-1.5 rotate-45 flex-none ${isV1 ? 'bg-amber-500/60' : isLight ? 'bg-white/40' : 'bg-black/40'}`} />
                                                </div>
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        )}

                        {/* ── Edge masks: text dissolves in behind the icon, out at the wrap ── */}
                        {phase === 'announce' && (
                            <>
                                <div className={`absolute left-0 top-0 bottom-0 w-16 z-[5] bg-gradient-to-r pointer-events-none ${isV1 ? (isLight ? 'from-white' : 'from-[#0a0a0a]') : 'from-[#1A6140]'}`} />
                                <div className={`absolute right-0 top-0 bottom-0 w-16 z-[5] bg-gradient-to-l pointer-events-none ${isV1 ? (isLight ? 'from-white' : 'from-[#0a0a0a]') : 'from-[#1A6140]'}`} />
                            </>
                        )}

                        {/* ── The announcement icon: sprints in → parks → sprints out ── */}
                        {phase !== 'idle' && (
                            <motion.div
                                className="absolute left-2 top-1/2 z-10"
                                style={{ y: '-50%' }}
                                initial={{ x: stripW + 80, opacity: 0, scale: 0.4, rotate: -170 }}
                                animate={phase === 'icon-out' ? {
                                    x: stripW + 140,
                                    opacity: [1, 1, 0],
                                    scale: [1, 1.25, 0.5],
                                    rotate: [0, 160, 540],
                                } : {
                                    x: [stripW + 80, 26, -8, 0],
                                    opacity: 1,
                                    scale: [0.4, 1.35, 0.9, 1],
                                    rotate: [-170, 12, -8, 0],
                                }}
                                transition={phase === 'icon-out' ? {
                                    x: { duration: 1.15, ease: [0.55, 0, 0.85, 0.36] },
                                    rotate: { duration: 1.15, ease: 'easeInOut' },
                                    scale: { duration: 1.15, times: [0, 0.4, 1] },
                                    opacity: { duration: 1.15, times: [0, 0.6, 1] },
                                    default: { duration: 1.15 },
                                } : {
                                    x: { duration: 1.6, times: [0, 0.55, 0.8, 1], ease: 'easeOut' },
                                    rotate: { duration: 1.6, times: [0, 0.55, 0.8, 1], ease: 'easeOut' },
                                    scale: { duration: 1.6, times: [0, 0.55, 0.8, 1], ease: 'easeOut' },
                                    opacity: { duration: 0.3 },
                                    default: { duration: 1.6 },
                                }}
                                onAnimationComplete={() => {
                                    if (phase === 'icon-in') {
                                        setPhase('announce'); // icon parked — start the marquee
                                    } else if (phase === 'icon-out' && phaseRef.current === 'icon-out' && Date.now() - exitAtRef.current > 900) {
                                        // The timestamp guard rejects completion callbacks
                                        // from a cancelled ENTRANCE when a withdrawal
                                        // interrupts the run-in.
                                        setActiveBroadcast(null); // fully out — hand the strip back
                                        setPhase('idle');
                                    }
                                }}
                            >
                                <div className={`relative flex items-center justify-center ${isV1 ? 'text-amber-500' : isLight ? 'text-white' : 'text-black'}`}>
                                    {/* Parked shockwave rings */}
                                    {[0, 1].map((r) => (
                                        <motion.span
                                            key={`ring-${r}`}
                                            className="absolute inset-0 rounded-full border-2 border-current"
                                            animate={{ scale: [1, 2.8], opacity: [0.5, 0] }}
                                            transition={{ duration: 1.5, repeat: Infinity, delay: r * 0.55, ease: 'easeOut' }}
                                        />
                                    ))}
                                    {/* Rotating dashed halo */}
                                    <motion.span
                                        className="absolute -inset-1.5 rounded-full border border-dashed border-current opacity-40"
                                        animate={{ rotate: 360 }}
                                        transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
                                    />
                                    {/* The megaphone, wiggling as it shouts */}
                                    <motion.span
                                        className="relative flex"
                                        animate={{ rotate: [0, -14, 9, 0], scale: [1, 1.12, 1] }}
                                        transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                                    >
                                        <Megaphone size={isV1 ? 15 : 13} fill="currentColor" strokeWidth={2.4} className="drop-shadow-[0_0_6px_currentColor]" />
                                    </motion.span>
                                    {/* Shout bars flicking beside the mouth (staggered equalizer) */}
                                    <span className="absolute left-full top-1/2 -translate-y-1/2 ml-1 flex items-end gap-[2px] h-3">
                                        {[0, 1, 2].map((b) => (
                                            <motion.span
                                                key={`bar-${b}`}
                                                className="w-[2px] rounded-full bg-current"
                                                animate={{ height: ['30%', '100%', '45%'] }}
                                                transition={{ duration: 0.7, repeat: Infinity, delay: b * 0.14, ease: 'easeInOut' }}
                                            />
                                        ))}
                                    </span>
                                    {/* Sprint trail: diamond sparks whipping backwards */}
                                    {[0, 1, 2].map((s) => (
                                        <motion.span
                                            key={`trail-${s}`}
                                            className="absolute right-[-2px] top-1/2 w-1.5 h-1.5 bg-current"
                                            animate={{ x: [8, 30], opacity: [0.65, 0], rotate: [45, 135], scale: [1, 0.3] }}
                                            transition={{ duration: 0.6, repeat: Infinity, delay: s * 0.11, ease: 'easeOut' }}
                                        />
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </motion.div>
                ) : (
                    <motion.div
                        key={scrollerKey}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.4, ease: "circOut" }}
                        className="flex items-center h-full"
                    >
                        <div
                            className="flex items-center h-full whitespace-nowrap"
                            style={{ animation: 'ticker-move 280s linear infinite', willChange: 'transform' }}
                        >
                            {repeatedHistory.map((event, i) => {
                                const isUp = event.direction === "UP" || event.direction === 1 || String(event.direction) === "1";
                                const ticker = (event.symbol ? event.symbol.split('/')[0] : 'BTC').toUpperCase();
                                const sym = ticker.toLowerCase();
                                const logoSrc = `/logos/${sym}.png`;
                                const shares = parseFloat(event.shares || event.amount || 0).toFixed(2);

                                return (
                                    <div key={`${event.id}-${i}`} className={`flex items-center gap-5 ${isV1 ? 'px-8 border-r-2' : 'px-10 border-r'} border-white/10 h-full`}>
                                        {/* Asset logo (theme-filtered) */}
                                        <img
                                            src={logoSrc}
                                            alt={ticker}
                                            className={`${isV1 ? 'w-3.5 h-3.5' : 'w-4 h-4'} object-contain`}
                                            style={{ filter: inkFilter }}
                                            onError={(e) => { e.target.style.display = 'none'; }}
                                        />
                                        {/* Asset ticker */}
                                        <span className={`${isV1 ? 'text-[10px]' : 'text-[11px]'} font-black uppercase tracking-[0.2em] ${inkClass}`}>
                                            {ticker}
                                        </span>

                                        {/* Prediction: up/down chip + label */}
                                        <div className="flex items-center gap-3">
                                            <div className={`p-1 rounded-full ${isLight ? 'bg-white/10' : 'bg-black/10'}`}>
                                                {isUp
                                                    ? <ArrowUp size={isV1 ? 10 : 12} className={inkClass} />
                                                    : <ArrowDown size={isV1 ? 10 : 12} className={inkClass} />}
                                            </div>
                                            <span className={`${isV1 ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest ${inkClass}`}>
                                                {isUp ? 'UP' : 'DOWN'}
                                            </span>
                                        </div>

                                        {/* Shares bought */}
                                        <span className={`${isV1 ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest ${inkSoftClass}`}>
                                            {shares} SHARES
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            {/* Green loading-modal background, exactly as GlobalLoader: the
                same carbon-fibre texture at the same opacity over the green. */}
            <div className="absolute inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />
        </div>
    );
}

export const GlobalTradeScroller = memo(GlobalTradeScrollerComponent);
