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
    // True only when the broadcast arrived LIVE (admin just pushed it) —
    // drives the one-shot arrival beam/pop. Persisted broadcasts restore
    // quietly instead.
    const [freshPush, setFreshPush] = useState(false);
    const arrivalTimer = useRef(null);
    const lastFetchRef = useRef(0);

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

        // Real-time Socket Listener for Zero-Latency Broadcasts. A live push
        // triggers the unique arrival animation; later cleanup re-flags off.
        const unbindBroadcast = socketService.on('new_broadcast', (msg) => {
            if (msg && msg.text && msg.expiry > Date.now()) {
                setActiveBroadcast(msg);
                setFreshPush(true);
                if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
                arrivalTimer.current = setTimeout(() => setFreshPush(false), 2200);
            }
        });

        const fetchBroadcast = async () => {
            try {
                // Check Maintenance Mode
                const settingsSaved = localStorage.getItem('15market_citadel_settings');
                if (settingsSaved) {
                    const settings = JSON.parse(settingsSaved);
                    if (settings.maintenanceMode) {
                        setActiveBroadcast({
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
                    if (b && b.text && b.expiry > Date.now()) {
                        setActiveBroadcast(b);
                    } else {
                        // Only clear if it's not a real-time broadcast that hasn't expired yet
                        setActiveBroadcast(prev => (prev && prev.expiry > Date.now()) ? prev : null);
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
            if (arrivalTimer.current) clearTimeout(arrivalTimer.current);
        };
    }, []);

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
        <div className={`w-full ${isV1 ? 'h-5 md:h-6 lg:h-10 ' + v1Bg : 'h-7 md:h-7 lg:h-10 bg-[#1A6140]'} relative z-[45] overflow-hidden`} style={{ fontFamily: '"Comfortaa", cursive' }}>
            {/* Smooth Transition Layer for Broadcasts */}
            <AnimatePresence mode="wait">
                {activeBroadcast ? (
                    <motion.div
                        key="broadcast-ticker"
                        initial={freshPush ? { opacity: 0, y: -28, scaleY: 1.35 } : { opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0, scaleY: 1 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={freshPush
                            ? { type: "spring", stiffness: 420, damping: 26 }
                            : { duration: 0.5, ease: "circOut" }}
                        className="absolute inset-0 flex items-center"
                    >
                        {/* One-shot warm flash — only for a live admin push */}
                        {freshPush && (
                            <div key={`flash-${activeBroadcast.id || 'fresh'}`} className="announce-flash" />
                        )}
                        {/* Skewed beam sweeping across the strip on arrival */}
                        {freshPush && (
                            <div key={`beam-${activeBroadcast.id || 'fresh'}`} className="announce-sweep-beam" />
                        )}
                        <div
                            className={`flex items-center gap-10 whitespace-nowrap px-10 ${isV1 ? 'bg-amber-500/10' : ''}`}
                            style={{ animation: 'ticker-move 60s linear infinite', willChange: 'transform' }}
                        >
                            {[...Array(15)].map((_, i) => (
                                <div key={i} className="flex items-center gap-2.5">
                                    <Megaphone
                                        size={isV1 ? 14 : 12}
                                        className={`${isV1 ? 'text-amber-500' : isLight ? 'text-white' : 'text-black'} ${freshPush ? 'announce-pop' : ''}`}
                                        style={freshPush ? { animationDelay: `${Math.min(i, 3) * 0.05}s` } : undefined}
                                    />
                                    <span className={`${isV1 ? 'text-[11px] font-black' : 'text-[10px]'} uppercase tracking-[0.2em] ${isV1 ? 'text-amber-500' : inkClass}`}>
                                        {activeBroadcast.text}
                                    </span>
                                </div>
                            ))}
                        </div>
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
