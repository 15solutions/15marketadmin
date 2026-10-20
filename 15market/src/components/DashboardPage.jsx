    const walletCard = (
        <div className={`relative ${isSmallScreen ? 'w-full max-w-[360px]' : 'w-[448px]'} ${isSmallScreen ? 'h-[220px]' : 'h-[260px]'}`}>
            {/* Carousel chevrons — outside the card */}
            <button onClick={() => setWalletCardSide(walletCardSide === 'trading' ? 'main' : 'trading')} title="Main Wallet card"
                className="absolute top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full flex items-center justify-center bg-[#0b3220]/85 border border-[#1A6140]/40 text-white/90 backdrop-blur-sm"
                style={{ left: '-46px', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}>
                <ChevronLeft size={18} />
            </button>
            <button onClick={() => setWalletCardSide(walletCardSide === 'trading' ? 'main' : 'trading')} title="Trading Wallet card"
                className="absolute top-1/2 -translate-y-1/2 z-40 w-10 h-10 rounded-full flex items-center justify-center bg-[#0b3220]/85 border border-[#1A6140]/40 text-white/90 backdrop-blur-sm"
                style={{ right: '-46px', boxShadow: '0 10px 28px rgba(0,0,0,0.45)' }}>
                <ChevronRight size={18} />
            </button>

            {/* Static clip window over the sliding cards — carries the outer glow */}
            <div
                className={`${isSmallScreen ? 'w-full max-w-[360px]' : 'w-[448px]'} ${isSmallScreen ? 'h-[220px]' : 'h-[260px]'} rounded-[40px] relative overflow-hidden mx-auto`}
                style={{ boxShadow: '0 10px 28px rgba(0,0,0,0.50), 0 20px 44px rgba(0,0,0,0.45), 0 10px 30px rgba(20, 241, 149, 0.13)' }}
                onTouchStart={(e) => { touchStartXRef.current = e.touches[0].clientX; }}
                onTouchEnd={(e) => {
                    const startX = touchStartXRef.current;
                    touchStartXRef.current = null;
                    if (startX === null) return;
                    const dx = e.changedTouches[0].clientX - startX;
                    if (dx < -60 && walletCardSide === 'trading') setWalletCardSide('main');
                    else if (dx > 60 && walletCardSide === 'main') setWalletCardSide('trading');
                }}
            >
                <div
                    className="flex h-full will-change-transform transition-transform duration-700"
                    style={{
                        transform: walletCardSide === 'trading' ? 'translateX(0px)' : `translateX(-${walletCardWidth}px)`,
                        transitionTimingFunction: 'cubic-bezier(0.25, 1, 0.35, 1)'
                    }}
                >
                    {renderWalletCard('trading')}
                    {renderWalletCard('main')}
                </div>
            </div>
        </div>
    );
