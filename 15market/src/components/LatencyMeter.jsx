import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Zap, Globe, Cpu, Activity } from "lucide-react";

export function LatencyMeter({ currentNetwork = 'arc' }) {
    const [rpcLatency, setRpcLatency] = useState(0);
    const [priceLatency, setPriceLatency] = useState(0);
    const [status, setStatus] = useState("OPTIMAL");
    const [history, setHistory] = useState([]);

    const measureLatency = useCallback(async () => {
        const start = performance.now();
        try {
            // Measure RPC Latency
            const rpcStart = performance.now();
            // Fetch for EVM / Arc
            await fetch(currentNetwork === 'arc' ? "https://5042002.rpc.thirdweb.com" : "https://mainnet.base.org", {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 })
            });
            const rpcEnd = performance.now();
            const rpcTime = Math.round(rpcEnd - rpcStart);
            setRpcLatency(rpcTime);

            // Measure Price API Latency (Binance as primary)
            const priceStart = performance.now();
            await fetch("/api-binance/api/v3/ping");
            const priceEnd = performance.now();
            const priceTime = Math.round(priceEnd - priceStart);
            setPriceLatency(priceTime);

            // Update status based on metrics
            if (rpcTime > 500 || priceTime > 800) setStatus("DEGRADED");
            else if (rpcTime > 200 || priceTime > 400) setStatus("STABLE");
            else setStatus("OPTIMAL");

            setHistory(prev => [...prev.slice(-19), { rpc: rpcTime, price: priceTime }]);
        } catch (e) {
            console.error("Latency measurement failed:", e);
            setStatus("ERROR");
        }
    }, [currentNetwork]);

    useEffect(() => {
        const interval = setInterval(measureLatency, 3000);
        measureLatency();
        return () => clearInterval(interval);
    }, [measureLatency]);

    return (
        <div className="bg-[#111] border border-white/5 rounded-[24px] p-6 relative overflow-hidden">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-sm font-black uppercase tracking-widest text-white/40">Network Performance</h3>
                    <div className="flex items-center gap-2 mt-1">
                        <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${status === "OPTIMAL" ? "bg-[#1A6140]" : status === "STABLE" ? "bg-orange-500" : "bg-red-500"}`} />
                        <span className={`text-[10px] font-black uppercase ${status === "OPTIMAL" ? "text-[#1A6140]" : status === "STABLE" ? "text-orange-500" : "text-red-500"}`}>
                            SYSTEM {status}
                        </span>
                    </div>
                </div>
                <div className="p-2 rounded-lg bg-white/5">
                    <Activity size={16} className="text-[#1A6140]" />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-4 rounded-xl bg-black/40 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <Globe size={12} className="text-blue-400 opacity-50" />
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">RPC Latency</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black tabular-nums">{rpcLatency}</span>
                        <span className="text-[10px] font-bold text-white/20">ms</span>
                    </div>
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-white/5">
                    <div className="flex items-center gap-2 mb-2">
                        <Zap size={12} className="text-yellow-400 opacity-50" />
                        <span className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Oracle Feed</span>
                    </div>
                    <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black tabular-nums">{priceLatency}</span>
                        <span className="text-[10px] font-bold text-white/20">ms</span>
                    </div>
                </div>
            </div>

            {/* Sparkline visualization */}
            <div className="h-16 w-full flex items-end gap-[1px] bg-black/20 rounded-lg p-1 border border-white/5">
                {history.map((h, i) => (
                    <div key={i} className="flex-1 flex flex-col justify-end h-full">
                        <div
                            className="w-full bg-[#1A6140]/30 rounded-t-[1px] transition-all duration-500"
                            style={{ height: `${Math.min((h.rpc / 1000) * 100, 100)}%` }}
                        />
                        <div
                            className="w-full bg-[#1A6140]/50 rounded-t-[1px] transition-all duration-500"
                            style={{ height: `${Math.min((h.price / 1000) * 100, 100)}%` }}
                        />
                    </div>
                ))}
            </div>
            <div className="flex justify-between mt-3 px-1">
                <div className="flex gap-3">
                    <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#1A6140]/50" />
                        <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">RPC</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#1A6140]/50" />
                        <span className="text-[7px] font-black text-white/20 uppercase tracking-widest">Oracle</span>
                    </div>
                </div>
                <span className="text-[7px] font-black text-white/10 uppercase tracking-widest">Refresh: 3s</span>
            </div>
        </div>
    );
};
