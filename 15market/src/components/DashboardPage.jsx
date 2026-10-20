    const walletCardWidth = isSmallScreen ? 360 : 448;
    const walletCardHeight = isSmallScreen ? 220 : 260;

    const renderWalletCard = (kind) => {
        const isTrading = kind === 'trading';
        const cardAddress = isTrading ? evmSessionWallet?.address : address;
        const cardBalance = isTrading ? sessionBalance : evmBalance;
        return (
        <div
            className={`${isSmallScreen ? 'w-full max-w-[360px]' : 'w-[448px]'} ${isSmallScreen ? 'h-[220px]' : 'h-[260px]'} flex-none relative overflow-hidden group text-white`}
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

            {/* Aurora beam — one soft light segment sweeping the card outline */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 448 260" fill="none">
                <defs>
                    <linearGradient id="aurora-stroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="rgba(126,255,199,0)" />
                        <stop offset="45%" stopColor="rgba(126,255,199,0.95)" />
                        <stop offset="100%" stopColor="rgba(255,255,255,0.95)" />
                    </linearGradient>
                </defs>
                <rect x="3" y="3" width="442" height="254" rx="37" pathLength="100"
                    stroke="url(#aurora-stroke)" strokeWidth="7" strokeDasharray="18 82" className="aurora-dash"
                    style={{ filter: 'blur(5px)', opacity: 0.7, strokeLinecap: 'round' }} />
                <rect x="3" y="3" width="442" height="254" rx="37" pathLength="100"
                    stroke="url(#aurora-stroke)" strokeWidth="2.5" strokeDasharray="18 82" className="aurora-dash"
                    style={{ strokeLinecap: 'round' }} />
            </svg>

            {/* Card Face: all-white brand logo (top-left, level with the NFC icon) ·
                wallet address on the left with its label beneath ·
                username (bottom-left) + balance with bigger numbers (bottom-right) */}
            <div className="h-full flex flex-col justify-between relative z-20 py-4 px-6 md:px-7">

                {/* 15market logo — all white, top-left, shifted upward */}
                <img src="/gowlogo.png" alt="15market" className="h-24 md:h-[120px] w-auto self-start -translate-y-[10%]"
                    style={{ filter: 'brightness(0) invert(1)', opacity: 0.95 }} />

                {/* Wallet address — full address on the left with a copy icon; label beneath */}
                <div className="px-1 min-w-0"
                    onClick={() => { if (cardAddress) { navigator.clipboard.writeText(cardAddress); setToast('Address Copied!'); setTimeout(() => setToast(null), 2000); } }}>
                    <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
                        <p className="text-left text-lg md:text-xl font-black tracking-[0.22em] truncate leading-none">
                            {cardAddress
                                ? truncate(cardAddress).toUpperCase()
                                : (isTrading && isSignerInitializing ? 'SYNCING...' : 'XXXX...XXXX')}
                        </p>
                        <Copy size={13} className="flex-none text-white/70" />
                    </div>
                    <p className="text-left text-[9px] md:text-[10px] italic font-black lowercase tracking-[0.25em] text-white/55 mt-1.5">
                        {isTrading ? 'Trading Wallet' : 'Main Wallet'}
                    </p>
                </div>

                {/* Bottom row: username (left) · balance with bigger numbers, USDC small on its base (right) */}
                <div className="flex items-end justify-between gap-4">
                    <span className="text-2xl md:text-3xl font-black truncate" style={{ fontFamily: 'Sankyu, "sankyu", cursive' }}>{userProfile?.username || 'Trader'}</span>
                    <div className="text-right leading-none shrink-0">
                        <div className="text-[45px] md:text-[72px] font-black tracking-tighter tabular-nums leading-none"
                            style={{ textShadow: '0 6px 24px rgba(0,0,0,0.40)' }}>
                            ${parseFloat(cardBalance || 0).toFixed(2)}
                            <span className="text-[11px] md:text-base ml-1.5 font-bold text-white/70">USDC</span>
                        </div>
                    </div>
                </div>
            </div>

        </div>
        );
    };

    {/* Card deck: trading + main cards side by side on one horizontal slider.
        Both chevrons sit OUTSIDE the card on each side, always visible; mobile
        users can also just swipe left/right between the two cards. */}
    const walletCard = (
        <div className={`relative ${isSmallScreen ? 'w-full max-w-[360px]' : 'w-[448px]'} ${isSmallScreen ? 'h-[220px]' : 'h-[260px]'}`}>
            {/* Carousel chevrons — outside the card */}
            <button onClick={() => setWalletCardSide(walletCardSide === 'trading' ? 'main' : 'trading')} title="Main Wallet card"
                className="absolute top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full flex items-center justify-center bg-[#0b3220]/85 border border-[#1A6140]/40 text-white/90 backdrop-blur-sm[...]
                style={{ left: '-46px', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}>
                <ChevronLeft size={18} />
            </button>
            <button onClick={() => setWalletCardSide(walletCardSide === 'trading' ? 'main' : 'trading')} title="Trading Wallet card"
                className="absolute top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full flex items-center justify-center bg-[#0b3220]/85 border border-[#1A6140]/40 text-white/90 backdrop-blur-sm[...]
                style={{ right: '-46px', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}>
                <ChevronRight size={18} />
            </button>

            {/* Static clip window over the sliding cards — carries the outer glow */}
            <div className={`${isSmallScreen ? 'w-full max-w-[360px]' : 'w-[448px]'} ${isSmallScreen ? 'h-[220px]' : 'h-[260px]'} rounded-[40px] relative overflow-hidden mx-auto`
                style={{ boxShadow: '0 10px 28px rgba(0,0,0,0.50), 0 20px 44px rgba(0,0,0,0.45), 0 10px 30px rgba(20, 241, 149, 0.13)' }}
                onTouchStart={(e) => { touchStartXRef.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                    const startX = touchStartXRef.current;
                    touchStartXRef.current = null;
                    if (startX === null) return;
                    const dx = e.changedTouches[0].clientX - startX;
                    if (dx < -60 && walletCardSide === 'trading') setWalletCardSide('main');
                    else if (dx > 60 && walletCardSide === 'main') setWalletCardSide('trading');
                }}>
                <div
                    className="flex h-full will-change-transform transition-transform duration-700"
                    style={{
                        transform: walletCardSide === 'trading' ? 'translateX(0px)' : `translateX(-${walletCardWidth}px)`,
                        transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.35, 1)'
                    }}>
                    {renderWalletCard('trading')}
                    {renderWalletCard('main')}
                </div>
            </div>
        </div>
    );
