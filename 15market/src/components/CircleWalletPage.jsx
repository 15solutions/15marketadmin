import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Shield, Zap, Send, ArrowDownLeft, Copy, ExternalLink, RefreshCw, X, Check, ArrowLeft, History, Wallet, Globe, Info, ChevronDown, Download, Save, CreditCard, ChevronLeft, ChevronRight, Nfc } from 'lucide-react';
import { KEEPER_URL_ARC } from '../constants';
import { SUPPORTED_TOKENS } from '../tokens';
import QRCode from 'qrcode';
import { toPng } from 'html-to-image';
import { UnifiedFundingModal } from './UnifiedFundingModal';
import WalletConnectionLoading from './WalletConnectionLoading';
import * as ethers from 'ethers';
import { useWallets, usePrivy, useCreateWallet, useLinkAccount } from '@privy-io/react-auth';
import { useSmartWallets } from '@privy-io/react-auth/smart-wallets';

const CHAIN_CONFIG = {
    'mon': { rpc: 'https://testnet-rpc.monad.xyz/', isEVM: true, usdc: '0x534b2f3A21130d7a60830c2Df862319e593943A3', paymasterSupported: false, permitName: 'USDC' },
    'avax': { rpc: 'https://avalanche-fuji-c-chain-rpc.publicnode.com', isEVM: true, usdc: '0x5425890298aed601595a70AB815c96711a31Bc65', permitName: 'USD Coin' },
    'eth': { rpc: 'https://ethereum-sepolia-rpc.publicnode.com', isEVM: true, usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', permitName: 'USDC' },
    'sol': { rpc: 'https://api.devnet.solana.com', isEVM: false, usdc: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU' }
};

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function transfer(address to, uint256 amount) external returns (bool)",
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)"
];

// CCTP V2 TokenMessenger — same address on all supported testnet chains
const CCTP_V2_TOKEN_MESSENGER = '0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA';
const CCTP_TOKEN_MESSENGER = {
    'mon':  CCTP_V2_TOKEN_MESSENGER, // Monad Testnet (domain 15)
    'avax': CCTP_V2_TOKEN_MESSENGER, // Fuji (domain 1)
    'eth':  CCTP_V2_TOKEN_MESSENGER, // Sepolia (domain 0)
    'base': CCTP_V2_TOKEN_MESSENGER, // Base Sepolia (domain 6)
    'op':   CCTP_V2_TOKEN_MESSENGER, // OP Sepolia (domain 2)
};

// CCTP V2 source domain IDs per chain token key
const CCTP_SOURCE_DOMAIN = {
    'mon':  15, // Monad Testnet
    'eth':   0, // Ethereum Sepolia
    'avax':  1, // Avalanche Fuji
    'base':  6, // Base Sepolia
    'op':    2, // OP Sepolia
};

// Arc Testnet CCTP V2 MessageTransmitter (destination for all bridges)
const ARC_TESTNET_TRANSMITTER = '0xe737e5cebeeba77efe34d4aa090756590b1ce275';
const ARC_TESTNET_CHAIN_ID    = 5042002;
const IRIS_API_V2_BASE        = 'https://iris-api-sandbox.circle.com';

const TOKEN_MESSENGER_ABI = [
    "function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 hookData, uint256 maxFee, uint32 finalityThreshold) external returns (uint64)",
    "function depositForBurnWithHook(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 destinationCaller, uint256 maxFee, uint32 minFinalityThreshold, bytes calldata hookData) external returns (uint64 _nonce)"
];

const GATEWAY_ADDRESSES = {
    'mon': '0x094604E6bA1E98756b0de29a9E2285Ead0c443Fd',
    'avax': '0xeb08f243e5d3fcff26a9e38ae5520a669f4019d0',
    'eth': '0x9f3B8679c73C2Fef8b59B4f3444d4e156fb70AA5'
};

const GATEWAY_ABI = [
    "function fundWithNative(bytes32 tradingWallet, uint256 minUsdcOut) external payable"
];

