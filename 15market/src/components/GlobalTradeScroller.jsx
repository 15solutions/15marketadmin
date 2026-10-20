import React, { useEffect, useState, useRef, memo, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, ArrowUp, ArrowDown, Check, X, Megaphone } from 'lucide-react';
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
    const [campaignBroadcast, setCampaignBroadcast] = useState(null);
    const [isCampaignWindow, setIsCampaignWindow] = useState(false);
    const lastFetchRef = useRef(0);

    const isLight = theme === 'light';
    const WIN_COLOR = "#1A6140"; // Green
    const LOSS_COLOR = "#FF7F50"; // Coral/Red

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

        // Real-time Socket Listener for Zero-Latency Broadcasts
        const unbindBroadcast = socketService.on('new_broadcast', (msg) => {
            if (msg && msg.text && msg.expiry > Date.now()) {
                console.log("📢 Real-time Broadcast Received:", msg);
                setActiveBroadcast(msg);
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

        // Campaign Scroller Logic
        const fetchCampaigns = async () => {
            try {
                const res = await fetch(`${KEEPER_URL_ARC}/campaigns`);
                if (res.ok) {
                    const data = await res.json();
                    const active = data.find(c => Date.now() >= c.startTime && Date.now() < c.endTime);
                    if (active) {
                        setCampaignBroadcast({
                            text: `🏆 ACTIVE CAMPAIGN: ${active.title} — JOIN NOW TO WIN ${active.prize || ''}!`,
                            id: active.id
                        });
                    } else {
                        setCampaignBroadcast(null);
                    }
                }
            } catch (e) { }
        };

        const checkTimeWindow = () => {
            const now = new Date();
            const minutes = now.getMinutes();
            // Show for minute 0 of every 10-minute cycle
            setIsCampaignWindow(minutes % 10 === 0);
        };

        fetchCampaigns();
        const cInterval = setInterval(fetchCampaigns, 60000);
        
        checkTimeWindow();
        const tInterval = setInterval(checkTimeWindow, 1000);

        return () => {
            clearInterval(interval);
            clearInterval(bInterval);
            clearInterval(cInterval);
            clearInterval(tInterval);
            unbindBroadcast();
        };
    }, []);

    const ghostTrades = useMemo(() => {
        const symbols = ["ETH", "BTC"];
        const names = ["Alpha_Bot", "Pulse_V1", "Sonic_X", "Whale_88"];
        return Array.from({ length: 8 }).map((_, i) => ({
            id: `ghost-${i}`,
            owner: "0x0000000000000000000000000000000000000000",
            username: names[i % names.length],
            amount: (Math.random() * 5 + 1).toFixed(2),
            symbol: symbols[i % symbols.length],
            direction: Math.random() > 0.5 ? "UP" : "DOWN",
            status: Math.random() > 0.5 ? "WON" : "LOST",
            payout: (Math.random() * 4 + 4).toFixed(2),
            timestamp: Date.now() - (i * 30000),
            isGhost: true
        }));
    }, []);

    const mergedHistory = useMemo(() => {
        const filtered = history.filter(t => ["WON", "LOST"].includes(t.status));
        if (filtered.length === 0) return ghostTrades;
        filtered.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return filtered.slice(0, 40);
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
    const v1TextClass = isLight ? 'text-[#0a261a]' : 'text-white';
    const switchEffectBg = isLight
        ? 'text-white'
        : 'text-white';

    return (
        <div className={`w-full ${isV1 ? 'h-5 md:h-6 lg:h-10 ' + v1Bg : 'h-7 md:h-7 lg:h-10 bg-[#1A6140] text-white zigzag-ticker'} relative z-[45] overflow-hidden`} style={{ fontFamily: '"Comfortaa", cursive' }}>
            {/* Smooth Transition Layer for Broadcasts */}
            <AnimatePresence mode="wait">
                {(activeBroadcast || (isCampaignWindow && campaignBroadcast)) ? (
                    <motion.div
                        key="broadcast-ticker"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.5, ease: "circOut" }}
                        className="absolute inset-0 flex items-center"
                    >
                        <div
                            className={`flex items-center gap-10 whitespace-nowrap px-10 ${isV1 ? 'bg-amber-500/10' : ''}`}
                            style={{ animation: 'ticker-move 60s linear infinite', willChange: 'transform' }}
                        >
                            {[...Array(15)].map((_, i) => (
                                <div key={i} className="flex items-center gap-2">
                                    <Megaphone size={isV1 ? 14 : 12} className={`${isV1 ? 'text-amber-500' : 'text-white'}`} />
                                    <span className={`${isV1 ? 'text-[11px] font-black' : 'text-[10px]'} uppercase tracking-[0.2em] ${isV1 ? 'text-amber-500' : 'text-white'}`}>
                                        {isCampaignWindow && campaignBroadcast ? campaignBroadcast.text : activeBroadcast.text}
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
                                const isWon = event.status === "WON";

                                return (
                                    <div key={`${event.id}-${i}`} className={`flex items-center gap-5 ${isV1 ? 'px-8 border-r-2' : 'px-10 border-r'} border-white/10 h-full`}>
                                        <div className="flex items-center gap-3">
                                            <div className="p-1 rounded-full bg-white/10">
                                                {isUp ? <ArrowUp size={isV1 ? 10 : 12} className="text-white" /> : <ArrowDown size={isV1 ? 10 : 12} className="text-white" />}
                                            </div>
                                            <span className={`${isV1 ? 'text-[10px]' : 'text-[11px]'} font-black uppercase tracking-[0.2em] text-white`}>
                                                {event.symbol ? event.symbol.split('/')[0] : 'BTC'}
                                            </span>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <div className="flex items-center gap-2">
                                                {isWon ? <Check size={isV1 ? 10 : 12} className="text-white" /> : <X size={isV1 ? 10 : 12} className="text-white/60" />}
                                                <span className={`${isV1 ? 'text-[9px]' : 'text-[10px]'} font-black uppercase tracking-widest text-white`}>
                                                    {isWon ? `WON $${parseFloat(event.payout || event.amount || 0).toFixed(2)}` : 'LOST'}
                                                </span>
                                            </div>
                                        </div>
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
