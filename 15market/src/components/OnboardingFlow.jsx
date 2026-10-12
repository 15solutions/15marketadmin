import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, Check, ChevronRight, Zap, Shield, Sparkles, Twitter, Camera } from 'lucide-react';
import { useWallets } from '@privy-io/react-auth';
import { useAccount } from 'wagmi';
import { KEEPER_URL_ARC } from '../constants';
import { CountrySelect } from './CountrySelect';

export const OnboardingFlow = ({ address, onComplete, theme, userProfile, evmSessionWallet }) => {
    const [step, setStep] = useState(1);
    const [username, setUsername] = useState(userProfile?.username || '');
    const [selectedAvatar, setSelectedAvatar] = useState(userProfile?.avatar || '');
    // Country of residence (ISO alpha-2) — decides which fiat gateways the
    // funding UI offers. Optional: unset means default gateways.
    const [country, setCountry] = useState(userProfile?.country || '');
    // Wallet model: a main wallet is shown ONLY for external connections.
    const { isConnected: wagmiConnected, address: wagmiAddress, connector } = useAccount();
    const { wallets } = useWallets();
    const hasExternalWallet = (wallets || []).some(w => w.walletClientType && w.walletClientType !== 'privy')
        || (wagmiConnected && !!wagmiAddress && !/privy/i.test(String(connector?.id || connector?.name || '')));
    const [saveError, setSaveError] = useState('');
    const [savedProfile, setSavedProfile] = useState(null);
    const isLight = theme === 'light';

    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!username.trim()) {
            setSaveError('Please enter a display name first.');
            return;
        }
        setIsSaving(true);
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/profiles`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    address: address.toLowerCase(),
                    username: username.trim(),
                    avatar: selectedAvatar.trim(),
                    country: country || undefined,
                    onboarded: true,
                    onboardedAt: Date.now()
                })
            });
            const data = await res.json();
            if (res.ok && data.success) {
                localStorage.setItem(`15market_onboarded_${address.toLowerCase()}`, 'true');
                setSavedProfile(data.profile || { 
                    username: username.trim(), 
                    avatar: selectedAvatar.trim() 
                });
                setStep(3);
            } else {
                setSaveError(data.error || 'Failed to save profile. Please try again.');
            }
        } catch (e) {
            console.error("Save profile failed:", e);
            const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
            setSaveError(`Network error — is the backend running? Check ${host}:3010.`);
        } finally {
            setIsSaving(false);
        }
    };



    return (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl" style={{ fontFamily: '"Comfortaa", cursive' }}>
            <motion.div 
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                className={`w-full max-w-lg ${isLight ? 'bg-white' : 'bg-[#0a0a0a]'} border ${isLight ? 'border-[#249C6C]/20' : 'border-white/10'} rounded-[40px] overflow-hidden shadow-2xl`}
            >
                <div className="p-8 md:p-12">
                    <AnimatePresence mode="wait">
                        {step === 1 && (
                            <motion.div 
                                key="step1"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-6 text-center"
                            >
                                <div className="w-20 h-20 bg-[#249C6C]/5 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-[#249C6C]/10">
                                    <img src={isLight ? "/goblogo.png" : "/gowlogo.png"} alt="15market" className="w-12 h-auto" />
                                </div>
                                <h2 className={`text-3xl font-black uppercase tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                                    Welcome to 15market
                                </h2>
                                <p className={`text-sm ${isLight ? 'text-[#0a261a]/60' : 'text-white/40'} font-medium leading-relaxed`}>
                                    The decentralized real time prediction market. 
                                    Let's get your identity set up before you start trading.
                                </p>
                                <button 
                                    onClick={() => setStep(2)}
                                    className="w-full py-5 bg-[#249C6C] text-white rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-2 group"
                                >
                                    Get Started
                                    <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
                                </button>
                            </motion.div>
                        )}

                        {step === 2 && (
                            <motion.div 
                                key="step2"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="text-center">
                                    <h3 className={`text-2xl font-black uppercase tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                                        Identity Setup
                                    </h3>
                                    <p className={`text-xs ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'} font-bold uppercase tracking-widest mt-1`}>
                                        Step 2 of 2: Create your on-chain profile
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex justify-center mb-6">
                                        <div 
                                            onClick={() => document.getElementById('avatar-upload').click()}
                                            className={`relative w-28 h-28 rounded-full border-2 ${isLight ? 'border-[#249C6C]/30 bg-black/5 hover:border-[#249C6C]' : 'border-white/10 bg-white/5 hover:border-[#249C6C]'} flex items-center justify-center overflow-hidden cursor-pointer transition-all group shadow-xl`}
                                        >
                                            {selectedAvatar ? (
                                                <img src={selectedAvatar} alt="Avatar" className="w-full h-full object-cover" />
                                            ) : (
                                                <div className="flex flex-col items-center gap-1">
                                                    <User size={32} className="opacity-20" />
                                                    <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Upload</span>
                                                </div>
                                            )}
                                            <div className={`absolute inset-0 bg-black/20 flex items-center justify-center transition-opacity ${selectedAvatar ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'}`}>
                                                <div className="w-8 h-8 rounded-full bg-[#249C6C] flex items-center justify-center text-white shadow-lg">
                                                    <span className="text-xl font-black">+</span>
                                                </div>
                                            </div>
                                            <input 
                                                id="avatar-upload"
                                                type="file" 
                                                accept="image/*"
                                                className="hidden"
                                                onChange={(e) => {
                                                    const file = e.target.files[0];
                                                    if (file) {
                                                        const reader = new FileReader();
                                                        reader.onloadend = () => {
                                                            setSelectedAvatar(reader.result);
                                                        };
                                                        reader.readAsDataURL(file);
                                                    }
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="relative">
                                        <div className="absolute left-6 top-1/2 -translate-y-1/2 text-white/20">
                                            <User size={18} />
                                        </div>
                                        <input
                                            type="text"
                                            maxLength={20}
                                            value={username}
                                            onChange={(e) => {
                                                setUsername(e.target.value);
                                                setSaveError('');
                                            }}
                                            placeholder="Choose a Display Name"
                                            className={`w-full py-5 pl-14 pr-8 rounded-2xl ${isLight ? 'bg-gray-50 border-gray-200 text-black' : 'bg-white/5 border-white/10 text-white'} border focus:border-[#249C6C] outline-none text-lg font-black transition-all placeholder:opacity-30 shadow-inner`}
                                        />
                                    </div>

                                    <CountrySelect
                                        theme={theme}
                                        value={country}
                                        onChange={(code) => {
                                            setCountry(code);
                                            setSaveError('');
                                        }}
                                        placeholder="Country of residence"
                                    />
                                </div>


                                {saveError && (
                                    <div className="px-4 py-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold text-center">
                                        ⚠️ {saveError}
                                    </div>
                                )}

                                <button 
                                    disabled={!username.trim() || isSaving}
                                    onClick={handleSave}
                                    className={`w-full py-5 ${!username.trim() ? 'bg-white/5 text-white/20' : 'bg-[#249C6C] text-white shadow-[0_0_20px_rgba(36, 156, 108,0.3)]'} rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-3`}
                                >
                                    {isSaving ? "Finalizing..." : "Complete Setup"}
                                    {!isSaving && <Zap size={18} />}
                                </button>
                            </motion.div>
                        )}

                        {step === 3 && (
                            <motion.div 
                                key="step3"
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                className="space-y-8"
                            >
                                <div className="text-center">
                                    <h3 className={`text-2xl font-black uppercase tracking-tighter ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>
                                        Your Wallets
                                    </h3>
                                    <p className={`text-xs ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'} font-bold uppercase tracking-widest mt-1`}>
                                        Step 3 of 3: Ready to trade
                                    </p>
                                </div>
                                <div className="space-y-4">
                                    {hasExternalWallet && (
                                    <div className={`p-5 rounded-2xl border ${isLight ? 'bg-black/5 border-[#249C6C]/20' : 'bg-white/5 border-white/10'}`}>
                                        <div className="flex items-center gap-3 mb-2">
                                            <Shield size={16} className="text-[#249C6C]" />
                                            <h4 className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>Main Wallet</h4>
                                        </div>
                                        <p className={`text-sm font-mono font-bold ${isLight ? 'text-[#0a261a]/80' : 'text-white/80'} break-all`}>
                                            {username} <span className="opacity-50">({address.slice(0, 6)}...{address.slice(-4)})</span>
                                        </p>
                                        <p className={`text-[9px] font-bold mt-2 ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'} uppercase tracking-widest`}>Connected via Privy / Web3</p>
                                    </div>
                                    )}

                                    <div className={`p-5 rounded-2xl border ${isLight ? 'bg-[#249C6C]/10 border-[#249C6C]/30' : 'bg-[#249C6C]/10 border-[#249C6C]/20'}`}>
                                        <div className="flex items-center gap-3 mb-2">
                                            <Zap size={16} className="text-[#249C6C]" />
                                            <h4 className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-[#0a261a]' : 'text-white'}`}>Trading Wallet (Auto-Signer)</h4>
                                        </div>
                                        <p className={`text-sm font-mono font-bold ${isLight ? 'text-[#0a261a]/80' : 'text-white/80'} break-all`}>
                                            {evmSessionWallet?.address || "Syncing..."}
                                        </p>
                                        <p className={`text-[9px] font-bold mt-2 ${isLight ? 'text-[#0a261a]/40' : 'text-white/40'} uppercase tracking-widest`}>Zero-click execution layer</p>
                                    </div>
                                </div>

                                <button 
                                    onClick={() => onComplete(savedProfile)}
                                    className={`w-full py-5 bg-[#249C6C] text-white shadow-[0_0_20px_rgba(36, 156, 108,0.3)] rounded-2xl font-black uppercase tracking-widest hover:brightness-110 transition-all flex items-center justify-center gap-3`}
                                >
                                    Enter 15market
                                    <ChevronRight size={18} />
                                </button>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Removed Secured by Arc footer */}
            </motion.div>
        </div>
    );
};
