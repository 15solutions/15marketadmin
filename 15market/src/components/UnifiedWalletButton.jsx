import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

// Visible fallback: if the auth page ever throws on mount, show the error
// instead of swallowing the click into silence.
class AuthPageErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
        return { error };
    }
    componentDidCatch(error) {
        console.error('[Auth] page crashed on open:', error);
    }
    render() {
        if (this.state.error) {
            return (
                <div className="fixed inset-0 z-[600] flex flex-col items-center justify-center gap-3 bg-black text-white p-6 text-center" style={{ fontFamily: '"Comfortaa", cursive' }}>
                    <div className="text-sm font-black">Sign-in screen failed to open</div>
                    <div className="text-[11px] opacity-60 break-all max-w-md">{String(this.state.error?.message || this.state.error)}</div>
                    <button onClick={this.props.onClose} className="mt-2 px-6 py-3 rounded-2xl bg-[#17A364] text-white text-xs font-black uppercase tracking-widest">Close</button>
                </div>
            );
        }
        return this.props.children;
    }
}
import { useAccount, useDisconnect, useChainId, useSwitchChain } from 'wagmi';
import { usePrivy } from '@privy-io/react-auth';
import { ARC_CHAIN_ID } from '../constants';
import { useTradingWallet } from '../hooks/useTradingWallet';
import { LogOut } from 'lucide-react';
import { BrandedAuthPage } from './BrandedAuthPage';


export function UnifiedWalletButton({ theme }) {
    const { address, isConnected } = useAccount();
    const connectedChainId = useChainId();
    const { disconnect } = useDisconnect();
    const { switchChain } = useSwitchChain();
    const { logout, authenticated, user, ready } = usePrivy();
    const { isSmartWalletReady } = useTradingWallet();
    // Fully branded fullscreen auth pages (headless Privy) instead of the
    // default Privy modal. Two buttons: Login lands on the login page,
    // Signup lands on country-first registration.
    const [authStep, setAuthStep] = useState(null); // null | 'login' | 'signup'
    
    // Auto-switch to Arc Testnet if wallet is on any other network
    useEffect(() => {
        if (isConnected && connectedChainId && connectedChainId !== ARC_CHAIN_ID) {
            console.log(`🔄 [NETWORK] Wallet on chain ${connectedChainId}, auto-switching to Arc Testnet (${ARC_CHAIN_ID})...`);
            switchChain?.({ chainId: ARC_CHAIN_ID });
        }
    }, [isConnected, connectedChainId, switchChain]);

    const currentColor = '#17A364';

    const greenBtn = {
        backgroundColor: '#17A364',
        boxShadow: `0 0 20px #17A36450`,
        fontFamily: '"Comfortaa", cursive',
    };
    const ghostBtn = {
        fontFamily: '"Comfortaa", cursive',
    };

    const handleLogout = async () => {
        try {
            await logout();
            disconnect();
            console.log("🚪 [WALLET] Disconnected");
        } catch (err) {
            console.error("Disconnect failed:", err);
        }
    };

    // Use Privy's authenticated state or Wagmi's isConnected
    const isActuallyConnected = isConnected || authenticated;

    // Privy rehydrates its session out of localStorage asynchronously, and wagmi
    // reconnects on its own schedule. Until BOTH have settled, `authenticated`
    // and `isConnected` are both false — indistinguishable from a signed-out
    // user. Wait for `ready` and hold an inert placeholder of the same
    // footprint so there is no layout shift — unless the auth page is open,
    // which must survive every connection flip below.
    if (!ready && !authStep) {
        return (
            <div
                aria-hidden="true"
                className="w-[70px] h-[34px] lg:w-[92px] lg:h-[42px] rounded-xl bg-white/5 border border-white/10 animate-pulse"
            />
        );
    }

    // The auth page lives OUTSIDE the connected/logged-out branches: a wagmi
    // auto-reconnect landing mid-tap used to flip this component to the
    // logout view and unmount the page instantly — a tap that visibly does
    // nothing. Only the page itself closes it (back, close, or Privy login).
    return (
        <>
            {!isActuallyConnected ? (
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { console.log('[Auth] login tapped'); setAuthStep('login'); }}
                        id="login-btn"
                        className={`px-4 lg:px-6 py-2.5 lg:py-3 font-black uppercase text-[10px] lg:text-xs tracking-[0.2em] rounded-xl transition-all active:scale-95 relative overflow-hidden group border-2 ${theme === 'light' ? 'border-[#17A364] text-[#17A364] hover:bg-[#17A364]/10' : 'border-white/25 text-white hover:border-white/60'}`}
                        style={ghostBtn}
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            Login
                        </span>
                    </button>
                    <button
                        onClick={() => { console.log('[Auth] signup tapped'); setAuthStep('signup'); }}
                        id="signup-btn"
                        className="px-4 lg:px-8 py-2.5 lg:py-3 font-black uppercase text-[10px] lg:text-xs tracking-[0.2em] rounded-xl transition-all active:scale-95 text-white relative overflow-hidden group shadow-xl"
                        style={greenBtn}
                    >
                        <span className="relative z-10 flex items-center gap-2">
                            Signup
                        </span>
                    </button>
                </div>
            ) : (
                <button
                    onClick={handleLogout}
                    title="Click to Disconnect"
                    id="disconnect-wallet-btn"
                    className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 group cursor-pointer ${
                        theme === 'light'
                            ? 'border-[#E5E7EB] hover:bg-red-50 hover:border-red-200'
                            : 'border-white/10 hover:bg-red-500/10 hover:border-red-500/30'
                    }`}
                >
                    {isSmartWalletReady && (
                        <div className="absolute top-0 right-0 w-2 h-2 bg-yellow-400 rounded-full border border-[#0D0D0D] shadow-sm" title="Smart Wallet Active"></div>
                    )}
                    <LogOut size={14} className={`transition-colors ${theme === 'light' ? 'text-gray-400 group-hover:text-red-500' : 'text-white/40 group-hover:text-red-500'}`} />
                </button>
            )}
            {authStep && typeof document !== 'undefined' && createPortal(
                <AuthPageErrorBoundary key={authStep} onClose={() => setAuthStep(null)}>
                    <BrandedAuthPage
                        theme={theme}
                        initialStep={authStep}
                        onClose={() => setAuthStep(null)}
                        onAuthenticated={() => setAuthStep(null)}
                    />
                </AuthPageErrorBoundary>,
                document.body
            )}
        </>
    );
}