export function CircleWalletPage({
    address,
    wagmiAddress,
    isLight,
    notify,
    onBack,
    initialMode,
    username,
    evmBalance = '0',
    sessionBalance = 0,
    sessionAddress = '',
    wallets = [],
    walletClient,
    smartWalletAddress, // ERC-4337 smart wallet — pays gas in USDC via Pimlico
    switchChainAsync,
    onWithdraw,
    triggerGlobalRefresh
}) {
    // Authoritative Main Wallet (EVM external wallet if connected, otherwise Privy embedded wallet)
    const mainWalletObj = wallets?.find(w => w.address && w.address.startsWith('0x') && w.walletClientType !== 'privy')
        || wallets?.find(w => w.address && w.address.startsWith('0x'));
    const mainWalletAddress = address;
    const fundingSourceAddress = address || wagmiAddress || mainWalletObj?.address;

    // Solana wallet detection
    usePrivy(); // keep Privy context active
    const { createWallet } = useCreateWallet();
    const { linkWallet } = useLinkAccount({
        onSuccess: () => { if (notify) notify('Solana wallet linked!', 'success'); }
    });
    // Keep generatedSolWalletPub in state, synced with backend
    const [generatedSolWalletPub, setGeneratedSolWalletPub] = useState(() => {
        return localStorage.getItem(`15market_solana_deposit_pub_${fundingSourceAddress}`) || null;
    });

    useEffect(() => {
        if (!fundingSourceAddress) {
            setGeneratedSolWalletPub(null);
            return;
        }

        // Immediately sync state with whatever is cached for this specific address
        const cached = localStorage.getItem(`15market_solana_deposit_pub_${fundingSourceAddress}`);
        setGeneratedSolWalletPub(cached || null);

        const fetchPermanentSolAddress = async () => {
            try {
                const res = await fetch(`${KEEPER_URL_ARC}/solana/address/${fundingSourceAddress}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.address) {
                        setGeneratedSolWalletPub(data.address);
                        localStorage.setItem(`15market_solana_deposit_pub_${fundingSourceAddress}`, data.address);
                    } else {
                        setGeneratedSolWalletPub(null);
                        localStorage.removeItem(`15market_solana_deposit_pub_${fundingSourceAddress}`);
                    }
                }
            } catch (err) {
                console.warn("Failed to fetch permanent Solana wallet:", err);
            }
        };
        fetchPermanentSolAddress();
    }, [fundingSourceAddress]);

    const solanaWallet = wallets?.find(w => w.address && !w.address.startsWith('0x'));
    // If pubKey is present, we assume the backend has the private key stashed.
    const hasSolWallet = !!solanaWallet || !!generatedSolWalletPub;
    const [isCreatingSolWallet, setIsCreatingSolWallet] = useState(false);

    const handleGenerateSolWallet = async () => {
        setIsCreatingSolWallet(true);
        try {
            const { Keypair } = await import('@solana/web3.js');
            const bs58 = (await import('bs58')).default;
            const newKeypair = Keypair.generate();
            const privKey = bs58.encode(newKeypair.secretKey);
            const pubKey = newKeypair.publicKey.toString();
            
            // Stash private key and public key in backend profiles db
            const res = await fetch(`${KEEPER_URL_ARC}/solana/stash-key`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ address: fundingSourceAddress, privKey, pubKey })
            });
            if (!res.ok) throw new Error("Failed to stash key in secure cache");

            // Store public key locally and in state
            localStorage.setItem(`15market_solana_deposit_pub_${fundingSourceAddress}`, pubKey);
            setGeneratedSolWalletPub(pubKey);
            localStorage.removeItem(`15market_solana_deposit_${fundingSourceAddress}`); // clean up old local keys if any
            
            setIsCreatingSolWallet(false);
            if (notify) notify('Solana deposit wallet generated!', 'success');
        } catch (e) {
            console.error(e);
            if (notify) notify(e.message || 'Failed to create Solana deposit wallet', 'error');
            setIsCreatingSolWallet(false);
        }
    };

    const handleLinkSolWallet = () => {
        try {
            linkWallet();
        } catch (e) {
            if (notify) notify(e.message || 'Failed to open wallet linker', 'error');
        }
    };

    const [walletInfo, setWalletInfo] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [multiChainBalances, setMultiChainBalances] = useState({});
    const [isFetchingBalances, setIsFetchingBalances] = useState(false);
    const [mainWalletArcBalance, setMainWalletArcBalance] = useState(0);

    // UI State
    const [activeWalletIdx, setActiveWalletIdx] = useState(0); // 0: Trading, 1: Main
    const hubDeckRef = useRef(null); // wallet card deck box (for fit-to-screen scaling)
    const flipDirRef = useRef(1); // 3D flip direction: -1 = flip forward, 1 = flip back
    const [hubScale, setHubScale] = useState(1);

    // The card is designed on a fixed 448 × 260 canvas (same as the dashboard
    // card); measure its box and scale the whole canvas down uniformly so it
    // always fits the screen.
    useEffect(() => {
        const el = hubDeckRef.current;
        if (!el) return;
        const applyScale = () => setHubScale(Math.min(1, el.clientWidth / 448));
        applyScale();
        const ro = new ResizeObserver(applyScale);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const [activeTokenIdx, setActiveTokenIdx] = useState(0); // For Main Wallet token funding
    const [fundingType, setFundingType] = useState(null); // null | 'native' | 'usdc'
    const [showSendModal, setShowSendModal] = useState(initialMode === 'send');
    const [showReceiveModal, setShowReceiveModal] = useState(initialMode === 'receive');
    const [showUnifiedFunding, setShowUnifiedFunding] = useState(false);
    const [fundingStep, setFundingStep] = useState('selection'); // selection, loading, input, confirming, success
    const [fundingAmount, setFundingAmount] = useState('');
    const [isFundingSuccess, setIsFundingSuccess] = useState(false);

    const { client: smartWalletClient } = useSmartWallets();

    // ────────────────────────────────────────────────────────
    // EFFECTS
    // ────────────────────────────────────────────────────────
    const [cctpStep, setCctpStep] = useState(0); // 0=idle 1=approving 2=burning 3=attesting 4=minting
    const [cctpLogs, setCctpLogs] = useState([]);

    // Form State
    const [sendAmount, setSendAmount] = useState("");
    const [destAddress, setDestAddress] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [qrCodeData, setQrCodeData] = useState("");
    const [activeTab, setActiveTab] = useState('assets');
    // Swap tab state
    const [swapFrom, setSwapFrom] = useState('USDC');
    const [swapTo, setSwapTo] = useState('EURC');
    const [swapAmount, setSwapAmount] = useState('');
    const [swapQuote, setSwapQuote] = useState(null);
    const [isGettingQuote, setIsGettingQuote] = useState(false);
    const SWAP_TOKENS = ['USDC', 'EURC', 'cirBTC'];
    const SWAP_RATES = { 'USDC-EURC': 0.921, 'EURC-USDC': 1.086, 'USDC-cirBTC': 0.0000142, 'cirBTC-USDC': 70422, 'EURC-cirBTC': 0.0000131, 'cirBTC-EURC': 76543 };
    const getSwapQuote = () => {
        if (!swapAmount || isNaN(swapAmount) || parseFloat(swapAmount) <= 0) return;
        setIsGettingQuote(true);
        setSwapQuote(null);
        setTimeout(() => {
            const key = `${swapFrom}-${swapTo}`;
            const rate = SWAP_RATES[key] || 1;
            const output = (parseFloat(swapAmount) * rate).toFixed(swapTo === 'cirBTC' ? 8 : 4);
            const fee = (parseFloat(swapAmount) * 0.003).toFixed(4);
            setSwapQuote({ output, rate, fee, from: swapFrom, to: swapTo, input: swapAmount });
            setIsGettingQuote(false);
        }, 900);
    };
    const [isDownloading, setIsDownloading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showDesktopFunding, setShowDesktopFunding] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 1024);

    const handleCopy = (text) => {
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        if (notify) notify("Address Copied!", "success");
    };

    const fetchMainWalletArcBalance = async () => {
        if (!mainWalletAddress) return;
        try {
            const res = await fetch(`${KEEPER_URL_ARC}/balance/${mainWalletAddress}`);
            if (res.ok) {
                const data = await res.json();
                setMainWalletArcBalance(parseFloat(data.balance || 0));
            } else {
                const provider = new ethers.JsonRpcProvider('https://rpc.testnet.arc.io');
                const bal = await provider.getBalance(mainWalletAddress).catch(() => 0n);
                setMainWalletArcBalance(parseFloat(ethers.formatEther(bal)));
            }
        } catch (e) {
            console.error("Failed to fetch main wallet Arc balance:", e);
        }
    };

    useEffect(() => {
        fetchMainWalletArcBalance();
        const interval = setInterval(fetchMainWalletArcBalance, 10000);
        return () => clearInterval(interval);
    }, [mainWalletAddress]);

    const walletOptions = [
        {
            key: 'trading',
            label: 'Trading Wallet',
            bal: parseFloat(sessionBalance || 0),
            address: sessionAddress || walletInfo?.wallet?.address
        },
        {
            key: 'main',
            label: 'Main Wallet',
            bal: mainWalletArcBalance,
            address: mainWalletAddress
        },
        {
            key: 'solana',
            label: 'Solana Wallet',
            bal: multiChainBalances['sol']?.usdc || 0,
            address: wallets?.find(w => w.address && !w.address.startsWith('0x'))?.address || ''
        }
    ].filter(w => (w.key !== 'solana' || w.address));

    const currentWallet = walletOptions[activeWalletIdx];
    const selectedToken = SUPPORTED_TOKENS[activeTokenIdx];

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
        } finally {
            setIsLoading(false);
            setIsRefreshing(false);
        }
    };

    useEffect(() => {
        fetchWalletInfo();
    }, [address]);

    // Extract solana address as a PRIMITIVE dependency to avoid unstable `wallets` reference from Privy
    const solanaAddr = wallets?.find(w => w.address && !w.address.startsWith('0x'))?.address || null;

    const fetchAllBalances = useCallback(async () => {
        if (!fundingSourceAddress) return;
        setIsFetchingBalances(true);
        const newBalances = {};

        // Use solanaAddr extracted outside this callback (stable dependency)
        const _generatedPub = localStorage.getItem(`15market_solana_deposit_pub_${fundingSourceAddress}`);
        const solAddress = solanaAddr || _generatedPub || null;

        const promises = SUPPORTED_TOKENS.map(async (token) => {
            const config = CHAIN_CONFIG[token.id];
            if (!config) return;

            newBalances[token.id] = { native: 0, usdc: 0 };

            try {
                if (config.isEVM) {
                    const provider = new ethers.JsonRpcProvider(config.rpc);

                    // Native
                    const nativeBal = await provider.getBalance(fundingSourceAddress).catch(() => 0n);
                    newBalances[token.id].native = parseFloat(ethers.formatEther(nativeBal));

                    // USDC
                    if (config.usdc && config.usdc !== '0x0000000000000000000000000000000000000000') {
                        const contract = new ethers.Contract(config.usdc, ERC20_ABI, provider);
                        const usdcBal = await contract.balanceOf(fundingSourceAddress).catch(() => 0n);
                        const decimals = await contract.decimals().catch(() => 6);
                        newBalances[token.id].usdc = parseFloat(ethers.formatUnits(usdcBal, decimals));
                    }
                } else if (token.id === 'sol' && solAddress) {
                    // Solana Native
                    const bodyNative = { jsonrpc: "2.0", id: 1, method: "getBalance", params: [solAddress] };
                    const resNative = await fetch(config.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyNative) });
                    const dataNative = await resNative.json();
                    newBalances[token.id].native = (dataNative.result?.value || 0) / 1e9;

                    // Solana USDC
                    const bodyUsdc = { jsonrpc: "2.0", id: 1, method: "getTokenAccountsByOwner", params: [solAddress, { mint: config.usdc }, { encoding: "jsonParsed" }] };
                    const resUsdc = await fetch(config.rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyUsdc) });
                    const dataUsdc = await resUsdc.json();
                    newBalances[token.id].usdc = dataUsdc.result?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
                }
            } catch (e) {
                console.warn(`Failed to fetch balance for ${token.id}`, e);
            }
        });

        await Promise.allSettled(promises);
        setMultiChainBalances(newBalances);
        setIsFetchingBalances(false);
    }, [fundingSourceAddress, solanaAddr, generatedSolWalletPub]);

    useEffect(() => {
        if (fundingSourceAddress) {
            fetchAllBalances();
        }
    }, [fundingSourceAddress, fetchAllBalances]);

    useEffect(() => {
        // [ignoring loop detection]
        let receiveAddr = '';
        if (currentWallet.key === 'trading') {
            receiveAddr = sessionAddress || walletInfo?.wallet?.address || '';
        } else if (currentWallet.key === 'main') {
            receiveAddr = mainWalletAddress || address || '';
        } else {
            receiveAddr = currentWallet.address || '';
        }

        if (receiveAddr && showReceiveModal) {
            try {
                const qr = QRCode.create(receiveAddr, { errorCorrectionLevel: 'H' });
                const { size } = qr.modules;

                const canvas = document.createElement('canvas');
                const scale = 4; // High-res export
                const padding = 28;
                const cellSize = 12;
                const qrSize = size * cellSize;
                const totalSize = qrSize + padding * 2;

                canvas.width = totalSize * scale;
                canvas.height = totalSize * scale;
                const ctx = canvas.getContext('2d');
                ctx.scale(scale, scale);

                // Rounded Rect Helper
                const drawRoundRect = (x, y, w, h, r) => {
                    ctx.beginPath();
                    if (ctx.roundRect) {
                        ctx.roundRect(x, y, w, h, r);
                    } else {
                        ctx.moveTo(x + r, y);
                        ctx.lineTo(x + w - r, y);
                        ctx.arcTo(x + w, y, x + w, y + r, r);
                        ctx.lineTo(x + w, y + h - r);
                        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
                        ctx.lineTo(x + r, y + h);
                        ctx.arcTo(x, y + h, x, y + h - r, r);
                        ctx.lineTo(x, y + r);
                        ctx.arcTo(x, y, x + r, y, r);
                        ctx.closePath();
                    }
                };

                // Clear/draw white rounded QR container background
                ctx.fillStyle = '#FFFFFF';
                drawRoundRect(0, 0, totalSize, totalSize, 28);
                ctx.fill();

                // Helper to check if pixel is dark
                const isDark = (r, c) => {
                    if (r < 0 || r >= size || c < 0 || c >= size) return false;
                    return qr.modules.get(r, c) === 1;
                };

                // Check if index is in the 7x7 corner finder areas
                const isFinder = (r, c) => {
                    if (r < 7 && c < 7) return true; // Top-Left
                    if (r < 7 && c >= size - 7) return true; // Top-Right
                    if (r >= size - 7 && c < 7) return true; // Bottom-Left
                    return false;
                };

                // Center logo clearing (5x5 modules in center)
                const cStart = Math.floor(size / 2) - 2;
                const cEnd = Math.floor(size / 2) + 2;
                const isCenter = (r, c) => {
                    return r >= cStart && r <= cEnd && c >= cStart && c <= cEnd;
                };

                // Draw Custom Leaf/Teardrop Eye Outer & Inner Finder
                const drawLeafEye = (startX, startY, corner) => {
                    const eyeSize = 7 * cellSize;
                    const r = eyeSize * 0.45;

                    // 1. Draw Outer Eye (Green)
                    ctx.fillStyle = '#1A6140';
                    ctx.beginPath();
                    if (corner === 'tl') ctx.moveTo(startX, startY);
                    else ctx.moveTo(startX + r, startY);

                    if (corner === 'tr') ctx.lineTo(startX + eyeSize, startY);
                    else {
                        ctx.lineTo(startX + eyeSize - r, startY);
                        ctx.arcTo(startX + eyeSize, startY, startX + eyeSize, startY + r, r);
                    }

                    ctx.lineTo(startX + eyeSize, startY + eyeSize - r);
                    ctx.arcTo(startX + eyeSize, startY + eyeSize, startX + eyeSize - r, startY + eyeSize, r);

                    if (corner === 'bl') ctx.lineTo(startX, startY + eyeSize);
                    else {
                        ctx.lineTo(startX + r, startY + eyeSize);
                        ctx.arcTo(startX, startY + eyeSize, startX, startY + eyeSize - r, r);
                    }

                    if (corner === 'tl') ctx.lineTo(startX, startY);
                    else {
                        ctx.lineTo(startX, startY + r);
                        ctx.arcTo(startX, startY, startX + r, startY, r);
                    }
                    ctx.closePath();
                    ctx.fill();

                    // 2. Clear Inner Frame
                    ctx.fillStyle = '#FFFFFF';
                    const gap = cellSize;
                    const innerSize = 5 * cellSize;
                    const ir = innerSize * 0.45;
                    ctx.beginPath();

                    if (corner === 'tl') ctx.moveTo(startX + gap, startY + gap);
                    else ctx.moveTo(startX + gap + ir, startY + gap);

                    if (corner === 'tr') ctx.lineTo(startX + gap + innerSize, startY + gap);
                    else {
                        ctx.lineTo(startX + gap + innerSize - ir, startY + gap);
                        ctx.arcTo(startX + gap + innerSize, startY + gap, startX + gap + innerSize, startY + gap + ir, ir);
                    }

                    ctx.lineTo(startX + gap + innerSize, startY + gap + innerSize - ir);
                    ctx.arcTo(startX + gap + innerSize, startY + gap + innerSize, startX + gap + innerSize - ir, startY + gap + innerSize, ir);

                    if (corner === 'bl') ctx.lineTo(startX + gap, startY + gap + innerSize);
                    else {
                        ctx.lineTo(startX + gap + ir, startY + gap + innerSize);
                        ctx.arcTo(startX + gap, startY + gap + innerSize, startX + gap, startY + gap + innerSize - ir, ir);
                    }

                    if (corner === 'tl') ctx.lineTo(startX + gap, startY + gap);
                    else {
                        ctx.lineTo(startX + gap, startY + gap + ir);
                        ctx.arcTo(startX + gap, startY + gap, startX + gap + ir, startY + gap, ir);
                    }
                    ctx.closePath();
                    ctx.fill();

                    // 3. Draw Center Bullet (Black, Rounded Rect)
                    ctx.fillStyle = '#0F0F0F';
                    drawRoundRect(startX + cellSize * 2, startY + cellSize * 2, cellSize * 3, cellSize * 3, cellSize * 0.9);
                    ctx.fill();
                };

                // Draw Finder eyes
                drawLeafEye(padding, padding, 'tl');
                drawLeafEye(padding + (size - 7) * cellSize, padding, 'tr');
                drawLeafEye(padding, padding + (size - 7) * cellSize, 'bl');

                // Draw Body Cells
                ctx.fillStyle = '#0F0F0F';
                for (let r = 0; r < size; r++) {
                    for (let c = 0; c < size; c++) {
                        if (isFinder(r, c) || isCenter(r, c)) continue;

                        if (isDark(r, c)) {
                            const x = padding + c * cellSize;
                            const y = padding + r * cellSize;

                            // Neighbors
                            const T = isDark(r - 1, c);
                            const B = isDark(r + 1, c);
                            const L = isDark(r, c - 1);
                            const R = isDark(r, c + 1);

                            // Smooth corner rounding algorithm
                            const rad = cellSize / 2;
                            const tl = (!T && !L) ? rad : 0;
                            const tr = (!T && !R) ? rad : 0;
                            const br = (!B && !R) ? rad : 0;
                            const bl = (!B && !L) ? rad : 0;

                            ctx.beginPath();
                            ctx.moveTo(x + tl, y);
                            ctx.lineTo(x + cellSize - tr, y);
                            ctx.arcTo(x + cellSize, y, x + cellSize, y + tr, tr);
                            ctx.lineTo(x + cellSize, y + cellSize - br);
                            ctx.arcTo(x + cellSize, y + cellSize, x + cellSize - br, y + cellSize, br);
                            ctx.lineTo(x + bl, y + cellSize);
                            ctx.arcTo(x, y + cellSize, x, y + cellSize - bl, bl);
                            ctx.lineTo(x, y + tl);
                            ctx.arcTo(x, y, x + tl, y, tl);
                            ctx.closePath();
                            ctx.fill();
                        }
                    }
                }

                // Load Logo image into the center
                const logo = new Image();
                logo.onload = () => {
                    // Increased logo size by another 150% (height increased from 52 to 78)
                    const logoH = 78;
                    const logoW = (logo.naturalWidth / logo.naturalHeight) * logoH;

                    // Center Coordinates
                    const midX = padding + qrSize / 2;
                    const midY = padding + qrSize / 2;

                    // Dynamically sized rounded white backdrop badge for the logo
                    const badgeW = logoW + 28;
                    const badgeH = logoH + 20;
                    ctx.fillStyle = '#FFFFFF';
                    drawRoundRect(midX - badgeW / 2, midY - badgeH / 2, badgeW, badgeH, 16);
                    ctx.fill();

                    // Draw Logo Image
                    ctx.drawImage(
                        logo,
                        midX - logoW / 2,
                        midY - logoH / 2,
                        logoW,
                        logoH
                    );

                    // Output Base64 Image
                    setQrCodeData(canvas.toDataURL('image/png'));
                };

                logo.onerror = () => {
                    // Fallback to text logo if image fails to load
                    const logoH = 78;
                    const logoW = 180; // safe fallback width for text

                    const midX = padding + qrSize / 2;
                    const midY = padding + qrSize / 2;

                    const badgeW = logoW + 28;
                    const badgeH = logoH + 20;

                    ctx.fillStyle = '#FFFFFF';
                    drawRoundRect(midX - badgeW / 2, midY - badgeH / 2, badgeW, badgeH, 16);
                    ctx.fill();

                    // Beautiful styled brand text (150% larger)
                    ctx.font = 'bold 26px "Inter", sans-serif';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    
                    // "15" in green, "market" in black
                    ctx.fillStyle = '#1A6140';
                    ctx.fillText('15', midX - 32, midY);
                    ctx.fillStyle = '#0F0F0F';
                    ctx.fillText('market', midX + 24, midY);

                    setQrCodeData(canvas.toDataURL('image/png'));
                };

                // Use the dark logo since background is pure white
                logo.src = '/goblogo.png';
            } catch (err) {
                console.error('Failed to generate premium styled QR:', err);
            }
        }
    }, [walletInfo, showReceiveModal, currentWallet, address, sessionAddress, mainWalletAddress]);

    const handleDownloadQR = async () => {
        if (!qrCodeData) return;
        setIsDownloading(true);
        try {
            const W = 600;
            const H = 840;
            const SCALE = 2; // Retina quality export
            
            const canvas = document.createElement('canvas');
            canvas.width = W * SCALE;
            canvas.height = H * SCALE;
            const ctx = canvas.getContext('2d');
            ctx.scale(SCALE, SCALE);

            // Rounded rectangle helper
            const drawRoundRect = (x, y, w, h, r) => {
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(x, y, w, h, r);
                } else {
                    ctx.moveTo(x + r, y);
                    ctx.lineTo(x + w - r, y);
                    ctx.arcTo(x + w, y, x + w, y + r, r);
                    ctx.lineTo(x + w, y + h - r);
                    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
                    ctx.lineTo(x + r, y + h);
                    ctx.arcTo(x, y + h, x, y + h - r, r);
                    ctx.lineTo(x, y + r);
                    ctx.arcTo(x, y, x + r, y, r);
                    ctx.closePath();
                }
            };

            // ── BACKGROUND (PURE WHITE) ───────────────────────────
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, W, H);

            // ── PREMIUM GEOMETRIC GREEN MARGIN ART (Vividly styled left/right framing) ────
            const greens = [
                'rgba(26, 97, 64, 0.08)',  // light green
                'rgba(26, 97, 64, 0.16)',  // medium vivid green
                'rgba(18, 63, 40, 0.12)',   // deep sage green
                'rgba(140, 176, 157, 0.25)', // pale pastel green
                'rgba(26, 97, 64, 0.35)'   // bold branding green
            ];

            // --- LEFT MARGIN ART WORK ---
            // Bold vertical block on left edge
            ctx.fillStyle = greens[3];
            drawRoundRect(-20, 40, 70, 360, 20);
            ctx.fill();

            // Intersecting deep green bar
            ctx.fillStyle = greens[2];
            ctx.save();
            ctx.rotate(-8 * Math.PI / 180);
            ctx.fillRect(-10, 160, 90, 180);
            ctx.restore();

            // Horizontal stripe patterns crossing left edge
            ctx.strokeStyle = 'rgba(26, 97, 64, 0.28)';
            ctx.lineWidth = 3;
            const drawLeftParallel = (x, y, count, length, spacing) => {
                ctx.beginPath();
                for (let i = 0; i < count; i++) {
                    ctx.moveTo(x, y + i * spacing);
                    ctx.lineTo(x + length, y + i * spacing);
                }
                ctx.stroke();
            };
            drawLeftParallel(0, 100, 6, 80, 8);
            drawLeftParallel(0, 520, 8, 90, 7);

            // Bold dot grid on left edge
            ctx.fillStyle = greens[4];
            const drawDotGrid = (xStart, yStart, rows, cols, spacing) => {
                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        ctx.beginPath();
                        ctx.arc(xStart + c * spacing, yStart + r * spacing, 2.5, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
            };
            drawDotGrid(15, 340, 8, 4, 12);
            drawDotGrid(20, 680, 6, 5, 10);

            // --- RIGHT MARGIN ART WORK ---
            // Tilted bold green panel in top right
            ctx.fillStyle = greens[1];
            ctx.save();
            ctx.rotate(12 * Math.PI / 180);
            ctx.fillRect(490, -180, 120, 300);
            ctx.restore();

            // Sage vertical capsule along right edge
            ctx.fillStyle = greens[2];
            drawRoundRect(W - 45, 320, 60, 280, 16);
            ctx.fill();

            // Pastel accent rectangle in bottom right
            ctx.fillStyle = greens[3];
            ctx.save();
            ctx.rotate(-15 * Math.PI / 180);
            ctx.fillRect(W - 120, 720, 160, 140);
            ctx.restore();

            // Parallel stripes crossing right edge
            ctx.strokeStyle = 'rgba(26, 97, 64, 0.32)';
            ctx.lineWidth = 3;
            const drawRightParallel = (x, y, count, length, spacing) => {
                ctx.beginPath();
                for (let i = 0; i < count; i++) {
                    ctx.moveTo(x, y + i * spacing);
                    ctx.lineTo(x + length, y + i * spacing);
                }
                ctx.stroke();
            };
            drawRightParallel(W - 70, 220, 5, 70, 9);
            drawRightParallel(W - 80, 610, 6, 80, 8);

            // Dot grid on right edge
            drawDotGrid(W - 60, 120, 5, 4, 12);
            drawDotGrid(W - 70, 480, 7, 5, 11);

            // ── GENERAL BACKGROUND FILL (Soft diagonal lines behind QR) ──
            ctx.strokeStyle = 'rgba(26, 97, 64, 0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            for (let i = 0; i < W; i += 24) {
                ctx.moveTo(i, 0);
                ctx.lineTo(i + H, H);
            }
            ctx.stroke();

            // ── HEADER SECTION (LOGO) ──────────────────────────────
            const logoImg = new Image();
            await new Promise((res, rej) => {
                logoImg.onload = res;
                logoImg.onerror = rej;
                logoImg.src = '/goblogo.png'; // Authority dark logo for white page card
            });
            const logoH = 54;
            const logoW = (logoImg.naturalWidth / logoImg.naturalHeight) * logoH;
            ctx.drawImage(logoImg, (W - logoW) / 2, 54, logoW, logoH);

            // Subtle divider line
            ctx.strokeStyle = 'rgba(26, 97, 64, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(60, 134); ctx.lineTo(W - 60, 134); ctx.stroke();

            // ── QR CODE DISPLAY ───────────────────────────────────
            const qrImg = new Image();
            await new Promise(res => { qrImg.onload = res; qrImg.src = qrCodeData; });

            const qrSize = 340;
            const qrX = (W - qrSize) / 2;
            const qrY = 166;
            const qrR = 24;

            // Rounded container with a soft glowing green border/shadow for QR
            ctx.strokeStyle = 'rgba(26, 97, 64, 0.20)';
            ctx.lineWidth = 3;
            drawRoundRect(qrX - 4, qrY - 4, qrSize + 8, qrSize + 8, qrR + 2);
            ctx.stroke();

            // Draw QR code clipped to rounded rectangle
            ctx.save();
            drawRoundRect(qrX, qrY, qrSize, qrSize, qrR);
            ctx.clip();
            ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
            ctx.restore();

            // ── WALLET ADDRESS ────────────────────────────────────
            const addrLabelY = qrY + qrSize + 46;
            ctx.fillStyle = 'rgba(15, 15, 15, 0.45)';
            ctx.font = 'bold 10px "Courier New", monospace';
            ctx.textAlign = 'center';
            ctx.fillText('DEPOSIT ADDRESS (' + currentWallet.label.toUpperCase() + ')', W / 2, addrLabelY);

            const addr = currentWallet.key === 'trading'
                ? (sessionAddress || walletInfo?.wallet?.address || '')
                : (mainWalletAddress || address || '');

            ctx.fillStyle = '#0F0F0F';
            ctx.font = 'bold 12px "Courier New", monospace';
            const chunk = 36;
            const addrLines = [];
            for (let i = 0; i < addr.length; i += chunk) addrLines.push(addr.slice(i, i + chunk));
            addrLines.forEach((line, i) => ctx.fillText(line, W / 2, addrLabelY + 20 + i * 16));

            // ── WEBSITE URL IN ITALICS ────────────────────────────
            const footerY = H - 64;
            ctx.strokeStyle = 'rgba(26, 97, 64, 0.15)';
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(60, footerY); ctx.lineTo(W - 60, footerY); ctx.stroke();

            ctx.fillStyle = '#1A6140';
            ctx.font = 'italic bold 13px "Courier New", monospace';
            ctx.fillText('15market.com', W / 2, footerY + 26);

            // ── EXPORT AND TRIGGER DOWNLOAD ────────────────────────
            canvas.toBlob(blob => {
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.download = `15market-qr-${currentWallet.key}.png`;
                link.href = url;
                link.click();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }, 'image/png');

            notify("QR Card Saved!", "success");
        } catch (err) {
            console.error('Branded card export error:', err);
            notify("Failed to save image", "error");
        } finally {
            setIsDownloading(false);
        }
    };

    const handleSend = async () => {
        if (!destAddress || !sendAmount) {
            notify("Please fill in all fields", "error");
            return;
        }

        const amt = parseFloat(sendAmount);
        if (isNaN(amt) || amt <= 0) {
            notify("Invalid amount", "error");
            return;
        }

        setIsSending(true);
        try {
            if (currentWallet.key === 'trading') {
                if (!onWithdraw) throw new Error("Withdrawal function not available");
                await onWithdraw(amt, destAddress);
                setShowSendModal(false);
                setSendAmount("");
                setDestAddress("");
            } else if (currentWallet.key === 'main') {
                const eoaWallet = wallets?.find(w => w.walletClientType === 'privy') || wallets?.[0];
                if (!eoaWallet) throw new Error("No connected wallet found");

                notify("Preparing transfer...", "pending");

                let txHash;

                if (selectedToken.id === 'sol') {
                    const { Connection, PublicKey: PK, Transaction } = await import('@solana/web3.js');
                    const { getAssociatedTokenAddress: getATA, createTransferInstruction: createTransfer } = await import('@solana/spl-token');

                    const connection = new Connection(CHAIN_CONFIG['sol'].rpc, 'confirmed');
                    const usdcMint = new PK(CHAIN_CONFIG['sol'].usdc);
                    const fromPubkey = new PK(eoaWallet.address);
                    const toPubkey = new PK(destAddress);

                    const fromAta = await getATA(usdcMint, fromPubkey);
                    const toAta = await getATA(usdcMint, toPubkey);

                    const { blockhash } = await connection.getLatestBlockhash();
                    const tx = new Transaction({ recentBlockhash: blockhash, feePayer: fromPubkey });

                    tx.add(createTransfer(fromAta, toAta, fromPubkey, Math.round(amt * 1_000_000)));

                    if (eoaWallet.sendTransaction) {
                        txHash = await eoaWallet.sendTransaction(tx, connection);
                    } else {
                        throw new Error("Direct Solana transfers not supported by this connector yet.");
                    }
                } else {
                    // The 'main' wallet card displays mainWalletArcBalance, which is Native USDC on Arc Testnet.
                    // Therefore, we must switch to Arc Testnet and perform a native currency transfer.
                    const ARC_TESTNET_CHAIN_ID = 5042002;
                    const ARC_RPC = 'https://rpc.testnet.arc.io';
                    
                    // Switch chain on the Privy wallet FIRST — with timeout to prevent page freeze
                    try {
                        const switchPromise = eoaWallet.switchChain(ARC_TESTNET_CHAIN_ID);
                        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000));
                        await Promise.race([switchPromise, timeout]);
                    } catch (switchErr) {
                        console.warn('Chain switch warning (Arc):', switchErr);
                    }

                    // Get provider AFTER chain switch
                    const ethProvider = await eoaWallet.getEthereumProvider();
                    const provider = new ethers.BrowserProvider(ethProvider, 'any');
                    const signer = await provider.getSigner();
                    const signerAddress = await signer.getAddress();

                    // Pre-check balance on Arc Testnet directly via independent RPC
                    const readProvider = new ethers.JsonRpcProvider(ARC_RPC);
                    const userBal = await readProvider.getBalance(signerAddress).catch(() => 0n);
                    const val = ethers.parseEther(amt.toString());
                    
                    // We check if they have enough for the amount + a small buffer for gas
                    // Native transfers cost 21000 gas * gas price
                    if (userBal < val) {
                        throw new Error(`Insufficient Arc USDC balance. You have ${ethers.formatEther(userBal)} USDC on Arc Testnet. Wallet: ${signerAddress.slice(0,8)}...`);
                    }

                    notify("Confirm transfer in your wallet...", "pending");

                    // Send Native transaction (USDC is native on Arc Testnet)
                    // We hardcode gasLimit to 21000 to bypass eth_estimateGas which often throws "missing revert data" on new testnets
                    const tx = await signer.sendTransaction({
                        to: destAddress,
                        value: val,
                        chainId: ARC_TESTNET_CHAIN_ID,
                        gasLimit: 21000n
                    });
                    txHash = tx.hash;
                }

                if (txHash) {
                    notify("Transfer Success!", "success");
                    setShowSendModal(false);
                    setSendAmount("");
                    setDestAddress("");
                }
            }
        } catch (err) {
            notify(err.message, "error");
        } finally {
            setIsSending(false);
        }
    };

    const handleSwipeWallet = (direction) => {
        // Record which way the 3D card flip should rotate
        flipDirRef.current = direction === 'left' ? -1 : 1;
        if (direction === 'left') {
            setActiveWalletIdx(prev => (prev + 1) % walletOptions.length);
        } else if (direction === 'right') {
            setActiveWalletIdx(prev => (prev - 1 + walletOptions.length) % walletOptions.length);
        }
    };

    const handleSwipeToken = (direction) => {
        if (direction === 'left') {
            setActiveTokenIdx(prev => (prev + 1) % SUPPORTED_TOKENS.length);
        } else if (direction === 'right') {
            setActiveTokenIdx(prev => (prev - 1 + SUPPORTED_TOKENS.length) % SUPPORTED_TOKENS.length);
        }
    };

    // Helper: add a timestamped entry to the CCTP live log
    const addCctpLog = (msg) => {
        const now = new Date();
        const ts = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        setCctpLogs(prev => [...prev, `[${ts}] ${msg}`]);
    };

    const startFundingFlow = () => {
        setFundingStep('loading');
        setTimeout(() => {
            setFundingStep('input');
        }, 3000);
    };

    const handleConfirmFunding = async () => {
        if (!fundingAmount || parseFloat(fundingAmount) <= 0) return;

        setFundingStep('confirming');
        setCctpStep(0);
        setCctpLogs([]);

        try {
            const amount = parseFloat(fundingAmount);
            let txHash = "";
            let isCCTP = false;

            if (selectedToken.id === 'sol') {
                const generatedSolWalletPub = localStorage.getItem(`15market_solana_deposit_pub_${fundingSourceAddress}`);
                const solWallet = wallets?.find(w => w.address && !w.address.startsWith('0x'));

                if (!solWallet && !generatedSolWalletPub) throw new Error('No Solana wallet found. Please generate or link one first.');

                if (fundingType !== 'usdc') {
                    throw new Error('Native SOL deposits to Arc are not supported yet. Please use USDC.');
                }

                addCctpLog('Preparing Solana USDC transfer...');

                const { Connection, PublicKey: PK, Transaction } = await import('@solana/web3.js');
                const { getAssociatedTokenAddress: getATA, createTransferInstruction: createTransfer } = await import('@solana/spl-token');

                const connection = new Connection(CHAIN_CONFIG['sol'].rpc, 'confirmed');
                const usdcMint = new PK(CHAIN_CONFIG['sol'].usdc);

                let fromPubkey;

                if (solWallet) {
                    fromPubkey = new PK(solWallet.address);
                } else {
                    fromPubkey = new PK(generatedSolWalletPub);
                }

                // The backend relayer's Solana address — receives USDC from user
                addCctpLog('Fetching Solana relayer configuration...');
                const configRes = await fetch(`${KEEPER_URL_ARC}/solana/config`);
                if (!configRes.ok) throw new Error("Failed to fetch Solana relayer address");
                const configData = await configRes.json();
                const RELAYER_SOL_ADDR = configData.relayerAddress;
                
                const toPubkey = new PK(RELAYER_SOL_ADDR);

                // Check user balance
                const fromAta = await getATA(usdcMint, fromPubkey);
                const tokenInfo = await connection.getTokenAccountBalance(fromAta).catch(() => null);
                const userBal = tokenInfo ? parseFloat(tokenInfo.value.uiAmount) : 0;
                if (userBal < amount) {
                    throw new Error(`Insufficient USDC. Wallet has ${userBal.toFixed(2)} USDC on Solana Devnet.`);
                }

                addCctpLog(`Wallet balance: ${userBal.toFixed(2)} USDC`);

                let signedTxBase64 = null;

                if (solWallet) {
                    addCctpLog('Building transfer transaction...');
                    const toAta = await getATA(usdcMint, toPubkey);
                    const { blockhash } = await connection.getLatestBlockhash();

                    const tx = new Transaction({
                        recentBlockhash: blockhash,
                        feePayer: toPubkey
                    });

                    // Check if relayer ATA exists, if not prepend create instruction
                    const toAtaInfo = await connection.getAccountInfo(toAta);
                    if (!toAtaInfo) {
                        const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
                        tx.add(createAssociatedTokenAccountInstruction(
                            toPubkey, // payer
                            toAta,
                            toPubkey, // owner
                            usdcMint
                        ));
                    }

                    tx.add(createTransfer(
                        fromAta,
                        toAta,
                        fromPubkey,
                        Math.round(amount * 1_000_000) // 6 decimals
                    ));

                    addCctpLog('Awaiting wallet signature...');
                    try {
                        const signedTx = await solWallet.signTransaction(tx);
                        // signedTx is returned as a Transaction object or serialized buffer
                        const serialized = typeof signedTx.serialize === 'function' 
                            ? signedTx.serialize({ requireAllSignatures: false }) 
                            : signedTx;
                        signedTxBase64 = Buffer.from(serialized).toString('base64');
                    } catch (err) {
                        throw new Error('Wallet signing rejected: ' + (err.message || err));
                    }
                } else {
                    addCctpLog('Initiating secure backend-signed transfer...');
                }

                addCctpLog('Broadcasting transaction via gas relayer...');
                const fundRes = await fetch(`${KEEPER_URL_ARC}/solana/fund`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        address: fundingSourceAddress, 
                        signedTxBase64, 
                        amount: amount.toString(),
                        fromAddress: fromPubkey.toString()
                    })
                });
                
                const fundData = await fundRes.json();
                if (!fundRes.ok || !fundData.success) {
                    throw new Error(fundData.error || 'Failed to process Solana deposit');
                }

                addCctpLog(`✅ Transaction confirmed: ${(fundData.txSignature || '').slice(0, 8)}...`);
                addCctpLog(`✅ Arc balance credited: +${amount} USDC`);
                isCCTP = true;
                
            } else {
                // EVM LOGIC
                // Source chain config
                const targetChainId = selectedToken.chainId ||
                    (selectedToken.id === 'mon' ? 10143 :
                        selectedToken.id === 'eth' ? 11155111 :
                            selectedToken.id === 'base' ? 84532 :
                                selectedToken.id === 'op' ? 11155420 : 43113);

                // ── Read-only provider for balance/allowance/receipt checks ──────────
                const readRpc = CHAIN_CONFIG[selectedToken.id]?.rpc || 'https://testnet-rpc.monad.xyz/';
                const readProvider = new ethers.JsonRpcProvider(readRpc);

                // ── Effective signing address: smart wallet > EOA ────────────────────
                const signingAddress = fundingSourceAddress;
                if (!signingAddress) throw new Error('No wallet connected. Please log in.');

                if (fundingType === 'usdc') {
                    const usdcAddr = CHAIN_CONFIG[selectedToken.id]?.usdc;

                    if (!usdcAddr) {
                        throw new Error(`USDC not configured for ${selectedToken.name}`);
                    }

                    const recipientAddr = sessionAddress || address;
                    if (!recipientAddr) throw new Error('Session wallet address not available');

                    const tokenMessengerAddr = CCTP_TOKEN_MESSENGER[selectedToken.id];
                    const usdcReadContract = new ethers.Contract(usdcAddr, ERC20_ABI, readProvider);

                    const decimals = await usdcReadContract.decimals().catch(() => 6);
                    let val = ethers.parseUnits(amount.toString(), decimals);
                let approveVal = val;
                let burnVal = val;

                // Only use ERC-4337 smart wallet on chains with Pimlico paymaster configured on Privy dashboard.
                // Monad Testnet has no paymaster — fall back to EOA signer path.
                const chainPaymasterSupported = CHAIN_CONFIG[selectedToken.id]?.paymasterSupported !== false;
                const isSmartWallet = signingAddress === smartWalletAddress && chainPaymasterSupported;

                if (isSmartWallet) {
                    addCctpLog("Estimating CCTP transaction gas fees in USDC...");

                    const nativeSymbol = selectedToken.symbol || 'MON';

                    // Helper to estimate gas fee in USDC
                    const estimateStepGasUsdc = async (txData, toAddress) => {
                        try {
                            const gasEstimate = await readProvider.estimateGas({
                                to: toAddress,
                                data: txData,
                                from: signingAddress
                            }).catch(() => 150000n);

                            const feeData = await readProvider.getFeeData();
                            const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 25000000000n;
                            const nativeFee = gasEstimate * gasPrice;
                            const nativeFeeEth = parseFloat(ethers.formatEther(nativeFee));

                            const prices = { 'ETH': 3500, 'AVAX': 35, 'MON': 2.5, 'SOL': 150 };
                            const price = prices[nativeSymbol.toUpperCase()] || 1.0;
                            return nativeFeeEth * price * 1.3; // 1.3x buffer for paymaster markups
                        } catch (e) {
                            return 0.1; // fallback
                        }
                    };

                    // 1. Estimate Approve Gas
                    const tokenMessengerAddr = CCTP_TOKEN_MESSENGER[selectedToken.id];
                    const approveDataEst = new ethers.Interface([
                        'function approve(address spender, uint256 amount) returns (bool)'
                    ]).encodeFunctionData('approve', [tokenMessengerAddr, val]);
                    const approveGasUsdc = await estimateStepGasUsdc(approveDataEst, usdcAddr);
                    addCctpLog(`Approve gas estimated: ${approveGasUsdc.toFixed(4)} USDC`);

                    // 2. Estimate Burn Gas
                    const recipientBytes32 = ethers.zeroPadValue(recipientAddr, 32);
                    const BYTES32_ZERO = "0x0000000000000000000000000000000000000000000000000000000000000000";
                    const burnDataEst = new ethers.Interface(TOKEN_MESSENGER_ABI)
                        .encodeFunctionData('depositForBurn', [
                            val,
                            26, // Arc Testnet destination domain
                            recipientBytes32,
                            usdcAddr,
                            BYTES32_ZERO, // hookData
                            0n, // maxFee
                            2000 // standard finalityThreshold
                        ]);
                    const burnGasUsdc = await estimateStepGasUsdc(burnDataEst, tokenMessengerAddr);
                    addCctpLog(`Burn gas estimated: ${burnGasUsdc.toFixed(4)} USDC`);

                    // 3. Estimate Mint Gas on Arc Testnet
                    const mintGasUsdc = await (async () => {
                        try {
                            const destReadProvider = new ethers.JsonRpcProvider('https://rpc.testnet.arc.io');
                            const transmitterInterface = new ethers.Interface([
                                'function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool)'
                            ]);
                            const dummyData = transmitterInterface.encodeFunctionData('receiveMessage', [
                                "0x" + "00".repeat(300),
                                "0x" + "00".repeat(65)
                            ]);
                            const gasEstimate = await destReadProvider.estimateGas({
                                to: ARC_TESTNET_TRANSMITTER,
                                data: dummyData,
                                from: signingAddress
                            }).catch(() => 200000n);
                            const feeData = await destReadProvider.getFeeData();
                            const gasPrice = feeData.maxFeePerGas || feeData.gasPrice || 25000000000n;
                            const feeWei = gasEstimate * gasPrice;
                            return parseFloat(ethers.formatEther(feeWei)) * 1.3;
                        } catch (e) {
                            return 0.1;
                        }
                    })();
                    addCctpLog(`Mint gas estimated: ${mintGasUsdc.toFixed(4)} USDC`);

                    const totalGasUsdc = approveGasUsdc + burnGasUsdc + mintGasUsdc;
                    addCctpLog(`Total estimated gas for all stages: ${totalGasUsdc.toFixed(4)} USDC`);

                    if (amount <= totalGasUsdc) {
                        throw new Error(`Transfer amount is too small to cover CCTP gas fees. Estimated gas required is ${totalGasUsdc.toFixed(4)} USDC.`);
                    }

                    // Calculate adjusted values to subtract gas fees from the amount being sent
                    const burnAmountAdjusted = amount - approveGasUsdc - burnGasUsdc;
                    burnVal = ethers.parseUnits(burnAmountAdjusted.toFixed(decimals), decimals);
                    approveVal = burnVal;

                    addCctpLog(`Adjusting transfer: sending ${amount} USDC, burning ${burnAmountAdjusted.toFixed(4)} USDC (${(approveGasUsdc + burnGasUsdc).toFixed(4)} USDC deducted for source-chain gas)`);
                }

                // Check smart wallet USDC balance on the source chain
                const userBal = await usdcReadContract.balanceOf(signingAddress).catch(() => 0n);
                if (userBal < val) {
                    throw new Error(`Insufficient USDC balance. Wallet has ${ethers.formatUnits(userBal, decimals)} ${selectedToken.symbol} USDC on ${selectedToken.name}. Please fund address: ${signingAddress.slice(0,10)}...`);
                }

                // ── Transaction Sender Abstraction ──────────────────────────────────
                let sendTx;

                if (isSmartWallet) {
                    if (!smartWalletClient) throw new Error("Smart wallet client not initialized");
                    if (smartWalletClient.switchChain) {
                        await smartWalletClient.switchChain({ id: targetChainId });
                    }
                    sendTx = async (txParams, options) => {
                        // Inject paymasterContext to pay gas with USDC via Pimlico
                        const requestParams = {
                            ...txParams,
                            paymasterContext: { token: usdcAddr }
                        };
                        return await smartWalletClient.sendTransaction(requestParams, options);
                    };
                } else {
                    // EOA path — Privy embedded wallet signs directly (no paymaster/ERC-4337).
                    // For Monad (paymasterSupported:false), we must look up the Privy EOA wallet
                    // by walletClientType, NOT by address (signingAddress may be smart wallet addr).
                    const eoaWallet = wallets?.find(w => w.walletClientType === 'privy')
                        || wallets?.find(w => w.address?.toLowerCase() === signingAddress?.toLowerCase());
                    if (!eoaWallet) throw new Error('Wallet not found. Please reconnect.');

                    sendTx = async (txParams) => {
                        await eoaWallet.switchChain(targetChainId);
                        const ethProvider = await eoaWallet.getEthereumProvider();
                        const provider = new ethers.BrowserProvider(ethProvider, 'any');
                        const signer = await provider.getSigner();
                        const tx = await signer.sendTransaction({
                            to: txParams.to,
                            data: txParams.data,
                            value: txParams.value !== undefined ? txParams.value : 0n
                        });
                        return tx.hash;
                    };
                }

                if (tokenMessengerAddr) {
                    isCCTP = true;

                    const cctpCfg = {
                        id: selectedToken.id,
                        name: selectedToken.name,
                        chainId: targetChainId,
                        usdc: usdcAddr
                    };

                    const eoaWallet = wallets?.find(w => w.walletClientType === 'privy')
                        || wallets?.find(w => w.address?.toLowerCase() === address?.toLowerCase());
                    if (!eoaWallet) throw new Error('No EOA wallet found. Please reconnect.');

                    addCctpLog(`Switching wallet to ${cctpCfg.name}...`);
                    await eoaWallet.switchChain(cctpCfg.chainId);

                    const ethProvider = await eoaWallet.getEthereumProvider();
                    const provider = new ethers.BrowserProvider(ethProvider, 'any');
                    const signer = await provider.getSigner();
                    const signingAddress = await signer.getAddress();

                    addCctpLog(`Fetching Gas Tank permit quote...`);
                    const quoteRes = await fetch(`${KEEPER_URL_ARC}/fund/bridge-quote?sourceChain=${cctpCfg.id}&amount=${amount}`);
                    const quoteData = await quoteRes.json();
                    if (!quoteData.success) {
                        throw new Error(quoteData.error || "Failed to fetch permit quote");
                    }

                    const usdcReadContract = new ethers.Contract(cctpCfg.usdc, [
                        'function nonces(address owner) view returns (uint256)',
                        'function decimals() view returns (uint8)',
                        'function balanceOf(address owner) view returns (uint256)'
                    ], readProvider);

                    const decimals = await usdcReadContract.decimals().catch(() => 6);
                    const val = ethers.parseUnits(amount.toString(), decimals);
                    const userBal = await usdcReadContract.balanceOf(signingAddress).catch(() => 0n);
                    if (userBal < val) {
                        throw new Error(`Insufficient USDC balance. You have ${ethers.formatUnits(userBal, decimals)} USDC on ${cctpCfg.name}.`);
                    }

                    const nonce = await usdcReadContract.nonces(signingAddress);

                    addCctpLog(`Please sign the Gasless deposit permit in your wallet...`);
                    const domain = {
                        name: CHAIN_CONFIG[selectedToken.id]?.permitName || 'USDC',
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

                    const spender = quoteData.relayerAddress;
                    const deadline = quoteData.deadline;

                    const value = {
                        owner: signingAddress,
                        spender: spender,
                        value: val,
                        nonce: nonce,
                        deadline: deadline
                    };

                    const signature = await signer.signTypedData(domain, types, value);
                    const sig = ethers.Signature.from(signature);

                    addCctpLog(`Submitting deposit to Gas Tank...`);
                    const body = {
                        address: address, // user identity
                        sourceChain: cctpCfg.id,
                        amount: amount,
                        userAddress: signingAddress,
                        permit: {
                            v: sig.v,
                            r: sig.r,
                            s: sig.s,
                            deadline: deadline,
                            nonce: Number(nonce)
                        },
                        destMintRecipient: recipientAddr
                    };

                    const res = await fetch(`${KEEPER_URL_ARC}/fund/permit-bridge`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body)
                    });
                    const resData = await res.json();
                    if (!resData.success) {
                        throw new Error(resData.error || 'Gas Tank submission failed');
                    }

                    addCctpLog(`✅ Gasless deposit registered!`);
                    addCctpLog(`Gas Fees: ${quoteData.gasFeesUsdc} USDC deducted`);
                    addCctpLog(`Net Amount Bridged: ${resData.netAmount} USDC`);
                    addCctpLog(`USDC will arrive in ~2 mins.`);
                    isCCTP = true;
                } else {
                    // --- Fallback: Direct ERC-20 transfer ---
                    if (notify) notify('Sending USDC to Trading Wallet...', 'pending');

                    const transferData = new ethers.Interface([
                        'function transfer(address to, uint256 amount) returns (bool)'
                    ]).encodeFunctionData('transfer', [recipientAddr, val]);

                    const transferHash = await sendTx({
                        to: usdcAddr,
                        data: transferData,
                        value: 0n,
                        chainId: targetChainId
                    }, {
                        uiOptions: { description: `Transfer USDC` }
                    });
                    txHash = transferHash;
                    await readProvider.waitForTransaction(transferHash, 1, 60000);
                }

            } else {
                // Native token path: not supported via smart wallet on source chains
                // Smart wallet users should always bridge via USDC (the gasless path)
                throw new Error('Native token transfers are not supported. Please use USDC bridging.');
            }
            } // Close EVM LOGIC block

            if (!isCCTP) {
                if (notify) notify('Transaction sent! Crediting your balance...', 'pending');

                // Call /fund/confirm to instantly credit the trading wallet balance in backend cache
                const confirmRes = await fetch(`${KEEPER_URL_ARC}/fund/confirm`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        address,
                        txHash,
                        amount: amount.toString(),
                        fromToken: fundingType === 'usdc' ? 'USDC' : selectedToken.symbol
                    })
                });

                if (!confirmRes.ok) {
                    const errData = await confirmRes.json().catch(() => ({}));
                    console.error('[Fund] Confirm failed:', errData);
                }
            }

            // Only show success toast for non-CCTP paths; CCTP uses the in-panel log
            if (isCCTP) {
                addCctpLog('✅ Deposit complete! Balance updated.');
            } else {
                if (notify) notify('Funding Successful! Balance updated.', 'success');
            }
            // Trigger local multichain balance fetch and parent global refresh immediately on success
            fetchAllBalances();
            if (triggerGlobalRefresh) {
                triggerGlobalRefresh(true);
            }

            setFundingStep('success');

            setIsFundingSuccess(true);
            setTimeout(() => {
                setFundingStep('selection');
                setFundingType(null);
                setFundingAmount('');
                setIsFundingSuccess(false);
                fetchWalletInfo(true);
                fetchAllBalances();
                if (triggerGlobalRefresh) {
                    triggerGlobalRefresh(true);
                }
            }, 4000);

        } catch (err) {
            console.error('[Fund Error]', err);
            if (notify) notify(err.message || 'Funding failed. Please try again.', 'error');
            setFundingStep('input');
        }
    };

    const LocalLoading = () => (
        <div className="flex flex-col items-center justify-center gap-6 h-full py-12">
            <img
                src={isLight ? "/goblogo.png" : "/gowlogo.png"}
                className="h-16 w-auto animate-pulse"
                alt="Logo"
            />
            <div className="flex flex-col gap-3 w-32">
                <div className={`h-[1px] w-full ${isLight ? 'bg-black/10' : 'bg-[#1A6140]/30'}`} />
                <div className={`h-[1px] w-full ${isLight ? 'bg-black/10' : 'bg-[#1A6140]/30'}`} />
            </div>
            <div className="w-8 h-8 border-2 border-[#1A6140]/20 border-t-[#1A6140] rounded-full animate-spin" />
        </div>
    );

    return (
        <>
            <AnimatePresence>
                {isLoading && (
                    <WalletConnectionLoading
                        theme={isLight ? 'light' : 'dark'}
                        onFinish={() => setIsLoading(false)}
                    />
                )}
            </AnimatePresence>

            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`absolute inset-0 z-[100] ${isLight ? 'bg-white' : 'bg-black'} overflow-hidden flex flex-col font-sans transition-all duration-700 ${isLoading ? 'blur-3xl scale-[1.1]' : 'blur-0 scale-100'}`}
                style={{ fontFamily: '"Comfortaa", cursive' }}
            >
                {/* Full-page Standard Carbon-Fibre Texture */}
                <div className={`fixed inset-0 opacity-[0.1] pointer-events-none mix-blend-overlay bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] ${isLight ? 'hidden' : ''}`} />

                {/* Immersive Ambiance (Global Glows) */}
                <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
                    <div className={`absolute top-[-10%] left-[-10%] w-[40%] h-[40%] ${isLight ? 'bg-[#1A6140]/5' : 'bg-[#1A6140]/10'} blur-[120px] rounded-full`} />
                    <div className={`absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] ${isLight ? 'bg-[#1A6140]/5' : 'bg-[#1A6140]/10'} blur-[120px] rounded-full`} />
                </div>

                {/* Sticky Header - Full Width */}
                <div className="w-full shrink-0 relative z-50 safe-top">
                    <div className="w-full px-4 md:px-12 h-16 md:h-24 md:pt-8 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => fundingType ? setFundingType(null) : onBack()}
                                className={`p-3 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/80' : 'bg-white/5 hover:bg-white/10 text-white'} transition-all hover:scale-110 active:scale-95`}
                            >
                                <ArrowLeft size={20} />
                            </button>
                            <h2 className={`text-xl font-black uppercase tracking-tighter ${isLight ? 'text-black/80' : 'text-white'} leading-none`}>
                                {fundingType ? 'Select Source' : 'Transfer Hub'}
                            </h2>
                        </div>
                        <button onClick={() => {
                            fetchWalletInfo(true);
                            fetchAllBalances();
                            if (triggerGlobalRefresh) {
                                triggerGlobalRefresh(true);
                            }
                        }} className={`p-3 rounded-full ${isLight ? 'bg-black/5 hover:bg-black/10 text-black/80' : 'bg-white/5 hover:bg-white/10 text-white'} ${isRefreshing ? 'animate-spin' : ''}`}>
                            <RefreshCw size={20} />
                        </button>
                    </div>
                </div>

                {/* Main Content - Full Width */}
                <div className="flex-1 w-full px-4 md:px-12 py-4 md:py-8 flex flex-col lg:flex-row gap-16 overflow-y-auto no-scrollbar items-start justify-start relative z-10">

                    {/* LEFT SIDE: WALLETS & PRIMARY ACTIONS */}
                    <div className={`flex flex-col gap-4 md:gap-8 w-full lg:max-w-md shrink-0 transition-all duration-500 mt-2 md:mt-0`}>
                        {/* Swipeable Wallet Card */}
                        {/* Wallet Card — identical design to the dashboard card.
                            Fixed 448 × 260 canvas, uniformly scaled to fit the screen. */}
                        <style>{`
                            @import url('https://fonts.cdnfonts.com/css/sankyu');
                            @keyframes aurora-slide { from { stroke-dashoffset: 100; } to { stroke-dashoffset: 0; } }
                            .aurora-dash { animation: aurora-slide 5.5s linear infinite; }
                        `}</style>
                        <div ref={hubDeckRef} className="relative w-full max-w-[448px] mt-4 md:mt-0" style={{ aspectRatio: '448 / 260' }}>
                            {/* Fixed-design canvas (448 × 260), uniformly scaled to fit
                                and always centered in its box */}
                            <div className="absolute top-0 origin-top-left"
                                style={{ left: '50%', width: '448px', height: '260px', transform: `translateX(${-224 * hubScale}px) scale(${hubScale})`, transition: 'transform 0.25s ease' }}>
                                {/* Carousel chevrons — outside the card, desktop only */}
                                <button
                                    onClick={() => handleSwipeWallet('right')}
                                    title="Previous card"
                                    className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full items-center justify-center bg-[#0b3220]/85 border border-[#1A6140]/40 text-white/90 backdrop-blur-sm hover:bg-[#0b3220] hover:scale-105 active:scale-95 transition-all"
                                    style={{ left: '-46px', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}
                                >
                                    <ChevronLeft size={18} />
                                </button>
                                <button
                                    onClick={() => handleSwipeWallet('left')}
                                    title="Next card"
                                    className="hidden md:flex absolute top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full items-center justify-center bg-[#0b3220]/85 border border-[#1A6140]/40 text-white/90 backdrop-blur-sm hover:bg-[#0b3220] hover:scale-105 active:scale-95 transition-all"
                                    style={{ right: '-46px', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}
                                >
                                    <ChevronRight size={18} />
                                </button>

                                {/* Transition host — the static window no longer clips the flip;
                                    the card itself carries its rounded outline while rotating */}
                                <div className="w-[448px] h-[260px] relative">
                                    <AnimatePresence mode="wait" initial={false}>
                                        <motion.div
                                            key={activeWalletIdx}
                                            drag="x"
                                            dragConstraints={{ left: 0, right: 0 }}
                                            onDragEnd={(e, info) => {
                                                if (info.offset.x < -100) handleSwipeWallet('left');
                                                else if (info.offset.x > 100) handleSwipeWallet('right');
                                            }}
                                            initial={{ rotateY: -90 * (flipDirRef.current || 1), scale: 0.94 }}
                                            animate={{ rotateY: 0, scale: 1 }}
                                            exit={{ rotateY: 90 * (flipDirRef.current || 1), scale: 0.94 }}
                                            transition={{ rotateY: { duration: 0.34, ease: 'easeInOut' }, scale: { duration: 0.34, ease: 'easeInOut' } }}
                                            style={{ transformPerspective: 1100, backfaceVisibility: 'hidden', boxShadow: '0 10px 28px rgba(0,0,0,0.50), 0 20px 44px rgba(0,0,0,0.45), 0 10px 30px rgba(20, 241, 149, 0.13)' }}
                                            className="absolute inset-0 rounded-[40px] cursor-grab active:cursor-grabbing"
                                        >
                                            <div
                                                className="w-[448px] h-[260px] flex-none relative overflow-hidden rounded-[40px] text-white"
                                                style={{
                                                    fontFamily: '"Comfortaa", cursive',
                                                    background: 'linear-gradient(145deg, #1a6140 0%, #123f28 55%, #0b3220 100%)',
                                                    border: '1.5px solid rgba(99,194,141,0.45)',
                                                    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.25), inset 0 0 46px rgba(0,0,0,0.28)'
                                                }}
                                            >
                                                {/* World-Map Background */}
                                                <img src="/worldmap.svg" alt="" aria-hidden="true"
                                                    className="absolute inset-0 w-full h-full object-cover brightness-0 invert opacity-[0.14] pointer-events-none" />
                                                {/* Brand sheen (keeps the dark green from reading flat) */}
                                                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-white/10 via-transparent to-black/15 pointer-events-none" />

                                                {/* NFC icon, top right — level with the brand logo */}
                                                <Nfc size={24} className="absolute top-4 right-6 text-white/65 pointer-events-none" />

                                                {/* Aurora beam — thin, glowing, hugging the card outline */}
                                                <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 448 260" fill="none" style={{ overflow: 'visible' }}>
                                                    <defs>
                                                        <linearGradient id="aurora-stroke-hub" x1="0" y1="0" x2="1" y2="0">
                                                            <stop offset="0%" stopColor="rgba(126,255,199,0)" />
                                                            <stop offset="50%" stopColor="rgba(126,255,199,0.9)" />
                                                            <stop offset="100%" stopColor="rgba(255,255,255,0.95)" />
                                                        </linearGradient>
                                                    </defs>
                                                    <rect x="2" y="2" width="444" height="256" rx="39" pathLength="100"
                                                        stroke="url(#aurora-stroke-hub)" strokeWidth="4.5" strokeDasharray="12 88" className="aurora-dash"
                                                        style={{ filter: 'blur(3.5px)', opacity: 0.55, strokeLinecap: 'round' }} />
                                                    <rect x="2" y="2" width="444" height="256" rx="39" pathLength="100"
                                                        stroke="url(#aurora-stroke-hub)" strokeWidth="1.5" strokeDasharray="12 88" className="aurora-dash"
                                                        style={{ strokeLinecap: 'round' }} />
                                                </svg>

                                                {/* Card Face: all-white brand logo (top-left) · wallet address on the
                                                    left with its label beneath · username (bottom-left) + balance
                                                    with bigger numbers, USDC small on its base (bottom-right) */}
                                                <div className="h-full flex flex-col justify-between relative z-20 py-4 px-6 md:px-7">

                                                    {/* 15market logo — all white, top-left, shifted upward */}
                                                    <img src="/gowlogo.png" alt="15market" className="h-24 md:h-[120px] w-auto self-start -translate-y-[30%]"
                                                        style={{ filter: 'brightness(0) invert(1)', opacity: 0.95 }} />

                                                    {/* Wallet address — on the left with a copy icon; label beneath */}
                                                    <div className="px-1 min-w-0"
                                                        onClick={() => { if (currentWallet.address) handleCopy(currentWallet.address); }}>
                                                        <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                                                            <p className="text-left text-lg md:text-xl font-black tracking-[0.22em] truncate leading-none">
                                                                {currentWallet.address
                                                                    ? `${currentWallet.address.slice(0, 6)}...${currentWallet.address.slice(-4)}`.toUpperCase()
                                                                    : 'XXXX...XXXX'}
                                                            </p>
                                                            {copied
                                                                ? <Check size={13} className="flex-none text-white/70" />
                                                                : <Copy size={13} className="flex-none text-white/70" />}
                                                        </div>
                                                        <p className="text-left text-[9px] md:text-[10px] italic font-black lowercase tracking-[0.25em] text-white/55 mt-1.5">
                                                            {currentWallet.label.toLowerCase()}
                                                        </p>
                                                    </div>

                                                    {/* Bottom row: username (left) · balance with bigger numbers (right) */}
                                                    <div className="flex items-end justify-between gap-4">
                                                        <span className="text-2xl md:text-3xl font-black truncate" style={{ fontFamily: 'Sankyu, "sankyu", cursive' }}>{username || 'Trader'}</span>
                                                        <div className="text-right leading-none shrink-0">
                                                            <div className="text-[45px] md:text-[72px] font-black tracking-tighter tabular-nums leading-none"
                                                                style={{ textShadow: '0 6px 24px rgba(0,0,0,0.40)' }}>
                                                                ${parseFloat(currentWallet.bal || 0).toFixed(2)}
                                                                <span className="text-[11px] md:text-base ml-1.5 font-bold text-white/70">USDC</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </motion.div>
                                    </AnimatePresence>
                                </div>

                                {/* Wallet page indicator (below the card) */}
                                <div className="flex justify-center gap-1.5 mt-3">
                                    {walletOptions.map((_, i) => (
                                        <button key={i} onClick={() => { flipDirRef.current = i < activeWalletIdx ? 1 : -1; setActiveWalletIdx(i); }} aria-label={`Wallet ${i + 1}`}
                                            className={`h-1.5 rounded-full transition-all duration-300 ${activeWalletIdx === i ? 'w-4 bg-white' : 'w-1.5 bg-white/25 hover:bg-white/40'}`} />
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Primary Actions */}
                        <div className="grid grid-cols-2 gap-3 md:gap-4 shrink-0 relative z-20">
                            <button
                                onClick={() => setShowSendModal(true)}
                                className="flex items-center justify-center gap-2 md:gap-3 bg-[#1A6140] text-white font-black py-4 md:py-6 rounded-[20px] md:rounded-[28px] text-[10px] md:text-sm uppercase tracking-widest hover:scale-[1.02] active:scale-[0.95] transition-all shadow-2xl shadow-[#1A6140]/20"
                            >
                                <Send size={16} /> Send
                            </button>
                            <button
                                onClick={() => setShowReceiveModal(true)}
                                className={`flex items-center justify-center gap-2 md:gap-3 ${isLight ? 'bg-black' : 'bg-white/10 border border-white/10'} text-[#1A6140] font-black py-4 md:py-6 rounded-[20px] md:rounded-[28px] text-[10px] md:text-sm uppercase tracking-widest active:scale-[0.95] transition-all shadow-2xl shadow-black/20`}
                            >
                                <ArrowDownLeft size={16} className="text-[#1A6140]" /> Receive
                            </button>
                        </div>
                    </div>

                    {/* VERTICAL DIVIDER (Desktop Only) */}
                    <motion.div
                        initial={{ opacity: 0, scaleY: 0 }}
                        animate={{ opacity: 1, scaleY: 1 }}
                        className={`hidden lg:block w-[2px] rounded-full self-stretch my-4 bg-[#1A6140]/40`}
                    />

                    {/* RIGHT SIDE: ASSETS & FUNDING (Visible on Mobile & Desktop) */}
                    <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex-1 flex flex-col min-h-0 h-full w-full max-w-2xl overflow-visible md:overflow-hidden -mt-12 md:mt-0"
                    >
                        <div className="flex items-center gap-8 mb-6 border-b border-white/5 shrink-0">
                            <button onClick={() => setActiveTab('assets')} className={`pb-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'assets' ? (isLight ? 'text-black' : 'text-white') : (isLight ? 'text-black/20' : 'text-white/20')}`}>
                                Assets & Funding
                                {activeTab === 'assets' && <motion.div layoutId="tab-underline" className={`absolute bottom-0 left-0 right-0 h-[2.5px] ${isLight ? 'bg-black' : 'bg-white'}`} />}
                            </button>
                            <button onClick={() => { setActiveTab('swap'); setSwapQuote(null); }} className={`pb-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'swap' ? (isLight ? 'text-black' : 'text-white') : (isLight ? 'text-black/20' : 'text-white/20')}`}>
                                Swap
                                {activeTab === 'swap' && <motion.div layoutId="tab-underline" className={`absolute bottom-0 left-0 right-0 h-[2.5px] ${isLight ? 'bg-black' : 'bg-white'}`} />}
                            </button>
                            <button onClick={() => setActiveTab('history')} className={`pb-4 text-xs font-black uppercase tracking-[0.2em] transition-all relative ${activeTab === 'history' ? (isLight ? 'text-black' : 'text-white') : (isLight ? 'text-black/20' : 'text-white/20')}`}>
                                Activity
                                {activeTab === 'history' && <motion.div layoutId="tab-underline" className={`absolute bottom-0 left-0 right-0 h-[2.5px] ${isLight ? 'bg-black' : 'bg-white'}`} />}
                            </button>
                        </div>

                        <div className={`flex-1 overflow-visible md:overflow-hidden custom-scrollbar pr-2 pb-20`}>
                            {activeTab === 'swap' ? (
                                <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6 py-2">
                                    {/* Coming Soon Banner */}
                                    <div className="flex items-center gap-3 px-4 py-3 rounded-2xl border border-[#1A6140]/30 bg-[#1A6140]/10">
                                        <span className="text-[#1A6140] text-lg">⚡</span>
                                        <div>
                                            <p className="text-[10px] font-black uppercase tracking-widest text-[#1A6140]">Coming Soon</p>
                                            <p className={`text-[10px] font-semibold mt-0.5 ${isLight ? 'text-black/50' : 'text-white/40'}`}>Native Arc asset swaps — USDC, EURC, cirBTC. Get a quote now.</p>
                                        </div>
                                    </div>

                                    {/* Token Selectors */}
                                    <div className="flex items-center gap-3">
                                        <div className="flex-1 flex flex-col gap-1.5">
                                            <p className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/30'}`}>From</p>
                                            <div className="flex gap-2 flex-wrap">
                                                {SWAP_TOKENS.map(t => (
                                                    <button key={t} onClick={() => { setSwapFrom(t); if (t === swapTo) setSwapTo(SWAP_TOKENS.find(x => x !== t)); setSwapQuote(null); }}
                                                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                                                            swapFrom === t ? 'bg-[#1A6140] text-white border-[#1A6140]' : isLight ? 'bg-black/5 border-black/10 text-black/60 hover:bg-black/10' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                                                        }`}>{t}</button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-4 ${isLight ? 'bg-black/5' : 'bg-white/5'} cursor-pointer hover:bg-[#1A6140]/20 transition-all`}
                                            onClick={() => { const tmp = swapFrom; setSwapFrom(swapTo); setSwapTo(tmp); setSwapQuote(null); }}>
                                            <span className="text-[#1A6140] text-sm">⇄</span>
                                        </div>
                                        <div className="flex-1 flex flex-col gap-1.5">
                                            <p className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/30'}`}>To</p>
                                            <div className="flex gap-2 flex-wrap">
                                                {SWAP_TOKENS.filter(t => t !== swapFrom).map(t => (
                                                    <button key={t} onClick={() => { setSwapTo(t); setSwapQuote(null); }}
                                                        className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider border transition-all ${
                                                            swapTo === t ? 'bg-[#1A6140] text-white border-[#1A6140]' : isLight ? 'bg-black/5 border-black/10 text-black/60 hover:bg-black/10' : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                                                        }`}>{t}</button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Amount Input */}
                                    <div className="flex flex-col gap-2">
                                        <p className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/30'}`}>Amount ({swapFrom})</p>
                                        <div className={`flex items-center gap-3 px-5 py-4 rounded-2xl border-2 transition-all ${isLight ? 'bg-black/5 border-black/10 focus-within:border-[#1A6140]/40' : 'bg-white/5 border-white/5 focus-within:border-[#1A6140]/40'}`}>
                                            <input
                                                type="number"
                                                placeholder="0.00"
                                                value={swapAmount}
                                                onChange={e => { setSwapAmount(e.target.value); setSwapQuote(null); }}
                                                className={`flex-1 bg-transparent outline-none text-2xl font-black ${isLight ? 'text-black' : 'text-white'} placeholder-white/20`}
                                            />
                                            <span className="text-[10px] font-black text-[#1A6140] uppercase">{swapFrom}</span>
                                        </div>
                                    </div>

                                    {/* Get Quote Button */}
                                    <button
                                        onClick={getSwapQuote}
                                        disabled={!swapAmount || isGettingQuote}
                                        className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-xs transition-all ${
                                            !swapAmount ? 'bg-white/5 text-white/20 cursor-not-allowed' :
                                            isGettingQuote ? 'bg-[#1A6140]/50 text-white animate-pulse' :
                                            'bg-[#1A6140] text-white hover:scale-[1.02] active:scale-[0.98] shadow-lg shadow-[#1A6140]/20'
                                        }`}
                                    >
                                        {isGettingQuote ? 'Fetching Quote...' : 'Get Quote'}
                                    </button>

                                    {/* Quote Result */}
                                    {swapQuote && (
                                        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                            className={`p-5 rounded-2xl border flex flex-col gap-3 ${isLight ? 'bg-black/5 border-black/10' : 'bg-white/5 border-white/10'}`}>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/30'}`}>You Receive</span>
                                                <span className="text-[#1A6140] text-lg font-black">{swapQuote.output} {swapQuote.to}</span>
                                            </div>
                                            <div className={`w-full h-[1px] ${isLight ? 'bg-black/10' : 'bg-white/5'}`} />
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/30'}`}>Rate</span>
                                                <span className={`text-[10px] font-black ${isLight ? 'text-black/60' : 'text-white/60'}`}>1 {swapQuote.from} ≈ {swapQuote.rate} {swapQuote.to}</span>
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className={`text-[9px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/30'}`}>Est. Fee (0.3%)</span>
                                                <span className={`text-[10px] font-black ${isLight ? 'text-black/60' : 'text-white/60'}`}>{swapQuote.fee} {swapQuote.from}</span>
                                            </div>
                                            <button disabled className="w-full py-3 rounded-xl bg-[#1A6140]/20 text-[#1A6140] font-black uppercase text-[9px] tracking-widest cursor-not-allowed mt-1">
                                                Execute Swap — Coming Soon
                                            </button>
                                        </motion.div>
                                    )}
                                </motion.div>
                            ) : activeTab === 'assets' ? (
                                <div className="flex flex-col gap-6">
                                    <div className="flex flex-col gap-4 h-full min-h-[400px]">
                                        {currentWallet.key === 'main' ? (
                                            <div className="flex flex-col items-center justify-center flex-1 pt-6 pb-16 md:py-10 gap-6 relative z-10 w-full h-full md:min-h-[300px] md:pb-0">
                                                <div className={`w-20 h-20 md:w-24 md:h-24 rounded-[28px] md:rounded-[36px] flex items-center justify-center ${isLight ? 'bg-black/5' : 'bg-white/5'} border ${isLight ? 'border-black/5' : 'border-white/10'} transition-all hover:scale-105 group`}>
                                                    <CreditCard size={40} className="text-[#1A6140] opacity-80 group-hover:opacity-100 transition-opacity" strokeWidth={1.5} />
                                                </div>
                                                <div className="text-center">
                                                    <h3 className={`text-[16px] md:text-xl font-black uppercase tracking-tighter ${isLight ? 'text-black' : 'text-white'}`}>
                                                        Fiat <span className="text-[#1A6140]">Funding</span>
                                                    </h3>
                                                    <p className={`text-[9px] md:text-[10px] font-black uppercase tracking-[0.2em] mt-3 ${isLight ? 'text-black/40' : 'text-white/40'}`}>
                                                        USDC Deposits & Withdrawals via Stripe
                                                    </p>
                                                </div>

                                                <div className="flex items-center gap-3 md:gap-4 mt-6 w-full max-w-[280px]">
                                                    <button className="flex-1 py-4 md:py-5 rounded-[20px] bg-[#1A6140] text-white font-black uppercase text-[9px] tracking-[0.2em] shadow-xl shadow-[#1A6140]/20 transition-all opacity-50 cursor-not-allowed">
                                                        Deposit (Soon)
                                                    </button>
                                                    <button className={`flex-1 py-4 md:py-5 rounded-[20px] ${isLight ? 'bg-black text-[#1A6140]' : 'bg-white/5 text-[#1A6140] border border-white/10'} font-black uppercase text-[9px] tracking-[0.2em] transition-all opacity-50 cursor-not-allowed`}>
                                                        Withdraw (Soon)
                                                    </button>
                                                </div>
                                            </div>
                                        ) : !fundingType ? (
                                            <div className="flex flex-col items-center justify-start md:justify-center flex-1 pt-6 pb-16 md:py-10 gap-4 md:gap-16 relative z-10 w-full h-full md:min-h-[300px] md:pb-0">
                                                {/* TOP SECTION: Funding Buttons */}
                                                <div className="flex flex-col items-center gap-6 md:gap-16 w-full -translate-y-[5vh] md:-translate-y-[5vh] mt-2 md:mt-0">
                                                    <h3 className={`text-[10px] md:text-xs font-black uppercase tracking-[0.3em] ${isLight ? 'text-black/40' : 'text-white/40'} mt-1 md:mt-0`}>Select Funding Type</h3>

                                                    <div className="flex items-center justify-center gap-6 md:gap-16 w-full -mt-3 md:mt-0">
                                                        <button
                                                            onClick={() => setFundingType('native')}
                                                            className="flex flex-col items-center gap-4 md:gap-6 transition-all hover:scale-110 active:scale-95 group"
                                                        >
                                                            <Globe size={24} className={`md:!w-8 md:!h-8 transition-all ${isLight ? 'text-black/60' : 'text-white/60'} group-hover:text-[#1A6140]`} strokeWidth={1.5} />
                                                            <div className="text-center">
                                                                <p className={`text-[10px] md:text-sm font-black uppercase tracking-[0.2em] transition-all ${isLight ? 'text-black/60 group-hover:text-[#1A6140]' : 'text-white/60 group-hover:text-[#1A6140]'}`}>Native Tokens</p>
                                                            </div>
                                                        </button>
                                                        {/* Divider Line */}
                                                        <div className={`w-[2px] h-16 md:h-24 bg-[#1A6140]/40 mx-2 md:mx-12 rounded-full`}></div>

                                                        <button
                                                            onClick={() => setFundingType('usdc')}
                                                            className="flex flex-col items-center gap-4 md:gap-6 transition-all hover:scale-110 active:scale-95 group"
                                                        >
                                                            <div className="relative flex items-center justify-center">
                                                                <img
                                                                    src="/usdc.png"
                                                                    alt="USDC Logo"
                                                                    className={`w-[3.3rem] h-[3.3rem] md:w-[4.95rem] md:h-[4.95rem] object-contain transition-all opacity-70 group-hover:opacity-100 -translate-y-[2vh] ${isLight ? 'brightness-0' : 'brightness-0 invert'} group-hover:[filter:brightness(0)_saturate(100%)_invert(64%)_sepia(26%)_saturate(1028%)_hue-rotate(101deg)_brightness(88%)_contrast(82%)]`}
                                                                />
                                                                <p className={`absolute bottom-0 left-1/2 -translate-x-1/2 text-[10px] md:text-sm font-black uppercase tracking-[0.2em] transition-all whitespace-nowrap ${isLight ? 'text-black/60 group-hover:text-[#1A6140]' : 'text-white/60 group-hover:text-[#1A6140]'}`}>USDC</p>
                                                            </div>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* BOTTOM SECTION: Logos and Powered By */}
                                                <div className={`fixed md:relative bottom-0 left-0 w-full flex flex-col items-center gap-1 md:gap-8 mt-auto md:mt-0 pt-0 pb-0 z-50 md:z-auto safe-bottom pointer-events-none md:pointer-events-auto -translate-y-[3vh] md:translate-y-0`}>
                                                    {/* Infinite Scrolling Asset Marquee - Enabled on Mobile & Desktop */}
                                                    <div className="block w-full max-w-5xl mx-auto md:mt-8 overflow-hidden relative [mask-image:linear-gradient(to_right,transparent,black_15%,black_85%,transparent)] z-0 translate-y-[2vh] md:translate-y-0">
                                                        <motion.div
                                                            animate={{ x: ["0%", "-50%"] }}
                                                            transition={{ ease: "linear", duration: 25, repeat: Infinity }}
                                                            className="flex items-center w-max"
                                                        >
                                                            {/* Duplicate exactly TWICE for seamless -50% loop */}
                                                            {[...Array(2)].map((_, groupIdx) => (
                                                                <div key={groupIdx} className="flex items-center">
                                                                    {/* To make it long enough, repeat the tokens within each half */}
                                                                    {[...SUPPORTED_TOKENS, ...SUPPORTED_TOKENS, ...SUPPORTED_TOKENS].map((token, i) => (
                                                                        <div key={`${groupIdx}-${i}`} className="flex items-center justify-center w-12 md:w-24">
                                                                            <img
                                                                                src={token.icon}
                                                                                alt={token.name}
                                                                                className="w-5 h-5 md:w-10 md:h-10 object-contain opacity-30 brightness-0 md:brightness-100 grayscale transition-all drop-shadow-[0_4px_8px_rgba(0,0,0,0.15)]"
                                                                            />
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            ))}
                                                        </motion.div>
                                                    </div>

                                                    {/* Powered By Badge */}
                                                    <div className="flex items-center justify-center gap-2 md:gap-3 relative md:-mt-6 opacity-60 hover:opacity-100 transition-opacity duration-500 z-20 translate-y-[2vh] md:translate-y-0">
                                                        <span className={`relative z-30 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/50' : 'text-white/50'}`}>Powered by</span>
                                                        <div className="flex items-center gap-1.5 md:gap-2.5 relative z-30">
                                                            <img
                                                                src="/circle.png"
                                                                alt="Circle"
                                                                className="h-5 md:h-10 object-contain drop-shadow-[0_0_10px_rgba(26, 97, 64,0.3)] relative z-30"
                                                                style={{ filter: 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)' }}
                                                            />
                                                            <div className={`relative z-30 text-white opacity-40 scale-75 md:scale-100`}>
                                                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                                                    <path d="M1 1L11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3" />
                                                                    <path d="M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3" />
                                                                </svg>
                                                            </div>
                                                            <span className="relative z-30 text-[9px] md:text-xs font-black tracking-widest text-[#1A6140]">CCTP</span>
                                                            <div className={`relative z-30 text-white opacity-40 scale-75 md:scale-100`}>
                                                                <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                                                                    <path d="M1 1L11 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3" />
                                                                    <path d="M11 1L1 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeDasharray="1 3" />
                                                                </svg>
                                                            </div>
                                                            <span className={`relative z-30 text-[8px] md:text-[10px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/50' : 'text-white/50'}`}>GATEWAY</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <div className={`flex flex-col gap-4 relative z-10`}>
                                                    <div className="flex items-center justify-between mb-4">
                                                        <button
                                                            onClick={() => setFundingType(null)}
                                                            className={`p-2.5 rounded-full border transition-all ${isLight ? 'bg-white/50 border-black/10 text-black/60 hover:text-black hover:bg-black/5' : 'bg-black/50 border-white/10 text-white/60 hover:text-white hover:bg-white/5'}`}
                                                        >
                                                            <ArrowLeft size={16} />
                                                        </button>
                                                        <h3 className={`text-[11px] font-black uppercase tracking-[0.3em] opacity-40 text-white`}>
                                                            {fundingType === 'native' ? 'Native Tokens' : 'USDC'}
                                                        </h3>
                                                        <div className="flex gap-1.5">
                                                            {SUPPORTED_TOKENS.map((_, i) => (
                                                                <div key={i} className={`w-1.5 h-1.5 rounded-full ${activeTokenIdx === i ? 'bg-[#1A6140]' : 'bg-white/10'}`} />
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <AnimatePresence mode="wait">
                                                        {fundingStep === 'selection' ? (
                                                            <motion.div
                                                                key="selection"
                                                                initial={{ opacity: 0 }}
                                                                animate={{ opacity: 1 }}
                                                                exit={{ opacity: 0 }}
                                                                className="w-full h-full flex flex-col"
                                                            >
                                                                {/* MOBILE SIDE-BY-SIDE VIEW (Scroll-free) */}
                                                                <div className="flex md:hidden flex-row flex-nowrap items-center justify-between w-full h-[280px] -mt-12 gap-0 relative overflow-visible">
                                                                    {/* Big Swipeable Logo Area (60%) */}
                                                                    <div className="relative w-[60%] h-full flex items-center justify-center overflow-visible group/token z-10">
                                                                        <button onClick={() => handleSwipeToken('right')} className="absolute left-1 top-[22%] -translate-y-1/2 z-20 p-1.5 text-[#1A6140]"><ChevronLeft size={20} /></button>
                                                                        <button onClick={() => handleSwipeToken('left')} className="absolute right-1 top-[22%] -translate-y-1/2 z-20 p-1.5 text-[#1A6140]"><ChevronRight size={20} /></button>

                                                                        <AnimatePresence mode="wait">
                                                                            <motion.div
                                                                                key={activeTokenIdx}
                                                                                drag="x"
                                                                                dragConstraints={{ left: 0, right: 0 }}
                                                                                onDragEnd={(e, info) => {
                                                                                    if (info.offset.x < -30) handleSwipeToken('left');
                                                                                    else if (info.offset.x > 30) handleSwipeToken('right');
                                                                                }}
                                                                                initial={{ opacity: 0, scale: 0.8 }}
                                                                                animate={{ opacity: 1, scale: 1 }}
                                                                                exit={{ opacity: 0, scale: 0.8 }}
                                                                                className="absolute inset-0 flex flex-col items-center justify-center"
                                                                            >
                                                                                <div className="relative w-full h-full flex items-center justify-center">
                                                                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[95%] w-36 h-36 pointer-events-none z-0">
                                                                                        <img
                                                                                            src={selectedToken.icon}
                                                                                            className={`w-full h-full object-contain ${isLight ? 'drop-shadow-[0_0_40px_rgba(0,0,0,0.1)]' : 'drop-shadow-[0_0_40px_rgba(26, 97, 64,0.3)]'}`}
                                                                                            style={{ filter: isLight ? 'brightness(0) opacity(40%)' : 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)' }}
                                                                                            alt={selectedToken.symbol}
                                                                                        />
                                                                                        {fundingType === 'usdc' && (
                                                                                            <img
                                                                                                src="/circlewhite.png"
                                                                                                className={`absolute -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)] z-10 ${selectedToken.id === 'eth' ? 'top-[45%] left-[50%] w-[22%] h-[22%]' :
                                                                                                    selectedToken.id === 'avax' ? 'top-[56%] left-[59%] w-[18%] h-[18%]' :
                                                                                                        selectedToken.id === 'sol' ? 'top-[59%] left-[50%] w-[18%] h-[18%]' :
                                                                                                            selectedToken.id === 'mon' ? 'top-[65%] left-[50%] w-[18%] h-[18%]' :
                                                                                                                'top-[50%] left-[50%] w-[20%] h-[20%]'
                                                                                                    }`}
                                                                                                style={{ filter: isLight ? 'brightness(0) opacity(40%)' : 'brightness(0) invert(1)' }}
                                                                                                alt="USDC"
                                                                                            />
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="relative z-10 -translate-y-[3vh]">
                                                                                        <p className="text-xl md:text-2xl font-black tracking-tighter text-white drop-shadow-xl text-center">
                                                                                            {fundingType === 'native' ? selectedToken.symbol : `${selectedToken.symbol}-USDC`}
                                                                                        </p>
                                                                                    </div>
                                                                                </div>
                                                                            </motion.div>
                                                                        </AnimatePresence>
                                                                    </div>

                                                                    <div className="w-[1.5px] h-24 bg-[#1A6140]/40 rounded-full shrink-0 relative z-30 -translate-y-[10vh]" />

                                                                    <div className="w-[38%] flex flex-col gap-1.5 items-center justify-center px-2 relative z-30 -translate-y-[8vh]">
                                                                        {selectedToken.id === 'sol' && !hasSolWallet ? (
                                                                            /* SOL — no wallet yet: show Generate + Link side-by-side */
                                                                            <div className="flex flex-col gap-1.5 w-full">
                                                                                <button
                                                                                    id="generate-sol-wallet-btn"
                                                                                    onClick={handleGenerateSolWallet}
                                                                                    disabled={isCreatingSolWallet}
                                                                                    className="w-full py-3 rounded-full bg-gradient-to-r from-[#9945FF] to-[#14F195] text-black font-black uppercase text-[8px] tracking-widest hover:opacity-90 active:scale-[0.95] transition-all shadow-lg disabled:opacity-60 flex items-center justify-center gap-1"
                                                                                >
                                                                                    {isCreatingSolWallet ? <RefreshCw size={10} className="animate-spin" /> : <Zap size={10} />}
                                                                                    {isCreatingSolWallet ? 'Creating...' : 'Generate'}
                                                                                </button>
                                                                                <button
                                                                                    id="link-sol-wallet-btn"
                                                                                    onClick={handleLinkSolWallet}
                                                                                    className="w-full py-3 rounded-full border border-[#9945FF]/60 text-[#9945FF] font-black uppercase text-[8px] tracking-widest hover:bg-[#9945FF]/10 active:scale-[0.95] transition-all flex items-center justify-center gap-1"
                                                                                >
                                                                                    <Wallet size={10} /> Link Wallet
                                                                                </button>
                                                                            </div>
                                                                        ) : (
                                                                            /* Normal: show balance + Fund button */
                                                                            <>
                                                                                <div className="flex flex-col items-center opacity-80 -translate-y-[2vh]">
                                                                                    {selectedToken.id === 'sol' && !solanaWallet && generatedSolWalletPub ? (
                                                                                        <div className="flex flex-col items-center mb-1">
                                                                                            <span className={`text-[8px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/50' : 'text-white/50'}`}>Deposit Address</span>
                                                                                            <div 
                                                                                                onClick={() => {
                                                                                                    navigator.clipboard.writeText(generatedSolWalletPub);
                                                                                                    if (notify) notify('Deposit Address Copied!', 'success');
                                                                                                }}
                                                                                                className="flex items-center gap-1 cursor-pointer hover:opacity-80 active:scale-95 transition-all mt-0.5"
                                                                                            >
                                                                                                <span className={`text-[9px] font-mono font-bold ${isLight ? 'text-black' : 'text-white'}`}>
                                                                                                    {generatedSolWalletPub.slice(0, 4)}...{generatedSolWalletPub.slice(-4)}
                                                                                                </span>
                                                                                                <Copy size={8} className={isLight ? 'text-black' : 'text-white'} />
                                                                                            </div>
                                                                                        </div>
                                                                                    ) : null}
                                                                                    <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/50' : 'text-white/50'}`}>Available</span>
                                                                                    <span className={`text-[13px] font-black tracking-wider ${isLight ? 'text-black/80' : 'text-white/90'}`}>
                                                                                        {fundingType === 'usdc' ?
                                                                                            (multiChainBalances[selectedToken.id]?.usdc || 0).toFixed(2)
                                                                                            : (multiChainBalances[selectedToken.id]?.native || 0).toFixed(4)} {fundingType === 'native' ? selectedToken.symbol : 'USDC'}
                                                                                    </span>
                                                                                </div>
                                                                                <button
                                                                                    onClick={startFundingFlow}
                                                                                    className="w-full py-3.5 rounded-full bg-[#1A6140] text-white font-black uppercase text-[9px] tracking-widest hover:scale-[1.02] active:scale-[0.95] transition-all shadow-xl shadow-[#1A6140]/20 flex items-center justify-center text-center"
                                                                                >
                                                                                    Fund {selectedToken.symbol}
                                                                                </button>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>

                                                                {/* DESKTOP CAROUSEL */}
                                                                <div className="hidden md:flex relative h-[280px] w-full items-center justify-center overflow-hidden group/token">
                                                                    <button onClick={() => handleSwipeToken('right')} className="absolute left-[-20px] top-1/2 -translate-y-1/2 z-20 p-2 transition-all active:scale-90 text-[#1A6140]"><ChevronLeft size={36} strokeWidth={2.5} /></button>
                                                                    <button onClick={() => handleSwipeToken('left')} className="absolute right-[-20px] top-1/2 -translate-y-1/2 z-20 p-2 transition-all active:scale-90 text-[#1A6140]"><ChevronRight size={36} strokeWidth={2.5} /></button>

                                                                    <AnimatePresence mode="wait">
                                                                        <motion.div
                                                                            key={activeTokenIdx}
                                                                            initial={{ opacity: 0, scale: 0.8 }}
                                                                            animate={{ opacity: 1, scale: 1 }}
                                                                            exit={{ opacity: 0, scale: 0.8 }}
                                                                            className="absolute inset-0 flex flex-col items-center justify-center"
                                                                        >
                                                                            <div className="flex items-center justify-center relative w-full h-full">
                                                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[70%] w-64 h-64 pointer-events-none z-0">
                                                                                    <img
                                                                                        src={selectedToken.icon}
                                                                                        className="w-full h-full object-contain drop-shadow-[0_0_80px_rgba(26, 97, 64,0.5)]"
                                                                                        style={{ filter: isLight ? 'brightness(0) opacity(40%)' : 'brightness(0) saturate(100%) invert(64%) sepia(26%) saturate(1028%) hue-rotate(101deg) brightness(88%) contrast(82%)' }}
                                                                                        alt={selectedToken.symbol}
                                                                                    />
                                                                                    {fundingType === 'usdc' && (
                                                                                        <img src="/circlewhite.png" className={`absolute -translate-x-1/2 -translate-y-1/2 object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.3)] z-10 ${selectedToken.id === 'eth' ? 'top-[45%] left-[50%] w-[22%] h-[22%]' : selectedToken.id === 'avax' ? 'top-[56%] left-[59%] w-[18%] h-[18%]' : selectedToken.id === 'sol' ? 'top-[59%] left-[50%] w-[18%] h-[18%]' : selectedToken.id === 'mon' ? 'top-[65%] left-[50%] w-[18%] h-[18%]' : 'top-[50%] left-[50%] w-[20%] h-[20%]'}`} style={{ filter: isLight ? 'brightness(0) opacity(40%)' : 'brightness(0) invert(1)' }} alt="USDC" />
                                                                                    )}
                                                                                </div>
                                                                                <div className="relative z-10 flex flex-col items-center justify-center translate-y-10">
                                                                                    <p className="text-5xl font-black tracking-tighter text-white drop-shadow-2xl">
                                                                                        {fundingType === 'native' ? selectedToken.symbol : `${selectedToken.symbol}-USDC`}
                                                                                    </p>
                                                                                </div>
                                                                            </div>
                                                                        </motion.div>
                                                                    </AnimatePresence>
                                                                </div>

                                                                <div className="hidden md:flex relative z-20 -translate-y-[30%] flex flex-col items-center gap-4">
                                                                    {selectedToken.id === 'sol' && !hasSolWallet ? (
                                                                        /* SOL — no wallet yet: two side-by-side buttons under the logo */
                                                                        <div className="flex gap-3 -translate-y-[5.5vh]">
                                                                            <button
                                                                                id="generate-sol-wallet-btn-desktop"
                                                                                onClick={handleGenerateSolWallet}
                                                                                disabled={isCreatingSolWallet}
                                                                                className="px-5 py-3.5 rounded-[16px] bg-gradient-to-r from-[#9945FF] to-[#14F195] text-black font-black uppercase text-[10px] tracking-widest hover:opacity-90 active:scale-[0.97] transition-all shadow-xl shadow-[#9945FF]/25 disabled:opacity-60 flex items-center gap-2"
                                                                            >
                                                                                {isCreatingSolWallet ? <RefreshCw size={13} className="animate-spin" /> : <Zap size={13} />}
                                                                                {isCreatingSolWallet ? 'Creating...' : 'Generate Wallet'}
                                                                            </button>
                                                                            <button
                                                                                id="link-sol-wallet-btn-desktop"
                                                                                onClick={handleLinkSolWallet}
                                                                                className="px-5 py-3.5 rounded-[16px] border-2 border-[#9945FF]/60 text-[#9945FF] font-black uppercase text-[10px] tracking-widest hover:bg-[#9945FF]/10 active:scale-[0.97] transition-all flex items-center gap-2"
                                                                            >
                                                                                <Wallet size={13} /> Link Wallet
                                                                            </button>
                                                                        </div>
                                                                    ) : (
                                                                        /* Normal: balance + Fund button */
                                                                        <>
                                                                            <div className="flex flex-col items-center opacity-80 -mb-2 -translate-y-[5vh]">
                                                                                {selectedToken.id === 'sol' && !solanaWallet && generatedSolWalletPub ? (
                                                                                    <div className="flex flex-col items-center mb-2">
                                                                                        <span className={`text-[9px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/50' : 'text-white/50'}`}>Deposit Address</span>
                                                                                        <div 
                                                                                            onClick={() => {
                                                                                                navigator.clipboard.writeText(generatedSolWalletPub);
                                                                                                if (notify) notify('Deposit Address Copied!', 'success');
                                                                                            }}
                                                                                            className="flex items-center gap-1.5 cursor-pointer hover:opacity-80 active:scale-95 transition-all mt-1"
                                                                                        >
                                                                                            <span className={`text-[11px] font-mono font-bold ${isLight ? 'text-black' : 'text-white'}`}>
                                                                                                {generatedSolWalletPub.slice(0, 6)}...{generatedSolWalletPub.slice(-4)}
                                                                                            </span>
                                                                                            <Copy size={10} className={isLight ? 'text-black' : 'text-white'} />
                                                                                        </div>
                                                                                    </div>
                                                                                ) : null}
                                                                                <span className={`text-[11px] font-black uppercase tracking-[0.2em] ${isLight ? 'text-black/50' : 'text-white/50'}`}>Available</span>
                                                                                <span className={`text-[15px] font-black tracking-wider ${isLight ? 'text-black/80' : 'text-white/90'}`}>
                                                                                    {fundingType === 'usdc' ?
                                                                                        (multiChainBalances[selectedToken.id]?.usdc || 0).toFixed(2)
                                                                                        : (multiChainBalances[selectedToken.id]?.native || 0).toFixed(4)} {fundingType === 'native' ? selectedToken.symbol : 'USDC'}
                                                                                </span>
                                                                            </div>
                                                                            <button
                                                                                onClick={startFundingFlow}
                                                                                className="w-auto px-10 py-4 rounded-[20px] bg-[#1A6140] text-white font-black uppercase text-[11px] tracking-widest hover:scale-[1.02] active:scale-[0.95] transition-all shadow-2xl shadow-[#1A6140]/20 -translate-y-[5.5vh]"
                                                                            >
                                                                                Fund {fundingType === 'native' ? selectedToken.name : `${selectedToken.name} USDC`}
                                                                            </button>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </motion.div>
                                                        ) : fundingStep === 'loading' ? (
                                                            <motion.div
                                                                key="loading"
                                                                initial={{ opacity: 0 }}
                                                                animate={{ opacity: 1 }}
                                                                exit={{ opacity: 0 }}
                                                                className="w-full h-full flex items-center justify-center"
                                                            >
                                                                <LocalLoading />
                                                            </motion.div>
                                                        ) : fundingStep === 'confirming' ? (
                                                            <motion.div
                                                                key="confirming"
                                                                initial={{ opacity: 0, x: -20 }}
                                                                animate={{ opacity: 1, x: 0 }}
                                                                exit={{ opacity: 0 }}
                                                                className="w-full h-full flex flex-col items-start justify-start gap-4 py-4 px-2"
                                                            >
                                                                {/* Step markers */}
                                                                <div className="flex items-center gap-0 w-full">
                                                                    {[{n:1,label:'Approval'},{n:2,label:'Burn'},{n:3,label:'Attestation'},{n:4,label:'Mint'}].map(({n, label}, i, arr) => (
                                                                        <React.Fragment key={n}>
                                                                            <div className="flex flex-col items-center gap-1 flex-shrink-0">
                                                                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black transition-all duration-500 ${
                                                                                    cctpStep > n ? 'bg-[#1A6140] text-white scale-105' :
                                                                                    cctpStep === n ? 'bg-[#1A6140] text-white ring-2 ring-[#1A6140]/40 animate-pulse' :
                                                                                    'bg-white/10 text-white/30'
                                                                                }`}>{n}</div>
                                                                                <span className={`text-[9px] font-black uppercase tracking-wider transition-colors ${
                                                                                    cctpStep >= n ? 'text-[#1A6140]' : 'text-white/30'
                                                                                }`}>{label}</span>
                                                                            </div>
                                                                            {i < arr.length - 1 && (
                                                                                <div className={`flex-1 h-[1.5px] mb-4 transition-all duration-700 ${
                                                                                    cctpStep > n ? 'bg-[#1A6140]' : 'bg-white/10'
                                                                                }`} />
                                                                            )}
                                                                        </React.Fragment>
                                                                    ))}
                                                                </div>

                                                                {/* Live log */}
                                                                <div className="w-full flex-1 p-1 overflow-y-auto" style={{minHeight:'120px', maxHeight:'180px', fontFamily:'monospace'}}>
                                                                    {cctpLogs.length === 0 ? (
                                                                        <p className={`text-[10px] ${isLight ? 'text-black/30' : 'text-white/30'}`}>Initialising...</p>
                                                                    ) : cctpLogs.map((log, i) => (
                                                                        <p key={i} className={`text-[10px] leading-5 break-all ${isLight ? 'text-black/80' : 'text-white/70'}`}>{log}</p>
                                                                    ))}
                                                                </div>
                                                            </motion.div>
                                                        ) : fundingStep === 'input' ? (
                                                            <motion.div
                                                                key="input"
                                                                initial={{ opacity: 0, y: 20 }}
                                                                animate={{ opacity: 1, y: 0 }}
                                                                exit={{ opacity: 0, y: -20 }}
                                                                className="w-full h-full flex flex-col items-center justify-center gap-8 py-8"
                                                            >
                                                                <div className="flex flex-col items-center gap-2">
                                                                    <span className="text-[10px] font-black uppercase tracking-[0.3em] opacity-40">Enter Amount</span>
                                                                    <div className="relative group">
                                                                        <input
                                                                            type="number"
                                                                            placeholder="0.00"
                                                                            value={fundingAmount}
                                                                            onChange={(e) => setFundingAmount(e.target.value)}
                                                                            className={`w-48 bg-transparent border-b-2 border-[#1A6140]/20 focus:border-[#1A6140] transition-all text-center text-4xl font-black py-4 outline-none text-white`}
                                                                        />
                                                                        <span className="absolute right-0 bottom-4 text-[10px] font-black text-[#1A6140] uppercase">{fundingType === 'usdc' ? 'USDC' : selectedToken.symbol}</span>
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    onClick={handleConfirmFunding}
                                                                    disabled={!fundingAmount}
                                                                    className={`px-12 py-5 rounded-[24px] font-black uppercase tracking-widest text-xs transition-all ${!fundingAmount ? 'bg-white/5 text-white/20' : 'bg-[#1A6140] text-white shadow-xl shadow-[#1A6140]/20 hover:scale-105 active:scale-95'}`}
                                                                >
                                                                    Confirm Deposit
                                                                </button>
                                                                <button
                                                                    onClick={() => setFundingStep('selection')}
                                                                    className="text-[10px] font-black uppercase tracking-widest opacity-40 hover:opacity-100"
                                                                >
                                                                    Cancel
                                                                </button>
                                                            </motion.div>
                                                        ) : fundingStep === 'success' ? (
                                                            <motion.div
                                                                key="success"
                                                                initial={{ opacity: 0, scale: 0.9 }}
                                                                animate={{ opacity: 1, scale: 1 }}
                                                                className="w-full h-full flex flex-col items-center justify-center gap-6 py-12"
                                                            >
                                                                <div className="w-20 h-20 rounded-full bg-[#1A6140]/20 flex items-center justify-center">
                                                                    <Check size={40} className="text-[#1A6140]" />
                                                                </div>
                                                                <div className="text-center">
                                                                    <h3 className="text-2xl font-black uppercase tracking-tighter text-white">Congratulations!</h3>
                                                                    <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest mt-2">Transaction successfully initiated.</p>
                                                                </div>
                                                            </motion.div>
                                                        ) : null}
                                                    </AnimatePresence>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {walletInfo?.transactions?.map((tx, i) => (
                                        <div key={i} className={`p-8 rounded-[40px] border ${isLight ? 'bg-[#C2D1C9] border-black/5 shadow-sm' : 'bg-[#111] border-white/5'} flex items-center justify-between transition-all hover:scale-[1.01]`}>
                                            <div className="flex items-center gap-5">
                                                <div className={`w-14 h-14 rounded-full flex items-center justify-center ${tx.type === 'OUTGOING' ? 'bg-orange-500/10 text-orange-500' : 'bg-[#1A6140]/10 text-[#1A6140]'}`}>
                                                    {tx.type === 'OUTGOING' ? <Send size={24} /> : <ArrowDownLeft size={24} />}
                                                </div>
                                                <div>
                                                    <p className={`text-sm font-black uppercase tracking-wider text-white`}>{tx.type}</p>
                                                    <p className="text-[10px] font-bold opacity-40 uppercase tracking-widest text-white">{new Date(tx.createDate).toLocaleDateString()}</p>
                                                </div>
                                            </div>
                                            <p className={`text-xl font-black text-white`}>
                                                {tx.type === 'OUTGOING' ? '-' : '+'}{tx.amounts?.[0] || '0.00'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>

                {/* Modals Integrated */}
                <AnimatePresence>
                    {showSendModal && (
                        <div className="fixed inset-0 z-[400] flex items-end md:items-center justify-center p-0 md:p-6">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowSendModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className={`w-full md:max-w-md relative z-10 p-6 md:p-8 rounded-t-[40px] md:rounded-[40px] border-t md:border ${isLight ? 'bg-[#CFDCD5] border-black/5' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'} max-h-[92dvh] overflow-y-auto`}>
                                <div className="flex items-center justify-between mb-8">
                                    <h3 className={`text-2xl font-black uppercase tracking-tighter text-white`}>Send Assets</h3>
                                    <button onClick={() => setShowSendModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={24} /></button>
                                </div>

                                <div className="flex flex-col gap-6">
                                    <div className={`p-4 rounded-2xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border-2 border-[#1A6140]/20`}>
                                        <p className="text-[10px] font-black uppercase tracking-widest opacity-40 mb-1">Source Wallet</p>
                                        <p className={`text-sm font-black uppercase text-white`}>{currentWallet.label}</p>
                                    </div>

                                    <div>
                                        <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'} block mb-2`}>Recipient Address</label>
                                        <input type="text" placeholder="0x..." value={destAddress} onChange={(e) => setDestAddress(e.target.value)} className={`w-full py-5 px-6 rounded-2xl ${isLight ? 'bg-black/5 text-black' : 'bg-white/5 text-white'} border-2 border-transparent focus:border-[#1A6140]/30 outline-none text-sm font-bold transition-all`} />
                                    </div>

                                    <div>
                                        <div className="flex items-center justify-between mb-2">
                                            <label className={`text-[10px] font-black uppercase tracking-widest ${isLight ? 'text-black/40' : 'text-white/40'}`}>Amount (USDC)</label>
                                            <button onClick={() => setSendAmount(currentWallet.bal.toFixed(4))} className="text-[10px] font-black text-[#1A6140] uppercase hover:underline">Max Available</button>
                                        </div>
                                        <input type="number" placeholder="0.00" value={sendAmount} onChange={(e) => setSendAmount(e.target.value)} className={`w-full py-5 px-6 rounded-2xl ${isLight ? 'bg-black/5 text-black' : 'bg-white/5 text-white'} border-2 border-transparent focus:border-[#1A6140]/30 outline-none text-3xl font-black transition-all`} />
                                    </div>

                                    <button onClick={handleSend} disabled={isSending} className="w-full bg-[#1A6140] text-black font-black py-6 rounded-[28px] uppercase tracking-widest mt-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-[#1A6140]/20">
                                        {isSending ? 'Processing...' : 'Confirm Transfer'}
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}

                    {showReceiveModal && (
                        <div className="fixed inset-0 z-[400] flex items-end md:items-center justify-center p-0 md:p-6">
                            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setShowReceiveModal(false)} className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
                            <motion.div initial={{ opacity: 0, y: 100 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 100 }} className={`w-full md:max-w-md relative z-10 p-6 md:p-8 rounded-t-[40px] md:rounded-[40px] border-t md:border ${isLight ? 'bg-[#CFDCD5] border-black/5' : 'bg-[#0D0D0D] border-white/5 shadow-2xl'} flex flex-col items-center max-h-[92dvh] overflow-y-auto`}>
                                <div className="flex items-center justify-between w-full mb-8">
                                    <h3 className={`text-2xl font-black uppercase tracking-tighter text-white`}>Receive</h3>
                                    <button onClick={() => setShowReceiveModal(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors"><X size={24} /></button>
                                </div>

                                <div className="p-4 rounded-3xl bg-white mb-8 shadow-2xl relative group overflow-hidden flex items-center justify-center">
                                    {qrCodeData ? (
                                        <>
                                            <img src={qrCodeData} alt="QR Code" className="w-56 h-56 block" />
                                            <button onClick={handleDownloadQR} className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex flex-col items-center justify-center transition-all backdrop-blur-[2px]">
                                                <Download size={32} className="text-[#1A6140] mb-2" />
                                                <span className="text-[10px] font-black uppercase text-white tracking-widest">Download QR</span>
                                            </button>
                                        </>
                                    ) : <div className="w-56 h-56 flex items-center justify-center"><RefreshCw size={32} className="animate-spin text-black/10" /></div>}
                                </div>

                                <div className={`w-full p-6 rounded-3xl ${isLight ? 'bg-black/5' : 'bg-white/5'} border border-dashed text-center mb-8`}>
                                    <p className={`text-[10px] font-black uppercase tracking-widest mb-3 opacity-40 ${isLight ? 'text-black' : 'text-white'}`}>Deposit to {currentWallet.label}</p>
                                    <p className={`text-xs font-black font-mono break-all ${isLight ? 'text-black' : 'text-white'}`}>
                                        {currentWallet.key === 'trading'
                                            ? (sessionAddress || walletInfo?.wallet?.address || '—')
                                            : (mainWalletAddress || address || '—')}
                                    </p>
                                </div>

                                <div className="grid grid-cols-2 gap-3 w-full">
                                    <button onClick={() => { navigator.clipboard.writeText(currentWallet.key === 'trading' ? walletInfo?.wallet?.address : address); notify("Copied!", "success"); }} className={`flex items-center justify-center gap-3 bg-[#1A6140] text-white font-black py-5 rounded-[24px] text-[11px] uppercase tracking-widest transition-all`}>
                                        <Copy size={16} /> Copy
                                    </button>
                                    <button onClick={handleDownloadQR} className={`flex items-center justify-center gap-3 ${isLight ? 'bg-black/5' : 'bg-white/5'} border ${isLight ? 'border-black/10' : 'border-white/10'} font-black py-5 rounded-[24px] text-[11px] uppercase tracking-widest transition-all`}>
                                        <Save size={16} /> Save
                                    </button>
                                </div>
                            </motion.div>
                        </div>
                    )}
                </AnimatePresence>

                <UnifiedFundingModal
                    isOpen={showUnifiedFunding}
                    onClose={() => setShowUnifiedFunding(false)}
                    isLight={isLight}
                    notify={notify}
                    address={address}
                    sessionAddress={sessionAddress}
                    wallets={wallets}
                    smartWalletAddress={smartWalletAddress}
                    initialToken={selectedToken}
                    fundingType={fundingType}
                    onSuccess={() => fetchWalletInfo(true)}
                />

                {/* Hidden Capture Container (QR) */}
                <div id="qr-capture-container" className="fixed left-[-9999px] top-[-9999px] w-[400px] p-10 flex flex-col items-center justify-center gap-6"
                    style={{ backgroundColor: isLight ? '#ffffff' : '#0a0a0a' }}>
                    <img src={isLight ? "https://15market.com/goblogo.png" : "https://15market.com/gowlogo.png"} className="h-12 w-auto mb-2" alt="Logo" />
                    <p className={`text-sm italic font-black uppercase tracking-widest ${isLight ? 'text-black' : 'text-[#1A6140]'}`}>15market.com</p>
                    <div className={`p-4 rounded-3xl bg-white shadow-xl`}>
                        <img src={qrCodeData} alt="QR" className="w-64 h-64" />
                    </div>
                    <div className="text-center">
                        <p className={`text-[10px] font-black uppercase tracking-[0.2em] mb-2 text-white/40`}>Address ({currentWallet.label})</p>
                        <p className={`text-xs font-black font-mono break-all text-white`}>{currentWallet.key === 'trading' ? walletInfo?.wallet?.address : address}</p>
                    </div>
                </div>
            </motion.div>
        </>
    );
}
