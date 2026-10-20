import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronDown, ArrowRight, Zap, Wallet, Info, RefreshCw, Check, ArrowDownLeft, AlertTriangle, ShieldCheck } from 'lucide-react';
import { SUPPORTED_TOKENS } from '../tokens';
import { KEEPER_URL_ARC } from '../constants';
import * as ethers from 'ethers';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';

// ─── CCTP V2 TESTNET CHAIN CONFIG ────────────────────────────────────────────
// Official Circle docs: https://developers.circle.com/stablecoin/docs/cctp-contract-addresses
// Domain IDs: Eth Sepolia=0, Fuji=1, OP Sepolia=2, Base Sepolia=6, Monad Testnet=15
// Destination is always Arc Testnet (domain 26, chain 5042002)
// CCTP V2 TokenMessenger: 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA (shared across all chains)
const CCTP_CHAIN_CONFIG = {
    'mon': {
        name: 'Monad Testnet',
        chainId: 10143,
        domain: 15,
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        usdc: '0x534b2f3A21130d7a60830c2Df862319e593943A3',
        rpc: 'https://testnet-rpc.monad.xyz/',
        destDomain: 26,
        destChainId: '5042002',
        // Privy Pimlico paymaster is NOT configured for Monad Testnet on the dashboard.
        // Transactions must go through the EOA signer path instead of ERC-4337 smart wallet.
        paymasterSupported: false
    },
    'eth': {
        name: 'Ethereum Sepolia',
        chainId: 11155111,
        domain: 0,
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
        permitName: 'USDC',
        destDomain: 26,
        destChainId: '5042002'
    },
    'avax': {
        name: 'Avalanche Fuji',
        chainId: 43113,
        domain: 1,
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        usdc: '0x5425890298aed601595a70AB815c96711a31Bc65',
        rpc: 'https://avalanche-fuji-c-chain-rpc.publicnode.com',
        permitName: 'USD Coin',
        destDomain: 26,
        destChainId: '5042002'
    },
    'base': {
        name: 'Base Sepolia',
        chainId: 84532,
        domain: 6,
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        rpc: 'https://sepolia.base.org',
        permitName: 'USDC',
        destDomain: 26,
        destChainId: '5042002'
    },
    'op': {
        name: 'OP Sepolia',
        chainId: 11155420,
        domain: 2,
        tokenMessenger: '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA',
        usdc: '0x5fd84259d66Cd46123540766Be93DFE6D43130D7',
        rpc: 'https://sepolia.optimism.io',
        permitName: 'USDC',
        destDomain: 26,
        destChainId: '5042002'
    }
};

// Arc Testnet CCTP V2 MessageTransmitter (destination for all bridges)
const ARC_MESSAGE_TRANSMITTER = '0xE737e5CEBEEBa77EFE34D4aa090756590b1CE275';
const ARC_CHAIN_ID = 5042002;
const IRIS_V2_BASE = 'https://iris-api-sandbox.circle.com';

const TESTNET_RPCS = {
    'mon': 'https://testnet-rpc.monad.xyz/',
    'avax': 'https://avalanche-fuji-c-chain-rpc.publicnode.com',
    'eth': 'https://ethereum-sepolia-rpc.publicnode.com',
    'sol': 'https://api.devnet.solana.com'
};

const ERC20_ABI = [
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function allowance(address owner, address spender) view returns (uint256)',
    'function balanceOf(address account) view returns (uint256)',
    'function decimals() view returns (uint8)',
];

