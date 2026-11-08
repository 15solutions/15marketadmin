import React, { useState, useEffect, useMemo, memo } from 'react';
import { ArrowUp, ArrowDown, Check, X } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';

function WonTradesBanner({ theme }) {
  const [history, setHistory] = useState(() => {
    try {
      const saved = localStorage.getItem("15market_global_history_v2");
      return saved ? JSON.parse(saved) : [];
    } catch (e) { return []; }
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${KEEPER_URL_ARC}/history`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
            const final = data.slice(0, 80);
            setHistory(final);
            localStorage.setItem("15market_global_history_v2", JSON.stringify(final));
          }
        }
      } catch (e) { }
    };
    fetchData();
    const interval = setInterval(fetchData, 12000);
    return () => clearInterval(interval);
  }, []);

  const ghostTrades = useMemo(() => {
    const symbols = ["ETH", "BTC"];
    return Array.from({ length: 8 }).map((_, i) => ({
      id: `ghost-${i}`,
      symbol: symbols[i % symbols.length],
      direction: Math.random() > 0.5 ? "UP" : "DOWN",
      status: Math.random() > 0.5 ? "WON" : "LOST",
      payout: (Math.random() * 4 + 4).toFixed(2),
      timestamp: Date.now() - (i * 30000),
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

  const scrollerKey = useMemo(() => {
    if (!mergedHistory || mergedHistory.length === 0) return 'empty';
    return `${mergedHistory[0]?.id}-${mergedHistory.length}`;
  }, [mergedHistory]);

  return (
    <div
      className="w-full h-5 md:h-6 lg:h-7 rounded-t-[9px] relative z-50 overflow-hidden"
      style={{ background: theme === 'light'
        ? 'linear-gradient(180deg, #1B7445 0%, #1B7445 50%, #1B7445 100%)'
        : 'linear-gradient(180deg, #0E4D30 0%, #0E4D30 50%, #0E4D30 100%)' }}
    >
      <div
        key={scrollerKey}
        className="flex items-center h-full"
        style={{ animation: 'fadeIn 0.4s ease' }}
      >
        <div
          className="flex items-center h-full whitespace-nowrap"
          style={{ animation: 'ticker-move 280s linear infinite', willChange: 'transform' }}
        >
          {repeatedHistory.map((event, i) => {
            const isUp = event.direction === "UP" || event.direction === 1 || String(event.direction) === "1";
            const isWon = event.status === "WON";

            return (
              <div key={`${event.id}-${i}`} className="flex items-center gap-5 px-10 border-r border-white/10 h-full">
                <div className="flex items-center gap-3">
                  <div className="p-1 rounded-full bg-white/10">
                    {isUp ? <ArrowUp size={10} className="text-white" /> : <ArrowDown size={10} className="text-white" />}
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white">
                    {event.symbol ? event.symbol.split('/')[0] : 'BTC'}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {isWon ? <Check size={10} className="text-white" /> : <X size={10} className="text-white/60" />}
                  <span className="text-[9px] font-black uppercase tracking-widest text-white">
                    {isWon ? `WON $${parseFloat(event.payout || event.amount || 0).toFixed(2)}` : 'LOST'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default memo(WonTradesBanner);
