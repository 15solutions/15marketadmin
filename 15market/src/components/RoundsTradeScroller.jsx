import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import { KEEPER_URL_ARC, KEEPER_URL_ROUNDS } from '../constants';
import { Radio, ArrowUp, ArrowDown, Check, X } from 'lucide-react';
import { socketService } from '../utils/socket';

function RoundsTradeScrollerComponent({ theme, isV1 = false }) {
    const [history, setHistory] = useState([]);
    const [activeBroadcast, setActiveBroadcast] = useState(null);

    const isLight = theme === 'light';
    const WIN_COLOR = "#1A6140"; 
    const LOSS_COLOR = "#FF7F50"; 

    const fetchRoundsData = useCallback(async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ROUNDS}/history`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setHistory(data.slice(0, 40));
                }
            }
        } catch (err) {
            console.error("Rounds Scroller Sync Error:", err);
        }
    }, []);

    useEffect(() => {
        fetchRoundsData();
        const interval = setInterval(fetchRoundsData, 5000);

        const fetchBroadcast = async () => {
            try {
                // 1. Check Maintenance Mode Local Cache
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

                // 2. Fetch Live Global Broadcast
                const res = await fetch(`${KEEPER_URL_ARC}/broadcast`);
                if (res.ok) {
                    const b = await res.json();
                    if (b && b.text && b.expiry > Date.now()) {
                        setActiveBroadcast(b);
                    } else {
                        setActiveBroadcast(null);
                    }
                } else {
                    setActiveBroadcast(null);
                }
            } catch (e) { setActiveBroadcast(null); }
        };

        fetchBroadcast();
        const bInterval = setInterval(fetchBroadcast, 15000); // Poll less frequently as fallback

        // 3. Event-Driven Socket Listener (Zero Latency)
        const unbindBroadcast = socketService.on('broadcast', (b) => {
            if (b && (b.text || b.message) && b.expiry > Date.now()) {
                setActiveBroadcast({
                    ...b,
                    text: b.text || b.message
                });
            } else {
                setActiveBroadcast(null);
            }
        });

        return () => {
            clearInterval(interval);
            clearInterval(bInterval);
            unbindBroadcast();
        };
    }, []);

    const repeatedHistory = useMemo(() => {
        if (!history || history.length === 0) return [];
        let list = [...history];
        while (list.length < 30) { list = [...list, ...history]; }
        return [...list, ...list];
    }, [history]);

    if (history.length === 0) return null;

    const v1Bg = isLight ? 'bg-white zigzag-ticker shadow-sm' : 'bg-[#0a0a0a] zigzag-ticker zigzag-outline';
    const v2Bg = isLight ? 'bg-white zigzag-ticker ticker-v2 shadow-sm' : 'bg-[#050505] ticker-v2';

    return (
        <div className={`w-full ${isV1 ? 'h-5 md:h-6 lg:h-10 border-y-2 ' + v1Bg : 'h-5 md:h-6 lg:h-10 ' + v2Bg} relative z-[45] overflow-hidden`}>
            {activeBroadcast ? (
                <div className={`absolute inset-0 flex items-center ${isV1 ? 'bg-amber-500/10' : (isLight ? 'bg-[#1A6140]' : 'bg-[#0a0a0a]')}`} style={{ animation: 'fadeIn 0.3s ease' }}>
                    <div
                        className="flex items-center gap-10 whitespace-nowrap px-10"
                        style={{ animation: 'ticker-move 30s linear infinite', willChange: 'transform' }}
                    >
                        {[...Array(10)].map((_, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <Radio size={12} className={`${isV1 ? 'text-amber-500' : 'text-white'}`} />
                                <span className={`text-[10px] uppercase tracking-[0.2em] ${isV1 ? 'text-amber-500' : 'text-white'}`}>
                                    {activeBroadcast.text}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex items-center h-full" style={{ animation: 'fadeIn 0.2s ease' }}>
                    <div
                        className="flex items-center h-full whitespace-nowrap"
                        style={{ animation: 'ticker-move 100s linear infinite', willChange: 'transform' }}
                    >
                        {repeatedHistory.map((event, i) => {
                            const isWon = event.status === "WON";
                            const color = isWon ? WIN_COLOR : LOSS_COLOR;
                            const isUp = event.settlePrice > event.lockPrice;

                            return (
                                <div key={`${event.id}-${i}`} className={`flex items-center gap-5 ${isV1 ? 'px-8 border-r-2' : 'px-10 border-r'} border-white/10 h-full`}>
                                    <div className="flex items-center gap-3">
                                        <div className="p-1 rounded bg-white/10">
                                            {isUp ? <ArrowUp size={isV1 ? 10 : 12} className="text-white" /> : <ArrowDown size={isV1 ? 10 : 12} className="text-white" />}
                                        </div>
                                        <div className="flex flex-col leading-none">
                                            <span className="text-[7px] font-black text-white/40 uppercase tracking-tighter mb-0.5">ROUND</span>
                                            <span className={`${isV1 ? 'text-[10px]' : 'text-[11px]'} font-black uppercase tracking-[0.2em] text-white`}>
                                                {event.symbol.replace('USDT', '')}
                                            </span>
                                        </div>
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
                </div>
            )}
        </div>
    );
}

export const RoundsTradeScroller = memo(RoundsTradeScrollerComponent);