export function UnifiedFundingModal({ 
    isOpen, 
    onClose, 
    isLight, 
    notify, 
    address, 
    sessionAddress, 
    onSuccess,
    initialToken,
    wallets = [],
    smartWalletAddress
}) {
    const TokenLogoInfused = ({ token, isLight, size = "w-20 h-20", mode = 'stables' }) => {
        const iconSrc = mode === 'stables' ? `/${token.id}usdc.png` : token.icon;
        
        return (
            <div className={`relative ${size} flex items-center justify-center`}>
                <img 
                    src={iconSrc} 
                    className="w-full h-full object-contain drop-shadow-[0_0_30px_rgba(26, 97, 64,0.3)]" 
                    style={{ filter: isLight && mode === 'native' ? 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)' : 'none' }}
                    alt={token.symbol} 
                />
            </div>
        );
    };

    const [selectedToken, setSelectedToken] = useState(initialToken || SUPPORTED_TOKENS[0]);
    const [fundingMode, setFundingMode] = useState(null); // null | 'native' | 'stables'
    const [amount, setAmount] = useState("");
    const [isQuoting, setIsQuoting] = useState(false);
    const [quote, setQuote] = useState(null);
    const [isConfirming, setIsConfirming] = useState(false);
    const [balances, setBalances] = useState({});
    const { client: smartWalletClient } = useSmartWallets();

    // Keep state in sync with initialToken prop
    useEffect(() => {
        if (initialToken) setSelectedToken(initialToken);
    }, [initialToken]);

    // Multi-chain address mapping
    const solWallet = useMemo(() => wallets?.find(w => w.address && !w.address.startsWith('0x')), [wallets]);
    const evmWallet = useMemo(() => {
        return wallets?.find(w => w.address?.toLowerCase() === address?.toLowerCase())
            || wallets?.find(w => w.address && w.address.startsWith('0x'));
    }, [wallets, address]);

    // Fetch Balances
    useEffect(() => {
        if (!isOpen || !evmWallet) return;

        const fetchBalances = async () => {
            const newBalances = {};
            
            for (const token of SUPPORTED_TOKENS) {
                try {
                    if (token.id === 'sol') {
                        const solWallet = wallets?.find(w => w.address && !w.address.startsWith('0x'));
                        if (!solWallet) {
                            newBalances[`${token.id}_native`] = 0;
                            newBalances[`${token.id}_stables`] = 0;
                            continue;
                        }
                        const rpcUrl = TESTNET_RPCS['sol'];
                        const bodyNative = { jsonrpc: "2.0", id: 1, method: "getBalance", params: [solWallet.address] };
                        const resNative = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyNative) });
                        const dataNative = await resNative.json();
                        newBalances[`${token.id}_native`] = (dataNative.result?.value || 0) / 1e9;

                        const bodyUsdc = { jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [solWallet.address, { mint: "4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU" }, { encoding: "jsonParsed" }] };
                        const resUsdc = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyUsdc) });
                        const dataUsdc = await resUsdc.json();
                        newBalances[`${token.id}_stables`] = dataUsdc.result?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
                        continue;
                    }

                    const rpcUrl = TESTNET_RPCS[token.id];
                    if (!rpcUrl) continue;

                    const provider = new ethers.JsonRpcProvider(rpcUrl);
                    
                    // Fetch Native
                    const nativeBal = await provider.getBalance(evmWallet.address);
                    newBalances[`${token.id}_native`] = parseFloat(ethers.formatEther(nativeBal));

                    // Fetch USDC from smart wallet if available, otherwise fallback to EOA
                    const signingAddress = smartWalletAddress || evmWallet.address;
                    if (token.usdcAddress && token.usdcAddress !== ethers.ZeroAddress) {
                        const usdcContract = new ethers.Contract(token.usdcAddress, ERC20_ABI, provider);
                        const usdcBal = await usdcContract.balanceOf(signingAddress);
                        // USDC usually has 6 decimals on Fuji/Sepolia
                        const decimals = token.id === 'mon' ? 18 : 6; 
                        newBalances[`${token.id}_stables`] = parseFloat(ethers.formatUnits(usdcBal, decimals));
                    } else {
                        newBalances[`${token.id}_stables`] = 0;
                    }
                } catch (err) {
                    console.warn(`Balance fetch failed for ${token.name}:`, err);
                    newBalances[`${token.id}_native`] = 0;
                    newBalances[`${token.id}_stables`] = 0;
                }
            }
            setBalances(newBalances);
        };

        fetchBalances();
        const interval = setInterval(fetchBalances, 10000);
        return () => clearInterval(interval);
    }, [isOpen, evmWallet]);

    // Fetch Quote when amount or token changes
    useEffect(() => {
        if (!amount || parseFloat(amount) <= 0) {
            setQuote(null);
            return;
        }

        const fetchQuote = async () => {
            setIsQuoting(true);
            try {
                if (fundingMode === 'stables') {
                    const res = await fetch(`${KEEPER_URL_ARC}/fund/bridge-quote?sourceChain=${selectedToken.id}&amount=${amount}`);
                    const data = await res.json();
                    if (data.success) {
                        setQuote({
                            estimatedUsdc: data.netAmount.toFixed(2),
                            fee: data.gasFeesUsdc.toFixed(2),
                            spread: "0.00",
                            aggregator: "15market Gas Tank (Gasless)",
                            deadline: data.deadline,
                            relayerAddress: data.relayerAddress
                        });
                    } else {
                        throw new Error(data.error || "Failed to fetch quote");
                    }
                } else {
                    const mockPrices = { 'ETH': 3500, 'AVAX': 35, 'MON': 2.5, 'SOL': 150 };
                    const price = mockPrices[selectedToken.symbol] || 1;
                    const rawUsdc = parseFloat(amount) * price;
                    const spread = rawUsdc * 0.01;
                    const estimatedUsdc = rawUsdc - spread;
                    setQuote({
                        estimatedUsdc: estimatedUsdc.toFixed(2),
                        fee: (0.50).toFixed(2),
                        spread: spread.toFixed(2),
                        aggregator: "Unitflow + Xylonet"
                    });
                }
            } catch (err) {
                console.error("Quote error:", err);
            } finally {
                setIsQuoting(false);
            }
        };

        const timer = setTimeout(fetchQuote, 500);
        return () => clearTimeout(timer);
    }, [amount, selectedToken, fundingMode]);

    const handleSwipeToken = (direction) => {
        const currentIndex = SUPPORTED_TOKENS.findIndex(t => t.id === selectedToken.id);
        if (direction === 'left' && currentIndex < SUPPORTED_TOKENS.length - 1) {
            setSelectedToken(SUPPORTED_TOKENS[currentIndex + 1]);
        } else if (direction === 'right' && currentIndex > 0) {
            setSelectedToken(SUPPORTED_TOKENS[currentIndex - 1]);
        }
    };

    const handleFunding = async () => {
        if (!amount || !quote || !evmWallet) return;

        setIsConfirming(true);

        try {
            const ethProvider = await evmWallet.getEthereumProvider();

            if (!sessionAddress) throw new Error('Session wallet not initialized. Please retry.');

            if (fundingMode === 'stables') {
                // Resolve config for the selected token
                const cctpCfg = CCTP_CHAIN_CONFIG[selectedToken.id];
                if (!cctpCfg) {
                    throw new Error(`${selectedToken.name} is not supported for CCTP bridging yet.`);
                }

                if (!quote || !quote.relayerAddress) {
                    throw new Error('No quote available or invalid. Please retry.');
                }

                const eoaWalletObj = wallets?.find(w =>
                    w.address?.toLowerCase() === (evmWallet?.address || '').toLowerCase()
                ) || evmWallet;
                if (!eoaWalletObj) throw new Error('No EOA wallet found. Please reconnect.');

                notify(`Switching wallet to ${cctpCfg.name}...`, 'pending');
                await eoaWalletObj.switchChain(cctpCfg.chainId);

                const eoaEthProvider = await eoaWalletObj.getEthereumProvider();
                const eoaProvider = new ethers.BrowserProvider(eoaEthProvider, 'any');
                const eoaSigner = await eoaProvider.getSigner();
                const signingAddress = await eoaSigner.getAddress();

                const readProvider = new ethers.JsonRpcProvider(cctpCfg.rpc);
                const usdcContract = new ethers.Contract(cctpCfg.usdc, [
                    'function nonces(address owner) view returns (uint256)',
                    'function decimals() view returns (uint8)',
                    'function balanceOf(address owner) view returns (uint256)'
                ], readProvider);

                const decimals = await usdcContract.decimals().catch(() => 6);
                const val = ethers.parseUnits(amount, decimals);
                const userBal = await usdcContract.balanceOf(signingAddress).catch(() => 0n);
                if (userBal < val) {
                    throw new Error(`Insufficient USDC. You have ${ethers.formatUnits(userBal, decimals)} USDC on ${cctpCfg.name}.`);
                }

                const nonce = await usdcContract.nonces(signingAddress);

                const domain = {
                    name: cctpCfg.permitName,
                    version: '2',
                    chainId: cctpCfg.chainId,
                    verifyingContract: cctpCfg.usdc
                };

                const types = {
                    Permit: [
                        { name: 'owner', type: 'address' },
                        { name: 'spender', type: 'address' },
                        { name: 'value', type: 'uint256' },
                        { name: 'nonce', type: 'uint256' },
                        { name: 'deadline', type: 'uint256' }
                    ]
                };

                const spender = quote.relayerAddress;
                const deadline = quote.deadline;

                const value = {
                    owner: signingAddress,
                    spender: spender,
                    value: val,
                    nonce: nonce,
                    deadline: deadline
                };

                notify(`Please sign the Gasless deposit permit in your wallet...`, 'pending');
                
                const signature = await eoaSigner.signTypedData(domain, types, value);
                const sig = ethers.Signature.from(signature);

                notify(`Submitting deposit to Gas Tank...`, 'pending');

                const body = {
                    address: address, // user identity
                    sourceChain: selectedToken.id,
                    amount: amount,
                    userAddress: signingAddress,
                    permit: {
                        v: sig.v,
                        r: sig.r,
                        s: sig.s,
                        deadline: deadline,
                        nonce: Number(nonce)
                    },
                    destMintRecipient: sessionAddress
                };

                const res = await fetch(`${KEEPER_URL_ARC}/fund/permit-bridge`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });
                const data = await res.json();
                if (!data.success) {
                    throw new Error(data.error || 'Gas Tank submission failed');
                }

                notify(`✅ Gasless deposit registered! ${data.netAmount} USDC will arrive in ~2 mins.`, 'success');

            } else {
                // Native token path: not supported via smart wallet on source chains
                throw new Error('Native token transfers are not supported with smart wallets. Please use USDC bridging.');
            }

            if (onSuccess) onSuccess();
            onClose();
        } catch (err) {
            console.error('[CCTP] Funding Error:', err);
            notify(err.message || 'Deposit failed. Please try again.', 'error');
        } finally {
            setIsConfirming(false);
        }
    };



    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[500] flex items-end md:items-center justify-center p-0 md:p-6 overflow-hidden" style={{ fontFamily: '"Comfortaa", cursive' }}>
            <motion.div 
                initial={{ opacity: 0 }} 
                animate={{ opacity: 1 }} 
                exit={{ opacity: 0 }} 
                onClick={onClose} 
                className="absolute inset-0 bg-black/90 backdrop-blur-md" 
            />
            
            <motion.div 
                initial={{ opacity: 0, y: 100 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0, y: 100 }}
                className={`w-full md:max-w-xl relative z-10 rounded-t-[40px] md:rounded-[40px] border-t md:border overflow-hidden flex flex-col ${isLight ? 'bg-[#CFDCD5] border-black/5 shadow-2xl' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'}`}
            >
                {/* Header Section */}
                <div className={`p-6 border-b flex items-center justify-between shrink-0 ${isLight ? 'bg-white/40 border-black/5' : 'bg-white/[0.02] border-white/5'}`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#1A6140]/10 flex items-center justify-center">
                            <Zap className="text-[#1A6140]" size={20} />
                        </div>
                        <div>
                            <h3 className={`text-lg font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>Quick Fund</h3>
                            <p className="text-[10px] font-bold text-[#1A6140] uppercase tracking-widest">Main → Trading Vault</p>
                        </div>
                    </div>
                    <button onClick={onClose} className={`p-2 rounded-full transition-colors ${isLight ? 'hover:bg-black/5 text-black/40' : 'hover:bg-white/5 text-white/40'}`}>
                        <X size={24} />
                    </button>
                </div>

                <div className="p-6 flex flex-col gap-6 max-h-[85dvh] overflow-y-auto custom-scrollbar">
                                        {/* Guided Funding Selection */}
                    <div className={`p-8 rounded-[40px] border relative overflow-hidden flex flex-col items-center justify-center min-h-[320px] ${isLight ? 'bg-[#C2D1C9] border-black/5 shadow-xl' : 'bg-[#111] border-white/5 shadow-2xl'}`}>
                        <div className="absolute top-0 right-0 w-32 h-32 bg-[#1A6140]/5 blur-[60px] rounded-full" />
                        
                        <AnimatePresence mode="wait">
                            {!fundingMode ? (
                                <motion.div 
                                    key="selection"
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    className="flex flex-row items-center justify-center gap-0 w-full h-full"
                                >
                                    <button 
                                        onClick={() => setFundingMode('native')}
                                        className={`flex-1 group relative p-6 h-full flex flex-col items-center justify-center gap-4 transition-all hover:bg-[#1A6140]/5 active:scale-[0.98]`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-[#1A6140]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Zap size={24} className="text-[#1A6140]" />
                                        </div>
                                        <div className="text-center">
                                            <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black' : 'text-white'}`}>Native</p>
                                        </div>
                                    </button>

                                    {/* Vertical Divider */}
                                    <div className="w-px h-16 bg-[#1A6140]/20" />

                                    <button 
                                        onClick={() => setFundingMode('stables')}
                                        className={`flex-1 group relative p-6 h-full flex flex-col items-center justify-center gap-4 transition-all hover:bg-[#1A6140]/5 active:scale-[0.98]`}
                                    >
                                        <div className="w-12 h-12 rounded-full bg-[#1A6140]/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                                            <Globe size={24} className="text-[#1A6140]" />
                                        </div>
                                        <div className="text-center">
                                            <p className={`text-[11px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black' : 'text-white'}`}>Stables</p>
                                        </div>
                                    </button>
                                </motion.div>
                            ) : (
                                <motion.div 
                                    key="assets"
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    exit={{ opacity: 0, x: -20 }}
                                    className="flex flex-col gap-4 w-full"
                                >
                                    <div className="flex items-center justify-between w-full mb-2">
                                        <button 
                                            onClick={() => setFundingMode(null)}
                                            className={`p-2 rounded-xl flex items-center gap-2 hover:scale-105 active:scale-95 transition-all ${isLight ? 'bg-black/5 text-black' : 'bg-white/5 text-white/60'}`}
                                        >
                                            <ChevronLeft size={16} />
                                            <span className="text-[9px] font-black uppercase tracking-widest">Type</span>
                                        </button>
                                        <div className="flex gap-1">
                                            {SUPPORTED_TOKENS.map(t => (
                                                <div key={t.id} className={`w-1 h-1 rounded-full transition-all ${selectedToken.id === t.id ? 'w-3 bg-[#1A6140]' : 'bg-white/10'}`} />
                                            ))}
                                        </div>
                                    </div>

                                    <div className="relative h-[120px] w-full flex items-center justify-center">
                                        {/* Token Navigation Buttons */}
                                        <button 
                                            onClick={() => handleSwipeToken('right')}
                                            className={`absolute left-0 top-1/2 -translate-y-1/2 z-20 p-2 text-[#1A6140] hover:scale-110 active:scale-90 transition-all`}
                                        >
                                            <ChevronLeft size={32} strokeWidth={3} />
                                        </button>
                                        <button 
                                            onClick={() => handleSwipeToken('left')}
                                            className={`absolute right-0 top-1/2 -translate-y-1/2 z-20 p-2 text-[#1A6140] hover:scale-110 active:scale-90 transition-all`}
                                        >
                                            <ChevronRight size={32} strokeWidth={3} />
                                        </button>

                                        <AnimatePresence mode="wait">
                                            <motion.div
                                                key={`${selectedToken.id}-${fundingMode}`}
                                                drag="x"
                                                dragConstraints={{ left: 0, right: 0 }}
                                                onDragEnd={(e, info) => {
                                                    if (info.offset.x < -50) handleSwipeToken('left');
                                                    else if (info.offset.x > 50) handleSwipeToken('right');
                                                }}
                                                initial={{ opacity: 0, scale: 0.9 }}
                                                animate={{ opacity: 1, scale: 1 }}
                                                exit={{ opacity: 0, scale: 0.9 }}
                                                className="w-full flex items-center justify-between px-4"
                                            >
                                                <div className="flex flex-col items-center">
                                                    <TokenLogoInfused token={selectedToken} isLight={isLight} mode={fundingMode} />
                                                    <span className={`mt-2 text-[10px] font-black ${isLight ? 'text-black' : 'text-white'}`}>{selectedToken.symbol}</span>
                                                </div>
                                                <ArrowRightLeft size={20} className="text-[#1A6140] mx-4" />
                                                <div className="flex flex-col items-center">
                                                    <div className="w-12 h-12 rounded-full bg-[#1A6140]/20 flex items-center justify-center">
                                                        <span className="text-[10px] font-black text-[#1A6140]">USDC</span>
                                                    </div>
                                                    <span className={`mt-2 text-[10px] font-black ${isLight ? 'text-black' : 'text-white'}`}>Vault</span>
                                                </div>
                                            </motion.div>
                                        </AnimatePresence>
                                    </div>
                                    <p className="text-[10px] text-center font-bold text-[#1A6140] uppercase tracking-[0.2em]">
                                        {balances[`${selectedToken.id}_${fundingMode}`]?.toFixed(2) || '0.00'} Available
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>


                    {/* Amount Input */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between px-2">
                            <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Funding Amount</label>
                             <button onClick={() => setAmount(balances[`${selectedToken.id}_${fundingMode}`]?.toString())} className="text-[10px] font-black text-[#1A6140] uppercase hover:underline">Use Max</button>
                        </div>
                        <div className="relative group">
                            <input 
                                type="number" 
                                placeholder="0.00"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className={`w-full py-6 px-8 rounded-[32px] text-4xl font-black transition-all outline-none border-2 border-transparent focus:border-[#1A6140]/30 ${isLight ? 'bg-[#CFDCD5] text-[#2d3d34] shadow-lg' : 'bg-white/5 text-white shadow-2xl'}`}
                            />
                            <div className="absolute right-8 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                <span className="text-xl font-black text-[#1A6140]">{selectedToken.symbol}</span>
                            </div>
                        </div>
                    </div>

                    {/* Quote & Results */}
                    <AnimatePresence>
                        {quote ? (
                            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`p-6 rounded-[32px] border ${isLight ? 'bg-[#C2D1C9] border-black/5 shadow-md' : 'bg-[#151515] border-white/5'} flex flex-col gap-4`}>
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Estimated Deposit</p>
                                        <p className="text-2xl font-black text-[#1A6140]">{quote.estimatedUsdc} USDC</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Net Fees</p>
                                        <p className="text-xs font-bold text-orange-500">{(parseFloat(quote.fee) + parseFloat(quote.spread)).toFixed(2)} USDC</p>
                                    </div>
                                </div>
                                <div className="h-[1px] bg-white/5 w-full" />
                                <div className="flex items-center gap-2">
                                    <ShieldCheck size={14} className="text-[#1A6140]" />
                                    <p className="text-[9px] font-bold uppercase tracking-wide opacity-40">Automated settlement on Arc Mainnet Node.</p>
                                </div>
                            </motion.div>
                        ) : (
                            <div className={`p-6 rounded-[32px] border border-dashed flex items-center gap-4 ${isLight ? 'border-black/10' : 'border-white/10'}`}>
                                <Info size={18} className="text-[#1A6140] shrink-0" />
                                <p className="text-[9px] font-bold uppercase leading-relaxed opacity-40">
                                    Funding your Trading Wallet converts any asset to USDC instantly for high-speed trade execution.
                                </p>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* Action Button */}
                    <button 
                        onClick={handleFunding}
                        disabled={true}
                        className={`w-full py-6 rounded-[28px] font-black uppercase tracking-[0.2em] text-sm transition-all shadow-xl bg-[#1A6140] text-black hover:scale-[1.02] active:scale-[0.98] shadow-[#1A6140]/20`}
                    >
                        Confirm
                    </button>
                </div>
            </motion.div>
        </div>
    );
}
