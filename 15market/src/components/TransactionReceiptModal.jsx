import React, { useRef } from 'react';
import { toPng } from 'html-to-image';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, ExternalLink } from 'lucide-react';
import { Stamp } from './Stamp';

export function TransactionReceiptModal({ isOpen, onClose, transaction }) {
    const cardRef = useRef(null);

    if (!transaction || !isOpen) return null;

    const handleDownload = async () => {
        if (cardRef.current === null) return;
        try {
            const buttons = cardRef.current.querySelectorAll('.receipt-control');
            buttons.forEach(b => b.style.opacity = '0');

            const dataUrl = await toPng(cardRef.current, {
                cacheBust: true,
                quality: 1,
                backgroundColor: 'transparent'
            });

            buttons.forEach(b => b.style.opacity = '1');

            const link = document.createElement('a');
            link.download = `15market-${transaction.type}-${transaction.timestamp}.png`;
            link.href = dataUrl;
            link.click();
        } catch (err) {
            console.error('Failed to download image:', err);
        }
    };

    const isDeposit = transaction.type === 'DEPOSIT';
    const side = transaction.direction === 'UP' || transaction.direction === 1 || String(transaction.direction) === '1' ? 'LONG' : 'SHORT';
    const isWon = transaction.status === 'WON' || transaction.status === 'PAID';
    const isLost = transaction.status === 'LOST';

    // Generate jagged bottom path
    let jaggedPath = '';
    const points = 16;
    const width = 320;
    const segment = width / points;
    for (let i = 0; i <= points; i++) {
        const x = width - (i * segment);
        const y = i === 0 || i === points ? 450 : (i % 2 === 1 ? 456 : 450);
        jaggedPath += `L ${x} ${y} `;
    }

    return (
        <AnimatePresence>
            <div
                onClick={onClose}
                className="fixed inset-0 z-[200] flex items-center justify-center p-4 backdrop-blur-md bg-black/30 cursor-pointer overflow-y-auto"
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.9, y: 20 }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative w-full max-w-[320px] cursor-default my-auto drop-shadow-2xl"
                >
                    <div ref={cardRef} className="relative w-full bg-transparent" style={{ minHeight: '460px' }}>
                        
                        {/* SVG Ticket Background */}
                        <svg className="absolute inset-0 w-full h-full drop-shadow-lg" preserveAspectRatio="none" viewBox="0 0 320 456" style={{ filter: 'drop-shadow(0px 10px 20px rgba(0,0,0,0.25))' }}>
                            <path 
                                d={`M 16 0 
                                    L 100 0 
                                    C 110 0 115 12 125 12 
                                    L 195 12 
                                    C 205 12 210 0 220 0 
                                    L 304 0 
                                    C 312.837 0 320 7.163 320 16 
                                    L 320 450 
                                    ${jaggedPath}
                                    L 0 450 
                                    L 0 16 
                                    C 0 7.163 7.163 0 16 0 Z`} 
                                fill="#f4f5f5" 
                                stroke="#1A6140" 
                                strokeWidth="2.5"
                                strokeLinejoin="round"
                            />
                        </svg>

                        {/* Watermarks */}
                        <div className="absolute inset-0 pointer-events-none opacity-[0.08] mix-blend-multiply" 
                             style={{ 
                                 backgroundImage: `url('/goblogo.png')`, 
                                 backgroundSize: '40px 40px', 
                                 backgroundRepeat: 'repeat',
                                 transform: 'rotate(-20deg) scale(1.5)', 
                                 filter: 'grayscale(100%)',
                                 clipPath: 'inset(16px 2px 10px 2px)'
                             }} />

                        {/* Content Container */}
                        <div className="relative z-10 flex flex-col p-6 pt-6 pb-6 text-[#1a1a1a] font-mono h-full">
                            
                            {/* Header */}
                            <div className="flex flex-col items-center mb-4">
                                <img src="/goblogo.png" alt="15market" className="h-16 w-auto mb-3 drop-shadow-sm" />
                                
                                <div className="w-full border-t border-dashed border-black/20 my-0" />
                                <div className="flex justify-between w-full mt-3 text-[10px] font-black tracking-widest text-black/80 uppercase">
                                    <span className="opacity-50">NETWORK:</span> <span className="text-[#1A6140]">ARC TESTNET</span>
                                </div>
                                <div className="w-full border-t border-dashed border-black/20 mt-3" />
                            </div>

                            {/* Info Rows */}
                            <div className="space-y-2 text-[10px] font-bold text-black/80 w-full mb-4">
                                <div className="flex justify-between w-full">
                                    <span className="opacity-50 uppercase">TX_REF:</span>
                                    <span>{transaction.tx ? `0x${transaction.tx.slice(2, 8)}...${transaction.tx.slice(-6)}` : 'PENDING'}</span>
                                </div>
                                <div className="flex justify-between w-full">
                                    <span className="opacity-50 uppercase">TIMESTAMP:</span>
                                    <span>{new Date(transaction.timestamp).toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between w-full">
                                    <span className="opacity-50 uppercase">ASSET PAIR:</span>
                                    <span>{transaction.symbol ? `${transaction.symbol.toUpperCase()} // USD` : 'ETH // USD'}</span>
                                </div>
                                <div className="flex justify-between w-full">
                                    <span className="opacity-50 uppercase">DIRECTION:</span>
                                    <span>{side === 'LONG' ? 'LONG (YES)' : 'SHORT (NO)'}</span>
                                </div>
                                {(() => {
                                    const getMultiplier = (d) => { if (d === 5) return 2.90; if (d === 10) return 2.40; return 1.90; };
                                    const mult = getMultiplier(transaction.duration || 15);
                                    const payout = transaction.payout ? parseFloat(transaction.payout) : (parseFloat(transaction.amount) * mult);
                                    const shares = payout;
                                    const sharePr = shares > 0 ? (parseFloat(transaction.amount) / shares) : 0;
                                    const profit = isWon ? (payout - parseFloat(transaction.amount)) : 0;
                                    const isMon = (transaction.symbol || '').toUpperCase() === 'MON';
                                    const isAvax = (transaction.symbol || '').toUpperCase() === 'AVAX';
                                    const settleDecimals = isMon ? 6 : isAvax ? 4 : 2;
                                    return (
                                        <>
                                            <div className="flex justify-between w-full">
                                                <span className="opacity-50 uppercase">SHARE PRICE @ ENTRY:</span>
                                                <span>{Math.round(sharePr * 100)}¢</span>
                                            </div>
                                            <div className="flex justify-between w-full">
                                                <span className="opacity-50 uppercase">SHARES BOUGHT:</span>
                                                <span>{shares.toFixed(settleDecimals)}</span>
                                            </div>
                                            <div className="flex justify-between w-full">
                                                <span className="opacity-50 uppercase">TOTAL:</span>
                                                <span>${Number(transaction.amount).toFixed(2)}</span>
                                            </div>
                                            <div className="flex justify-between w-full">
                                                <span className="opacity-50 uppercase">TRADE PROFIT:</span>
                                                <span className={isWon ? 'text-[#1A6140]' : 'opacity-60'}>${profit.toFixed(settleDecimals)}</span>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>

                            <div className="w-full border-t border-dashed border-black/20 mb-4" />

                            {/* Trade Details */}
                            <div className="w-full grid grid-cols-2 gap-y-6 relative mb-8">
                                <div className="flex flex-col">
                                    <span className="text-[9px] opacity-50 font-black tracking-widest uppercase mb-1">ENTRY</span>
                                    <span className="text-base font-black tracking-widest" style={{ fontFamily: '"Comfortaa", cursive' }}>${Number(transaction.entryPrice || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex flex-col items-end text-right">
                                    <span className="text-[9px] opacity-50 font-black tracking-widest uppercase mb-1">STAKE</span>
                                    <span className="text-base font-black tracking-widest" style={{ fontFamily: '"Comfortaa", cursive' }}>{Number(transaction.amount || 0).toFixed(2)} USDC</span>
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[9px] opacity-50 font-black tracking-widest uppercase mb-1">EXIT</span>
                                    <span className="text-base font-black tracking-widest" style={{ fontFamily: '"Comfortaa", cursive' }}>${Number(transaction.exitPrice || 0).toFixed(2)}</span>
                                </div>
                                <div className="flex flex-col items-end text-right">
                                    <span className="text-[9px] opacity-50 font-black tracking-widest uppercase mb-1">PNL</span>
                                    <span className={`text-sm font-black tracking-widest ${isWon ? 'text-[#1A6140]' : isLost ? 'text-[#FF7F50]' : 'text-black/60'}`} style={{ fontFamily: '"Comfortaa", cursive' }}>
                                        {isWon ? '+' : isLost ? '▼ -' : ''}{Number(transaction.payout || transaction.amount || 0).toFixed(2)} <span className="text-[8px]">USDC</span>
                                    </span>
                                </div>

                                {/* Stamp Overlay */}
                                {(isWon || isLost) && (
                                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-[40%] z-[20] pointer-events-none opacity-90 scale-[1.3] rotate-[-5deg]">
                                        <Stamp status={transaction.status} isWon={isWon} size="lg" />
                                    </div>
                                )}
                            </div>

                            {/* Buttons */}
                            <div className="w-full grid grid-cols-2 gap-3 mt-auto receipt-control">
                                <button
                                    onClick={handleDownload}
                                    className="py-3 bg-[#1A6140] text-white text-[9px] font-black uppercase tracking-widest rounded flex items-center justify-center gap-2 hover:bg-[#1A6140] transition-all shadow-md"
                                >
                                    <Download size={14} />
                                    SAVE IMAGE
                                </button>
                                <button
                                    onClick={onClose}
                                    className="py-3 bg-transparent text-[#1A6140] border border-[#1A6140] text-[9px] font-black uppercase tracking-widest rounded flex items-center justify-center gap-2 hover:bg-[#1A6140]/5 transition-all"
                                >
                                    <X size={14} />
                                    CLOSE VIEW
                                </button>
                            </div>

                            <span className="text-[10px] font-black tracking-widest text-black/80 text-center mt-5 block">#{transaction.id || transaction.nonce || ''}</span>

                            <p className="text-[7px] text-black/50 text-center font-black tracking-widest leading-loose mt-3">
                                TRADING_RECEIPT // 15MARKET_PROTOCOL<br />
                                0xDE738...BLOCK_VERIFIED
                            </p>
                        </div>
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
};
