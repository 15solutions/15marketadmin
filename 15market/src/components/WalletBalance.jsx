import { useAccount } from "wagmi";
import { useState, useEffect, useCallback } from "react";
import { KEEPER_URL_ARC } from "../constants";

export function WalletBalance({ theme, balanceOverride, label }) {
    const { isConnected, address } = useAccount();
    const [internalBalance, setInternalBalance] = useState(0);

    // Sync balance with the override passed from UserApp (robust fetch)
    const balance = (balanceOverride !== undefined) ? balanceOverride : internalBalance;

    const refetchEvm = useCallback(async () => {
        if (!address) return;
        try {
            // Use backend proxy for balance check to avoid direct RPC CORS errors
            const res = await fetch(`${KEEPER_URL_ARC}/balance/${address}`);
            if (!res.ok) return;
            const data = await res.json();
            setInternalBalance(parseFloat(data.balance));
        } catch (e) {
            console.error("WalletBalance fetch error:", e);
        }
    }, [address]);

    useEffect(() => {
        refetchEvm();
        if (isConnected && !balanceOverride) {
            // Balance only fetches once on mount if no override is provided.
            // In V2, UserApp provides the override so this is just a safety.
        }
    }, [isConnected, refetchEvm, balanceOverride]);

    if (!isConnected) return null;

    const networkColor = '#1A6140'; // Arc Green

    return (
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border backdrop-blur-xl transition-all duration-300 group hover:scale-105"
            style={{
                backgroundColor: theme === 'light' ? `${networkColor}08` : `${networkColor}15`,
                borderColor: theme === 'light' ? `${networkColor}20` : `${networkColor}30`
            }}>

            <div className={`w-1.5 h-1.5 rounded-full animate-pulse`} 
                style={{ backgroundColor: theme === 'light' ? '#1A6140' : '#facc15', boxShadow: `0 0 8px ${theme === 'light' ? '#1A6140' : '#facc15'}60` }} 
            />

            <span className={`text-[10px] font-bold font-mono tracking-wide ${theme === 'light' ? 'text-black' : 'text-white'}`}>
                {label && <span className="opacity-40 mr-1">{label}:</span>}
                {balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDC
            </span>
        </div>
    );
};
