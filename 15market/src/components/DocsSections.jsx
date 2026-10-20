import React from "react";
import { 
    TrendingUp, TrendingDown, Play, RefreshCw, Terminal, 
    Shield, Zap, Send, Bell, Trophy, BookOpen, BarChart2, 
    Activity, Clock, FileText, ChevronRight, HelpCircle, ArrowUpRight
} from "lucide-react";

export function RenderIntro({ isLight, body }) {
    return (
        <div className="flex flex-col gap-4">
            <p className={`text-xs md:text-sm leading-relaxed ${body}`}>
                Welcome to <strong>15market.com</strong> — a premium real-time binary prediction platform. Instead of managing complex leverage, margins, or order books, you predict if an asset price (BTC, ETH) will stay <strong>ABOVE</strong> or <strong>BELOW</strong> your entry price when a short round (5s, 10s, or 15s) expires.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className={`p-4 rounded-2xl border ${isLight ? "bg-white/40 border-black/5 shadow-sm" : "bg-white/5 border-white/5"}`}>
                    <span className="text-[10px] font-black uppercase text-[#1A6140] tracking-wide block mb-1">Simple profit loop</span>
                    <p className="text-[11px] leading-relaxed opacity-80">
                        Choose Up or Down, enter stake, and watch live resolution. Correct prediction wins back stake + profit instantly.
                    </p>
                </div>
                <div className={`p-4 rounded-2xl border ${isLight ? "bg-white/40 border-black/5 shadow-sm" : "bg-white/5 border-white/5"}`}>
                    <span className="text-[10px] font-black uppercase text-[#1A6140] tracking-wide block mb-1">Dynamic payouts</span>
                    <div className="grid grid-cols-3 gap-1.5 mt-1.5">
                        {[["5s","2.90x"],["10s","2.40x"],["15s","1.90x"]].map(([d,m]) => (
                            <div key={d} className={`text-center py-1.5 rounded-lg border ${isLight ? "bg-black/5 border-black/5" : "bg-white/5 border-white/5"}`}>
                                <div className="text-[8px] font-black text-[#1A6140]">{d}</div>
                                <div className="text-xs font-black">{m}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

export function RenderTrading({ 
    isLight, body, muted, simDir, setSimDir, simDur, setSimDur, 
    simAmt, setSimAmt, simRunning, simCountdown, simTicks, simResult, startSim 
}) {
    return (
        <div className="flex flex-col gap-4">
            <p className={`text-xs md:text-sm leading-relaxed ${body}`}>
                The platform features a real-time <strong>Live Streaming Chart widget</strong> showing decentralized index prices, alongside standard buy/sell prediction triggers.
            </p>
            
            {/* Visual Chart Widget & Prediction UI */}
            <div className={`rounded-2xl border p-4 flex flex-col md:flex-row gap-4 ${isLight ? "bg-white/70 border-black/5" : "bg-[#0c0c0c]/80 border-white/5"}`}>
                <div className="flex-1 flex flex-col gap-3">
                    <span className="text-[9px] font-black uppercase tracking-wider text-[#1A6140] flex items-center gap-1.5">
                        <Terminal size={12}/> Live Predictor Mockup
                    </span>
                    
                    {/* Duration Selection */}
                    <div className="flex gap-2">
                        {[5, 10, 15].map(d => (
                            <button key={d} onClick={() => !simRunning && setSimDur(d)} disabled={simRunning}
                                className={`flex-1 py-1.5 text-[9px] font-black rounded-lg border transition-all ${simDur === d ? "bg-[#1A6140] text-white border-[#1A6140]" : isLight ? "bg-black/5 border-transparent" : "bg-white/5 border-transparent"}`}>
                                {d}s ({d === 5 ? "2.9x" : d === 10 ? "2.4x" : "1.9x"})
                            </button>
                        ))}
                    </div>

                    {/* Amount Input */}
                    <div className="relative">
                        <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs ${muted}`}>$</span>
                        <input type="number" value={simAmt} disabled={simRunning} onChange={e => setSimAmt(parseFloat(e.target.value) || 0)}
                            className={`w-full pl-6 pr-3 py-1.5 text-xs rounded-lg border font-bold focus:outline-none ${isLight ? "bg-black/5 border-black/10 text-black" : "bg-white/5 border-white/10 text-white"}`}/>
                    </div>

                    {/* Prediction Buttons */}
                    <div className="flex gap-2">
                        <button onClick={() => !simRunning && setSimDir("up")} disabled={simRunning}
                            className={`flex-1 py-2 rounded-lg border flex items-center justify-center gap-1 text-[9px] font-black uppercase transition-all ${simDir === "up" ? "bg-[#1A6140]/20 border-[#1A6140] text-[#1A6140]" : isLight ? "bg-black/5 border-transparent" : "bg-white/5 border-transparent"}`}>
                            <TrendingUp size={11}/> Up
                        </button>
                        <button onClick={() => !simRunning && setSimDir("down")} disabled={simRunning}
                            className={`flex-1 py-2 rounded-lg border flex items-center justify-center gap-1 text-[9px] font-black uppercase transition-all ${simDir === "down" ? "bg-red-500/20 border-red-500 text-red-400" : isLight ? "bg-black/5 border-transparent" : "bg-white/5 border-transparent"}`}>
                            <TrendingDown size={11}/> Down
                        </button>
                    </div>

                    <button onClick={startSim} disabled={simRunning}
                        className="w-full py-2 rounded-lg bg-[#1A6140] text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 shadow hover:bg-[#1A6140] transition-colors disabled:opacity-50">
                        {simRunning ? <RefreshCw size={11} className="animate-spin" /> : <Play size={11} />}
                        {simRunning ? `Countdown ${simCountdown}s` : "Execute Simulation"}
                    </button>
                </div>

                {/* Mock Chart Widget explanation */}
                <div className={`flex-1 rounded-xl border p-3 flex flex-col justify-between ${isLight ? "bg-black/5 border-black/5" : "bg-white/5 border-white/5"}`}>
                    <div className="flex flex-col gap-1">
                        <span className="text-[8px] font-black uppercase tracking-wider text-[#1A6140] block">Interactive Chart Feed</span>
                        <p className="text-[10px] opacity-75 leading-relaxed">
                            The live line/candlestick widget shows the price history tick-by-tick. The entry point is locked on chart as a dotted reference line.
                        </p>
                    </div>
                    
                    <div className="flex-1 flex flex-col items-center justify-center my-2">
                        {simTicks.length > 0 ? (
                            <div className="text-center">
                                <span className={`text-[9px] font-bold ${muted}`}>BTC Mock Index</span>
                                <div className={`text-xl font-black ${simTicks[simTicks.length-1].price >= simTicks[0].price ? "text-[#1A6140]" : "text-red-400"}`}>
                                    ${simTicks[simTicks.length-1].price.toLocaleString()}
                                </div>
                                <span className={`text-[8px] ${muted}`}>Locked Entry: ${simTicks[0].price}</span>
                            </div>
                        ) : (
                            <span className={`text-[9px] ${muted} text-center`}>Waiting to simulate prediction...</span>
                        )}
                    </div>

                    {simResult && (
                        <div className={`p-2 rounded-lg text-center border text-[9px] font-black ${simResult.won ? "bg-[#1A6140]/10 border-[#1A6140]/20 text-[#1A6140]" : "bg-red-500/10 border-red-500/20 text-red-400"}`}>
                            {simResult.won ? "🎉 WIN: Price settled above entry" : "❌ LOSS: Price settled against prediction"}
                            <div className="text-[8px] opacity-80 mt-0.5">Net Profit: {simResult.profit} USDC</div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export function RenderNavbar({ isLight, body }) {
    const navItems = [
        { icon: BookOpen, title: "Docs Icon", desc: "Opens this platform guide. Keeps rules and tools handy at any point." },
        { icon: Send, title: "Transfer Hub", desc: "Dedicated funding portal for cross-chain and Circle USDC deposits/withdrawals." },
        { icon: Bell, title: "Notifications Panel", desc: "Tracks platform announcements, round results, and bridge execution events." }
    ];

    return (
        <div className="flex flex-col gap-4">
            <p className={`text-xs md:text-sm leading-relaxed ${body}`}>
                The main dashboard header provides immediate access to your profile parameters and utilities:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {navItems.map((item, idx) => {
                    const Icon = item.icon;
                    return (
                        <div key={idx} className={`p-3 rounded-xl border flex gap-3 items-center ${isLight ? "bg-white/40 border-black/5" : "bg-white/5 border-white/5"}`}>
                            <div className="p-2 rounded-lg bg-[#1A6140]/10 border border-[#1A6140]/20 text-[#1A6140] flex-none">
                                <Icon size={16} />
                            </div>
                            <div>
                                <span className="text-[10px] font-black uppercase tracking-wider block">{item.title}</span>
                                <p className="text-[10px] opacity-75 mt-0.5 leading-relaxed">{item.desc}</p>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

export function RenderWallets({ isLight, body }) {
    return (
        <div className="flex flex-col gap-4">
            <p className={`text-xs md:text-sm leading-relaxed ${body}`}>
                To offer rapid execution, the platform implements a <strong>Dual-Wallet system</strong> working alongside the <strong>Transfer Hub</strong>.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className={`p-4 rounded-xl border flex flex-col gap-2 ${isLight ? "bg-white/40 border-black/5" : "bg-white/5 border-white/5"}`}>
                    <span className="text-[10px] font-black uppercase tracking-wide text-amber-500">1. Vault (Connected Web3 Wallet)</span>
                    <p className="text-[10px] opacity-80 leading-relaxed">
                        MetaMask, Coinbase, or Privy. Used to secure funds. Every transfer requires standard browser approval signing.
                    </p>
                </div>
                <div className={`p-4 rounded-xl border flex flex-col gap-2 ${isLight ? "bg-white/40 border-black/5" : "bg-white/5 border-white/5"}`}>
                    <span className="text-[10px] font-black uppercase tracking-wide text-[#1A6140]">2. Trading Wallet (EVM Session Signer)</span>
                    <p className="text-[10px] opacity-80 leading-relaxed">
                        Client-side generated signer stored securely in memory. Automatically signs active trades inside contract in &lt;45ms.
                    </p>
                </div>
            </div>

            {/* Transfer Hub Mockup */}
            <div className={`p-4 rounded-2xl border flex flex-col gap-2.5 ${isLight ? "bg-white/70 border-black/5" : "bg-white/5 border-white/5"}`}>
                <span className="text-[10px] font-black uppercase tracking-wider text-[#1A6140] flex items-center gap-1.5">
                    <Send size={11}/> Transfer Hub Portal
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[10px]">
                    <div className={`p-2.5 rounded-lg border ${isLight ? "bg-black/5 border-black/5" : "bg-white/5 border-white/5"}`}>
                        <span className="font-bold text-[#1A6140]">Circle Smart Deposits</span>
                        <p className="opacity-75 mt-1 leading-relaxed">Dedicated leaf-branded QR code addresses that sync deposits instantly with Circle API.</p>
                    </div>
                    <div className={`p-2.5 rounded-lg border ${isLight ? "bg-black/5 border-black/5" : "bg-white/5 border-white/5"}`}>
                        <span className="font-bold text-[#1A6140]">Solana Engine</span>
                        <p className="opacity-75 mt-1 leading-relaxed">Send SOL or USDC directly from Phantom/Solana addresses; converts to EVM USDC in 2 seconds.</p>
                    </div>
                    <div className={`p-2.5 rounded-lg border ${isLight ? "bg-black/5 border-black/5" : "bg-white/5 border-white/5"}`}>
                        <span className="font-bold text-[#1A6140]">Fuji CCTP Bridge</span>
                        <p className="opacity-75 mt-1 leading-relaxed">Cross-chain bridging from Avalanche testnet. Fully automated relayer processes target minting.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function RenderHistory({ isLight, body }) {
    const ledgers = [
        {
            title: "Trade History Ledger",
            icon: Clock,
            desc: "Tracks the prediction cards you place. Shows Asset (BTC), Direction (UP/DOWN), Entry Price, Settlement Price, and final Profit or Loss."
        },
        {
            title: "Transaction History Ledger",
            icon: FileText,
            desc: "Records direct EVM blockchain activities. Tracks smart contract deposits, gas usages, session wallet replenishments, and on-chain withdrawal logs."
        },
        {
            title: "Live Activity Feed",
            icon: Activity,
            desc: "Real-time logs powered by websockets. Displays global round initiations, peer prediction streams, and live contract transaction statuses."
        }
    ];

    return (
        <div className="flex flex-col gap-4">
            <p className={`text-xs md:text-sm leading-relaxed ${body}`}>
                15market houses three distinct ledger sections to help you audit your performance, monitor transactions, and track real-time blockchain activity:
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {ledgers.map((l, idx) => {
                    const Icon = l.icon;
                    return (
                        <div key={idx} className={`p-3.5 rounded-xl border flex flex-col gap-2 ${isLight ? "bg-white/40 border-black/5" : "bg-white/5 border-white/5"}`}>
                            <div className="flex items-center gap-2 text-[#1A6140]">
                                <Icon size={14} />
                                <span className="text-[10px] font-black uppercase tracking-wider">{l.title}</span>
                            </div>
                            <p className="text-[10px] opacity-80 leading-relaxed">{l.desc}</p>
                        </div>
                    );
                })}
            </div>

            {/* Visual audit preview */}
            <div className={`p-4 rounded-xl border text-[10px] flex flex-col gap-1.5 ${isLight ? "bg-white/70 border-black/5" : "bg-white/3 border-white/5"}`}>
                <span className="text-[8px] font-black uppercase text-[#1A6140] tracking-widest block">Audit Dashboard Mockup</span>
                <div className="flex justify-between border-b border-white/10 pb-1 font-bold">
                    <span>Target Event</span>
                    <span>Ledger Source</span>
                    <span>Audit Purpose</span>
                </div>
                <div className="flex justify-between opacity-80">
                    <span>Correct 5s BTC Prediction</span>
                    <span className="text-[#1A6140]">Trade History</span>
                    <span>Wins payout audit</span>
                </div>
                <div className="flex justify-between opacity-80">
                    <span>Withdrawal to Main Wallet</span>
                    <span className="text-amber-500">Transaction History</span>
                    <span>EVM on-chain confirmations</span>
                </div>
                <div className="flex justify-between opacity-80">
                    <span>WebSocket Connected</span>
                    <span className="text-blue-400">Activity Log</span>
                    <span>Real-time price feed status</span>
                </div>
            </div>
        </div>
    );
}

export function RenderFAQ({ isLight, body }) {
    const faqs = [
        { q: "Is my capital secure in the Session Trading Wallet?", a: "Yes. Session keys exist only in browser RAM. Contract restricts permissions solely to signing predictions. You can retrieve funds to your main wallet at any moment." },
        { q: "Why are short round payouts higher?", a: "Ultra-short rounds (5s) carry high volatility factors. We offer up to 2.90x multipliers to reward precise split-second predictions." },
        { q: "Can I cancel an active prediction?", a: "No. Rounds are committed on-chain to the smart contract immediately upon execution. Settlements are locked to decentralized prices." }
    ];

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3">
                {faqs.map((f, i) => (
                    <div key={i} className={`p-4 rounded-xl border flex flex-col gap-2 ${isLight ? "bg-white/40 border-black/5" : "bg-white/5 border-white/5"}`}>
                        <div className="flex items-center gap-2 text-[#1A6140]">
                            <HelpCircle size={13} />
                            <span className="text-xs font-black uppercase">{f.q}</span>
                        </div>
                        <p className={`text-xs leading-relaxed ${body}`}>{f.a}</p>
                    </div>
                ))}
            </div>
        </div>
    );
}
