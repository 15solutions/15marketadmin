import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Zap, Send, ArrowDownLeft, Copy, ExternalLink, RefreshCw, X, Check } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';

export function CircleWalletSection({ address, isLight, notify, onOpen }) {
    const [walletInfo, setWalletInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);

    const fetchWalletInfo = async (silent = false) => {
        if (!address) return;
        if (!silent) setIsLoading(true);
        else setIsRefreshing(true);

        try {
            const res = await fetch(`${KEEPER_URL_ARC}/circle/wallet/${address}`);
            if (res.ok) {
                const data = await res.json();
                setWalletInfo(data);
            }
        } catch (err) {
            console.error("Circle Wallet Error:", err);
            notify("Failed to load Circle Wallet", "error");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchWalletInfo();
    }, [address]);

    const handleSend = async () => {
        if (!destAddress || !sendAmount) {
            notify("Please fill in all fields", "error");
            return;
        }

        setIsSending(true);
        notify("Initiating Transfer...", "pending");

        try {
            // Find USDC or first available token with balance
            const token = walletInfo.balances.find(b => b.token.symbol === 'USDC') || walletInfo.balances[0];
            if (!token) throw new Error("No tokens available to send");

            const res = await fetch(`${KEEPER_URL_ARC}/circle/transfer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address,
                    destinationAddress: destAddress,
                    amount: sendAmount,
                    tokenId: token.token.id
                })
            });

            if (res.ok) {
                notify("Transfer Broadcasted!", "success");
                setShowSendModal(false);
                setSendAmount("");
                setDestAddress("");
                fetchWalletInfo(true);
            } else {
                const data = await res.json();
                throw new Error(data.error || "Transfer failed");
            }
        } catch (err) {
            notify(err.message, "error");
        } finally {
            setIsSending(false);
        }
    };

    const truncate = (str) => str ? `${str.slice(0, 6)}...${str.slice(-4)}` : "";

    if (isLoading) {
        return (
            <div className={`p-6 rounded-[24px] ${isLight ? 'bg-black/5' : 'bg-white/5'} flex items-center justify-center`}>
                <RefreshCw size={20} className="animate-spin text-[#1A6140]" />
            </div>
        );
    }

    if (!walletInfo || !walletInfo.wallet) return null;

    const usdcBalance = walletInfo.balances.find(b => b.token.symbol === 'USDC')?.amount || "0.00";

    return (
        <div className="mt-6">
            <div className={`p-5 rounded-[28px] ${isLight ? 'bg-white border-black/5' : 'bg-[#151515] border-white/5'} border shadow-xl relative overflow-hidden group`}>
                {/* Decorative Background */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-[#1A6140]/5 blur-3xl rounded-full" />
                
                <div className="flex items-center justify-between mb-4 relative z-10">
                    <div>
                        <p className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Circle Managed Wallet</p>
                        <div className="flex items-center gap-2 mt-1">
                            <h4 className={`text-sm font-black font-mono ${isLight ? 'text-black' : 'text-[#1A6140]'}`}>
                                {truncate(walletInfo.wallet.address)}
                            </h4>
                            <div className="flex items-center gap-1">
                                <button 
                                    onClick={() => {
                                        navigator.clipboard.writeText(walletInfo.wallet.address);
                                        notify("Copied address!", "success");
                                    }}
                                    className={`p-1 rounded-md ${isLight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10'}`}
                                >
                                    <Copy size={10} className="opacity-40" />
                                </button>
                                <button 
                                    onClick={() => fetchWalletInfo(true)}
                                    className={`p-1 rounded-md ${isLight ? 'bg-black/5 hover:bg-black/10' : 'bg-white/5 hover:bg-white/10'} ${isRefreshing ? 'animate-spin' : ''}`}
                                >
                                    <RefreshCw size={10} className="opacity-40" />
                                </button>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <p className={`text-[8px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Blockchain</p>
                        <p className={`text-[10px] font-bold ${isLight ? 'text-black/60' : 'text-white/60'} uppercase mt-1`}>
                            {walletInfo.wallet.blockchain.replace('-', ' ')}
                        </p>
                    </div>
                </div>

                <div className="flex items-end justify-between mb-6 relative z-10">
                    <div>
                        <p className={`text-[24px] font-black ${isLight ? 'text-black' : 'text-white'}`}>
                            {parseFloat(usdcBalance).toFixed(2)}
                            <span className="text-xs opacity-40 ml-1">USDC</span>
                        </p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 relative z-10">
                    <button 
                        onClick={() => onOpen?.('send')}
                        className="flex items-center justify-center gap-2 bg-[#1A6140] text-black font-black py-3 rounded-xl text-[10px] uppercase tracking-widest hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-[#1A6140]/20"
                    >
                        <Send size={14} />
                        Send Tokens
                    </button>
                    <button 
                        onClick={() => onOpen?.('receive')}
                        className={`flex items-center justify-center gap-2 ${isLight ? 'bg-black/5 text-black hover:bg-black/10' : 'bg-white/5 text-white hover:bg-white/10'} font-black py-3 rounded-xl text-[10px] uppercase tracking-widest transition-all`}
                    >
                        <ArrowDownLeft size={14} />
                        Receive
                    </button>
                </div>
            </div>
            
            <p className={`text-center text-[7px] mt-2 font-bold uppercase tracking-widest ${isLight ? 'text-black/20' : 'text-white/20'}`}>
                Powered by Circle Programmable Wallets
            </p>
        </div>
    );
}
