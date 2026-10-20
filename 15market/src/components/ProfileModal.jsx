import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KEEPER_URL_ARC } from '../constants';

import { Zap, Shield, TrendingUp, TrendingDown, Camera, Edit3, Image as ImageIcon, Link as LinkIcon, Check, Send, ArrowDownLeft } from 'lucide-react';

const PRESET_AVATARS = [
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Midnight",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Oliver",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Luna",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Shadow",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Milo",
    "https://api.dicebear.com/7.x/avataaars/svg?seed=Peanut"
];

import { useCreateWallet } from '@privy-io/react-auth';

export function ProfileModal({ 
    isOpen, 
    onClose, 
    wallet, 
    evmSessionWallet,
    isSignerInitializing,
    userProfile = null, 
    transactionHistory = [], 
    onViewReceipt, 
    notify, 
    theme, 
    onUpdate, 
    sessionBalance, 
    evmBalance, 
    onDeposit, 
    onWithdraw,
    onRetryInit,
    isEmbedded,
    isDelegated,
    onDelegate,
    onOpenCircleWallet
}) {
    const [username, setUsername] = useState("");
    const [xHandle, setXHandle] = useState("");
    const [discordHandle, setDiscordHandle] = useState("");
    const [avatar, setAvatar] = useState("");
    const [showAvatarSelector, setShowAvatarSelector] = useState(false);
    const { createWallet } = useCreateWallet();
    const [isGenerating, setIsGenerating] = useState(false);
    const [customAvatarUrl, setCustomAvatarUrl] = useState("");
    const [metrics, setMetrics] = useState(null);
    const [tradeHistory, setTradeHistory] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [isVerifyingX, setIsVerifyingX] = useState(false);
    const [actionAmount, setActionAmount] = useState("");

    const isLight = theme === 'light';

    // wallet prop is the Wagmi/Para wallet object or wrapper. 
    // userProfile is passed from UserApp
    const address = wallet?.address || wallet?.publicKey; // Adapting to whatever wallet object structure is passed, mostly { address } from UserApp "user" memo

    useEffect(() => {
        if (isOpen) {
            // Reset state to avoid leaking data from previous user/view
            setMetrics({
                wins: 0,
                losses: 0,
                trades: 0,
                volume: "0.00"
            });
            setTradeHistory([]);

            if (userProfile) {
                setUsername(userProfile.username || "");
                setXHandle(userProfile.xHandle || "");
                setDiscordHandle(userProfile.discordHandle || "");
                setAvatar(userProfile.avatar || userProfile.xProfileImage || PRESET_AVATARS[0]);
            }
            // Fetch metrics from backend if address is available
            if (address) {
                fetchMetrics();
            }
        }
    }, [isOpen, address, userProfile]);

    const fetchMetrics = async () => {
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/profiles/${address}`);
            if (res.ok) {
                const data = await res.json();
                if (data && data.stats) {
                    setMetrics({
                        wins: data.stats.totalWins || 0,
                        losses: (data.stats.totalTrades || 0) - (data.stats.totalWins || 0),
                        trades: data.stats.totalTrades || 0,
                        volume: data.stats.totalVolume ? (parseFloat(data.stats.totalVolume)).toFixed(2) : "0.00"
                    });
                }
                if (data.history && Array.isArray(data.history)) {
                    setTradeHistory(data.history.filter(t => t.status === 'WON' || t.status === 'LOST').slice(0, 20));
                }
            }
        } catch (err) {
            console.error("Fetch profile metrics error:", err);
        }
    };

    const handleSave = async () => {
        if (!address) {
            notify("Please connect your wallet first.", "error");
            return;
        }
        if (!username.trim()) {
            notify("Username cannot be empty.", "error");
            return;
        }
        setIsSaving(true);
        notify("Syncing Profile...", "pending");
        try {
            // Use PATCH to update only provided fields without overwriting anything else
            const res = await fetch(`${KEEPER_URL_ARC}/profiles/${address.toLowerCase()}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username.trim(),
                    xHandle: xHandle.trim(),
                    avatar: avatar
                })
            });

            // Fallback: if PATCH not found (new user), create via POST
            if (res.status === 404) {
                const postRes = await fetch(`${KEEPER_URL_ARC}/profiles`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        address: address.toLowerCase(),
                        username: username.trim(),
                        xHandle: xHandle.trim(),
                        avatar: avatar
                    })
                });
                if (!postRes.ok) throw new Error("Failed to create profile.");
            } else if (!res.ok) {
                throw new Error("Failed to save profile on backend.");
            }

            notify("Profile saved!", "success");
            if (onUpdate) onUpdate();
            onClose();
        } catch (err) {
            console.error("Save profile error:", err);
            notify("Failed to save profile: " + err.message, "error");
        } finally {
            setIsSaving(false);
        }
    };
    if (!isOpen) return null;

    const truncate = (str) => str ? `${str.slice(0, 6)}...${str.slice(-4)}` : "";

    return (
        <AnimatePresence>
            <div className={`fixed inset-0 z-[150] flex items-center justify-center p-6 backdrop-blur-md ${isLight ? 'bg-black/20' : 'bg-black/80'}`}>
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    className={`w-full max-w-[90%] md:max-w-md ${isLight ? 'bg-[#f0f9f4] border-[#1A6140]/20' : 'bg-[#0D0D0D] border-[#1A6140]/30'} border rounded-[24px] md:rounded-[32px] p-5 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.1)] relative overflow-y-auto max-h-[90vh] custom-scrollbar`}
                >
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#1A6140] to-transparent" />

                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-4">
                            <div className="relative group cursor-pointer" onClick={() => setShowAvatarSelector(!showAvatarSelector)}>
                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#1A6140] to-black p-[2px] overflow-hidden transition-all group-hover:scale-105 group-hover:shadow-[0_0_20px_rgba(26, 97, 64,0.3)]">
                                    <div className={`w-full h-full rounded-full ${isLight ? 'bg-[#e6f4ed]' : 'bg-[#050505]'} flex items-center justify-center overflow-hidden relative`}>
                                        {userProfile?.xProfileImage || avatar ? (
                                            <img src={userProfile?.xProfileImage || avatar} alt="Profile" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-[#1A6140] font-black text-2xl">
                                                {(username || "A").charAt(0).toUpperCase()}
                                            </span>
                                        )}
                                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                                            <div className="w-8 h-8 rounded-full bg-[#1A6140] flex items-center justify-center text-white shadow-lg scale-75 group-hover:scale-100 transition-transform">
                                                <span className="text-xl font-black">+</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-[#1A6140] border-4 border-[#0D0D0D] flex items-center justify-center shadow-lg">
                                    <Camera size={12} className="text-black font-black" />
                                </div>
                            </div>
                            <div className="flex flex-col">
                                <h3 className={`text-xl font-black uppercase tracking-widest ${isLight ? 'text-black' : 'text-white'} flex items-center gap-2`}>
                                    DeGen Account
                                    <Edit3 size={12} className="text-[#1A6140] opacity-40" />
                                </h3>
                                <p className={`text-[9px] ${isLight ? 'text-black/40' : 'text-white/20'} uppercase font-bold tracking-widest mt-1`}>Identity & Metrics</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={onClose} className={`p-2 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/40' : 'bg-white/5 hover:bg-white/10 text-white/40'} transition-colors`}>✕</button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {showAvatarSelector && (
                            <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                className={`mb-6 p-4 rounded-[24px] ${isLight ? 'bg-black/5' : 'bg-white/5'} border border-[#1A6140]/20 overflow-hidden`}
                            >
                                <div className="flex flex-col gap-3">
                                    <p className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Select Avatar Or Upload Custom</p>
                                    <div className="grid grid-cols-4 gap-3">
                                        {PRESET_AVATARS.map((url, i) => (
                                            <button
                                                key={i}
                                                onClick={() => { setAvatar(url); setCustomAvatarUrl(""); }}
                                                className={`relative w-12 h-12 rounded-full border-2 transition-all overflow-hidden ${avatar === url ? 'border-[#1A6140] scale-110 shadow-lg z-10' : 'border-transparent opacity-40 hover:opacity-100'}`}
                                            >
                                                <img src={url} alt="Avatar" className="w-full h-full" />
                                                {avatar === url && (
                                                    <div className="absolute inset-0 bg-[#1A6140]/20 flex items-center justify-center">
                                                        <Check size={16} className="text-white" />
                                                    </div>
                                                )}
                                            </button>
                                        ))}
                                        {/* Upload Button */}
                                        <button 
                                            onClick={() => {
                                                const input = document.createElement('input');
                                                input.type = 'file';
                                                input.accept = 'image/jpeg,image/jpg,image/png,image/gif';
                                                input.onchange = (e) => {
                                                    const file = e.target.files[0];
                                                    if (!file) return;
                                                    if (file.size > 1024 * 1024) return notify("Image too large (Max 1MB)", "error");
                                                    const reader = new FileReader();
                                                    reader.onloadend = () => {
                                                        setAvatar(reader.result);
                                                        setCustomAvatarUrl("");
                                                    };
                                                    reader.readAsDataURL(file);
                                                };
                                                input.click();
                                            }}
                                            className={`relative w-12 h-12 rounded-full border-2 border-dashed border-[#1A6140]/40 flex flex-col items-center justify-center gap-1 hover:border-[#1A6140] transition-all bg-[#1A6140]/5`}
                                        >
                                            <Camera size={14} className="text-[#1A6140]" />
                                            <span className="text-[6px] font-black uppercase text-[#1A6140]">UP</span>
                                        </button>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {metrics && (
                        <div className="grid grid-cols-2 gap-4 mb-6">
                            <div className={`p-4 rounded-[22px] ${isLight ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'} border flex flex-col justify-center`}>
                                <p className="text-[8px] font-bold text-[#1A6140] uppercase tracking-widest mb-1">Win Rate</p>
                                <div className="flex items-baseline gap-1">
                                    <p className={`text-2xl font-black ${isLight ? 'text-[#05140b]' : 'text-white'}`}>
                                        {metrics.trades > 0 ? ((metrics.wins / metrics.trades) * 100).toFixed(0) : 0}
                                    </p>
                                    <span className={`text-xs font-bold ${isLight ? 'text-[#05140b]/40' : 'text-white/40'}`}>%</span>
                                </div>
                                <p className={`text-[7px] ${isLight ? 'text-[#05140b]/20' : 'text-white/20'} font-bold uppercase mt-1`}>{metrics.wins} W // {metrics.trades - metrics.wins} L</p>
                            </div>
                            <div className={`p-4 rounded-[22px] ${isLight ? 'bg-black/5 border-black/5' : 'bg-white/5 border-white/5'} border flex flex-col justify-center`}>
                                <p className={`text-[8px] font-bold ${isLight ? 'text-[#05140b]/40' : 'text-white/40'} uppercase tracking-widest mb-1`}>Total Volume</p>
                                <div className="flex items-baseline gap-1">
                                    <p className={`text-2xl font-black ${isLight ? 'text-[#05140b]' : 'text-white'}`}>{metrics.volume}</p>
                                    <span className={`text-xs font-bold ${isLight ? 'text-[#05140b]/40' : 'text-white/40'}`}>USDC</span>
                                </div>
                                <p className={`text-[7px] ${isLight ? 'text-[#05140b]/20' : 'text-white/20'} font-bold uppercase mt-1`}>Across {metrics.trades} Trades</p>
                            </div>
                        </div>
                    )}

                    <div className="mb-6">
                        <div className={`p-4 rounded-[24px] ${isLight ? 'bg-white border-black/5' : 'bg-[#151515] border-white/5'} border shadow-xl`}>
                            <div className="flex flex-col gap-4 mb-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className={`text-[8px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Trading Wallet (On-Chain)</p>
                                        <div className="flex items-center gap-2 mt-1">
                                            <h4 
                                                className={`text-sm font-black font-mono cursor-pointer hover:opacity-80 transition-all ${isLight ? 'text-black' : 'text-[#1A6140]'}`}
                                                onClick={() => {
                                                    if (!evmSessionWallet?.address && !isSignerInitializing && address) {
                                                        onRetryInit?.();
                                                    }
                                                }}
                                            >
                                                {evmSessionWallet?.address ? truncate(evmSessionWallet.address) : (isSignerInitializing ? "Syncing..." : (address ? "Not Ready (Retry)" : "Connect Wallet"))}
                                            </h4>
                                            <div className="flex items-center gap-1.5">
                                                <button 
                                                    onClick={() => {
                                                        navigator.clipboard.writeText(evmSessionWallet?.address);
                                                        notify("Copied to clipboard!", "success");
                                                    }}
                                                    className={`p-1 rounded-md ${isLight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10'} transition-all`}
                                                    title="Copy Address"
                                                >
                                                    <LinkIcon size={10} className="opacity-40" />
                                                </button>
                                                {evmSessionWallet?.address && (
                                                    <a 
                                                        href={`https://testnet.arcscan.app/address/${evmSessionWallet.address}`} 
                                                        target="_blank" 
                                                        rel="noopener noreferrer"
                                                        className={`p-1 rounded-md ${isLight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10'} transition-all`}
                                                        title="View on ArcScan"
                                                    >
                                                        <Shield size={10} className="text-[#1A6140] opacity-60" />
                                                    </a>
                                                )}
                                            </div>
                                        </div>
                                        <div className="mt-1 flex items-center justify-between">
                                            <span className={`text-[12px] font-black ${isLight ? 'text-black' : 'text-white'}`}>{Number(sessionBalance || 0).toFixed(2)} <span className="text-[8px] opacity-40">USDC</span></span>
                                            
                                            <button
                                                onClick={async () => {
                                                    const bal = Number(sessionBalance);
                                                    if (bal >= 1) {
                                                        notify("Please withdraw your funds (must be under 1 USDC) before regenerating.", "error");
                                                        return;
                                                    }
                                                    if (window.confirm("Are you sure you want to regenerate your EVM Identity? This will replace your current embedded wallet.")) {
                                                        setIsGenerating(true);
                                                        try {
                                                            if (bal > 0) {
                                                                notify("Sweeping remaining funds to treasury...", "pending");
                                                                const TREASURY = '0xf6d5A5eC5e404DeD248f5474f12E7c620cf0E9CB';
                                                                const res = await fetch(`${KEEPER_URL_ARC}/session/cashout`, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({
                                                                        address: address.toLowerCase(),
                                                                        amount: bal.toString(),
                                                                        destination: TREASURY
                                                                    })
                                                                });
                                                                if (!res.ok) {
                                                                    const err = await res.json();
                                                                    throw new Error(err.error || "Failed to sweep funds");
                                                                }
                                                            }

                                                            // Clear permanent Solana wallet from backend and local storage
                                                            try {
                                                                await fetch(`${KEEPER_URL_ARC}/solana/clear`, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ address: address.toLowerCase() })
                                                                });
                                                            } catch (solErr) {
                                                                console.warn("Failed to clear Solana wallet during regeneration:", solErr);
                                                            }
                                                            localStorage.removeItem(`15market_solana_deposit_pub_${address.toLowerCase()}`);

                                                            await createWallet();
                                                            notify("Trading Wallet Regenerated Successfully!", "success");
                                                        } catch (err) {
                                                            notify(err.message || "Failed to regenerate wallet", "error");
                                                        } finally {
                                                            setIsGenerating(false);
                                                        }
                                                    }
                                                }}
                                                disabled={isGenerating}
                                                className={`px-3 py-1.5 rounded-lg border text-[8px] font-black uppercase tracking-widest hover:bg-black/10 transition-all ${isLight ? 'border-red-500/30 text-red-600' : 'border-red-500/50 text-red-500'} active:scale-95`}
                                            >
                                                {isGenerating ? "Regenerating..." : "Regenerate Identity"}
                                            </button>
                                        </div>
                                    </div>
                                    <div className="text-right flex flex-col items-end">
                                        <p className={`text-[8px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Main Source</p>
                                        <div className="flex items-center gap-1.5 mt-1">
                                            <p className={`text-[10px] font-bold font-mono ${isLight ? 'text-black/60' : 'text-white/60'}`}>{truncate(address)}</p>
                                            <button 
                                                onClick={() => {
                                                    if (address) {
                                                        navigator.clipboard.writeText(address);
                                                        notify("Copied to clipboard!", "success");
                                                    }
                                                }}
                                                className={`p-1 rounded-md ${isLight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10'} transition-all`}
                                                title="Copy Address"
                                            >
                                                <LinkIcon size={10} className="opacity-40" />
                                            </button>
                                        </div>
                                        <p className={`text-[10px] font-black mt-0.5 ${isLight ? 'text-black/60' : 'text-white/60'}`}>{Number(evmBalance || 0).toFixed(2)} USDC</p>
                                    </div>
                                </div>
                            </div>

                            {isEmbedded && (
                                <div className={`mb-4 p-3 rounded-xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border border-[#1A6140]/20 flex items-center justify-between`}>
                                    <div className="flex items-center gap-2">
                                        <div className={`p-1.5 rounded-full ${isDelegated ? 'bg-[#1A6140]/20 text-[#1A6140]' : 'bg-yellow-500/20 text-yellow-500'}`}>
                                            <Zap size={12} />
                                        </div>
                                        <div>
                                            <p className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black' : 'text-white'}`}>1-Click Mode</p>
                                            <p className={`text-[8px] font-bold ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                                                {isDelegated ? "Frictionless Trading Enabled" : "Enable for prompt-free transfers"}
                                            </p>
                                        </div>
                                    </div>
                                    {!isDelegated && (
                                        <button 
                                            onClick={onDelegate}
                                            className="px-3 py-1.5 rounded-lg bg-[#1A6140] text-white text-[8px] font-black uppercase tracking-widest hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-[#1A6140]/20"
                                        >
                                            Enable
                                        </button>
                                    )}
                                </div>
                            )}

                            <div className="flex flex-col gap-3">
                                <div className="relative">
                                    <input 
                                        type="number"
                                        placeholder="0.00"
                                        className={`w-full py-3 px-4 rounded-xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border border-transparent focus:border-[#1A6140]/50 outline-none text-xs font-black transition-all`}
                                        id="wallet-amount-input"
                                        onChange={(e) => setActionAmount(e.target.value)}
                                        value={actionAmount}
                                    />
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex gap-2">
                                        <button 
                                            onClick={() => setActionAmount(evmBalance)}
                                            className="text-[9px] font-black text-[#1A6140] uppercase hover:underline"
                                        >
                                            Max
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <button 
                                        onClick={() => {
                                            if (!actionAmount || parseFloat(actionAmount) <= 0) return notify("Enter a valid amount", "error");
                                            onDeposit(parseFloat(actionAmount));
                                            setActionAmount("");
                                        }}
                                        className="flex items-center justify-center gap-2 bg-[#1A6140] text-black font-black py-3 rounded-xl text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all"
                                    >
                                        <Zap size={14} />
                                        Deposit
                                    </button>
                                    <button 
                                        onClick={() => {
                                            if (!actionAmount || parseFloat(actionAmount) <= 0) return notify("Enter a valid amount", "error");
                                            onWithdraw(parseFloat(actionAmount));
                                            setActionAmount("");
                                        }}
                                        className={`flex items-center justify-center gap-2 ${isLight ? 'bg-black/5 text-black hover:bg-black/10' : 'bg-white/5 text-white hover:bg-white/10'} font-black py-3 rounded-xl text-[10px] uppercase tracking-widest active:scale-[0.98] transition-all`}
                                    >
                                        <Shield size={14} />
                                        Withdraw
                                    </button>
                                </div>
                                <div className="text-center mt-2">
                                    <a href="https://faucet.circle.com/" target="_blank" rel="noopener noreferrer" className="text-[9px] text-[#1A6140] uppercase tracking-widest font-black underline hover:text-[#1A6140]/80">Faucet ↗</a>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3 mt-4">
                                <button 
                                    onClick={() => onOpenCircleWallet?.('send')}
                                    className="flex items-center justify-center gap-2 bg-[#1A6140] text-black font-black py-3 rounded-xl text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-[#1A6140]/20"
                                >
                                    <Send size={14} />
                                    Send Tokens
                                </button>
                                <button 
                                    onClick={() => onOpenCircleWallet?.('receive')}
                                    className={`flex items-center justify-center gap-2 ${isLight ? 'bg-black/5 text-black hover:bg-black/10' : 'bg-white/5 text-white hover:bg-white/10'} font-black py-3 rounded-xl text-[10px] uppercase tracking-widest active:scale-[0.98] transition-all`}
                                >
                                    <ArrowDownLeft size={14} />
                                    Receive
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mb-6">
                        <h4 className={`text-[10px] font-black ${isLight ? 'text-black/40' : 'text-white/40'} uppercase tracking-[0.3em] ml-1 mb-3 block`}>Trade Activity</h4>
                        <div className="space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
                            {tradeHistory.length === 0 && (!transactionHistory || transactionHistory.length === 0) ? (
                                <div className={`text-center py-4 ${isLight ? 'text-black/10 border-black/5' : 'text-white/10 border-white/5'} text-[9px] uppercase font-black border rounded-xl`}>No activity yet</div>
                            ) : (
                                <>
                                    {/* Settled Trades from Backend (includes auto-signer) */}
                                    {tradeHistory.map((t, i) => {
                                        const isWon = t.status === 'WON';
                                        const isUp = t.direction === 'UP' || t.direction === 1 || String(t.direction) === '1';
                                        return (
                                            <div key={t.id || `trade-${i}`} className={`flex items-center justify-between p-3 rounded-xl ${isLight ? 'bg-white/60 border-black/5' : 'bg-white/[0.02] border-white/5'} border`}>
                                                <div className="flex items-center gap-3">
                                                    <div className={`p-1.5 rounded-full ${isUp ? 'bg-[#1A6140]/10 text-[#1A6140]' : 'bg-[#FF7F50]/10 text-[#FF7F50]'}`}>
                                                        {isUp ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                                    </div>
                                                    <div>
                                                        <div className={`text-[10px] font-black ${isLight ? 'text-black' : 'text-white'} uppercase`}>
                                                            {t.symbol || 'BTC'} {isUp ? 'Long' : 'Short'}
                                                        </div>
                                                        <div className={`text-[8px] ${isLight ? 'text-black/20' : 'text-white/20'} font-mono italic`}>
                                                            {t.timestamp ? new Date(t.timestamp).toLocaleDateString() : '—'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="text-right flex flex-col items-end">
                                                    <div className={`text-[11px] font-black ${isWon ? 'text-[#1A6140]' : 'text-[#FF7F50]'}`}>
                                                        {isWon ? `+${Number(t.payout || 0).toFixed(2)}` : `-${Number(t.amount || 0).toFixed(2)}`}
                                                    </div>
                                                    <div className="flex gap-2 items-center">
                                                        <span className={`text-[7px] font-black uppercase ${isWon ? 'text-[#1A6140]/60' : 'text-[#FF7F50]/60'}`}>{t.status}</span>
                                                        <button
                                                            onClick={() => onViewReceipt && onViewReceipt(t)}
                                                            className="text-[7px] font-black text-[#1A6140] uppercase underline"
                                                        >
                                                            Receipt
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                    {/* Deposit / Withdraw from local storage */}
                                    {transactionHistory && transactionHistory.map((tx, i) => (
                                        <div key={tx.id || `tx-${i}`} className={`flex flex-row items-center justify-between p-2 lg:p-4 rounded-xl border transition-all group ${isLight
                                            ? 'bg-[#f0f9f4] border-[#1A6140]/10 shadow-sm hover:shadow-md hover:border-[#1A6140]/40'
                                            : 'bg-black/40 border-white/10 hover:border-[#1A6140]/30'}`}>
                                            <div className="flex items-center gap-3">
                                                <div className={`p-1.5 rounded-lg ${tx.type === "DEPOSIT" ? "bg-[#1A6140]/10 text-[#1A6140]" : "bg-orange-500/10 text-orange-500"}`}>
                                                    {tx.type === "DEPOSIT" ? <Zap size={14} /> : <Shield size={14} />}
                                                </div>
                                                <div>
                                                    <div className={`text-[10px] font-black ${isLight ? 'text-[#05140b]' : 'text-white'} uppercase`}>{tx.type}</div>
                                                    <div className={`text-[8px] ${isLight ? 'text-black/20' : 'text-white/20'} font-mono italic`}>{new Date(tx.timestamp).toLocaleDateString()}</div>
                                                </div>
                                            </div>
                                            <div className="text-right flex flex-col items-end">
                                                <div className={`text-[11px] font-black ${tx.type === "DEPOSIT" ? "text-[#1A6140]" : (isLight ? "text-black/80" : "text-white/80")}`}>
                                                    {tx.type === "DEPOSIT" ? '+' : '-'}{tx.amount}
                                                </div>
                                                <button
                                                    onClick={() => onViewReceipt && onViewReceipt(tx)}
                                                    className="text-[7px] font-black text-[#1A6140] uppercase underline"
                                                >
                                                    Receipt
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="relative">
                            <label className={`text-[10px] font-black ${isLight ? 'text-black/40' : 'text-white/40'} uppercase tracking-[0.3em] ml-1 mb-2 block`}>Username (Public)</label>
                            <div className="relative">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-[#1A6140]">
                                    <Edit3 size={14} />
                                </div>
                                <input
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Anonymous DeGen"
                                    className={`w-full ${isLight ? 'bg-white text-black border-black/10' : 'bg-black text-white border-white/10'} border rounded-2xl pl-12 pr-5 py-3.5 text-xs font-bold focus:border-[#1A6140]/50 outline-none transition-all placeholder:text-black/20`}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex flex-col gap-3">
                        <button
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`w-full bg-[#1A6140] ${isLight ? 'text-white' : 'text-black'} font-black py-4 rounded-full transition-all flex items-center justify-center gap-2 ${isSaving ? 'opacity-50' : 'hover:scale-[1.02] active:scale-[0.98]'}`}
                        >
                            {isSaving ? "SYNCING..." : "SAVE PROFILE"}
                        </button>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
