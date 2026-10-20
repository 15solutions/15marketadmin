require('dotenv').config();
const axios = require('axios');
const { ethers } = require('ethers');
const config = require('../config');
const profiles = require('../profiles');
const notificationService = require('./notificationService');
const rpc = require('../rpc');

// Circle IRIS Attestation API V2 (testnet sandbox)
// V2 endpoint: GET /v2/messages/{sourceDomain}?transactionHash={txHash}
// Returns: { messages: [{ status, message, attestation }] }
const IRIS_API_BASE = 'https://iris-api-sandbox.circle.com';

/**
 * CCTP V2 Testnet Chain Config
 * All cross-chain USDC deposits are routed to Arc Testnet (Domain 26).
 * Source chains burn USDC via their TokenMessenger.
 * Recipient is the session wallet address on Arc.
 *
 * IMPORTANT: All addresses are CCTP V2 testnet addresses.
 * TokenMessenger  V2: 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA (all chains)
 * MessageTransmitter V2: 0xE737e5CEBEEBa77EFE34D4aa090756590b1CE275 (all chains)
 */
const CCTP_CHAINS = {
    // Ethereum Sepolia (domain 0)
    '11155111': {
        name: 'Ethereum Sepolia',
        domain: 0,
        rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
        tokenMessenger: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
        messageTransmitter: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
        usdc: '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238',
        defaultDest: '5042002'
    },
    // Avalanche Fuji (domain 1)
    '43113': {
        name: 'Avalanche Fuji',
        domain: 1,
        rpc: 'https://avalanche-fuji-c-chain-rpc.publicnode.com',
        tokenMessenger: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
        messageTransmitter: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
        usdc: '0x5425890298aed601595a70ab815c96711a31bc65',
        defaultDest: '5042002'
    },
    // OP Sepolia (domain 2)
    '11155420': {
        name: 'OP Sepolia',
        domain: 2,
        rpc: 'https://sepolia.optimism.io',
        tokenMessenger: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
        messageTransmitter: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
        usdc: '0x5fd84259d66cd46123540766be93dfe6d43130d7',
        defaultDest: '5042002'
    },
    // Base Sepolia (domain 6)
    '84532': {
        name: 'Base Sepolia',
        domain: 6,
        rpc: 'https://sepolia.base.org',
        tokenMessenger: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
        messageTransmitter: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
        usdc: '0x036cbd53842c5426634e7929541ec2318f3dcf7e',
        defaultDest: '5042002'
    },
    // Monad Testnet (domain 15)
    '10143': {
        name: 'Monad Testnet',
        domain: 15,
        rpc: 'https://testnet-rpc.monad.xyz/',
        tokenMessenger: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
        messageTransmitter: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
        usdc: '0x534b2f3a21130d7a60830c2df862319e593943a3',
        defaultDest: '5042002'
    },
    // Destination Arc testnet (domain 26)
    '5042002': {
        name: 'Arc Testnet',
        domain: 26,
        rpc: 'https://rpc.testnet.arc.io',
        tokenMessenger: '0x8fe6b999dc680ccfdd5bf7eb0974218be2542daa',
        messageTransmitter: '0xe737e5cebeeba77efe34d4aa090756590b1ce275',
        usdc: '0x3600000000000000000000000000000000000000'
    }
};

/**
 * FundingService
 * Handles multi-token funding quotes, CCTP burn/mint relay, and balance crediting.
 */
class FundingService {
    constructor() {
        this.spread = 0.005;    // 0.5% exchange rate spread
        this.fundingFee = 0.01; // 1% platform funding fee

        // Pre-warm relayer wallets for destination chains (specifically Arc Testnet)
        this.destWallets = {};
        this.destProviders = {};
        try {
            const pk = process.env.RELAYER_PRIVATE_KEY || process.env.PRIVATE_KEY || process.env.SESSION_MASTER_SECRET;
            if (pk) {
                const normalizedPk = pk.startsWith('0x') ? pk : `0x${pk}`;
                for (const [chainId, chainCfg] of Object.entries(CCTP_CHAINS)) {
                    const p = new ethers.JsonRpcProvider(chainCfg.rpc);
                    this.destProviders[chainId] = p;
                    this.destWallets[chainId] = new ethers.Wallet(normalizedPk, p);
                }
                const sampleAddr = this.destWallets['5042002']?.address || Object.values(this.destWallets)[0]?.address;
                console.log(`[CCTP-Relayer] Warmed up for ${Object.keys(CCTP_CHAINS).length} chains. Relayer: ${sampleAddr}`);
            } else {
                console.warn('[CCTP-Relayer] No RELAYER_PRIVATE_KEY found. Auto-relay will be skipped.');
            }
        } catch (e) {
            console.error('[CCTP-Relayer] Warm-up failed:', e.message);
        }
    }

    /**
     * Returns a simple funding quote.
     */
    async getQuote(fromToken, amount) {
        const mockPrices = { 'ETH': 3500, 'AVAX': 35, 'MON': 2.5, 'USDC': 1, 'SOL': 150 };
        const price = mockPrices[fromToken.toUpperCase()] || 1;
        const rawUsdc = amount * price;
        const fee = rawUsdc * this.fundingFee;
        const estimatedUsdc = (rawUsdc - fee).toFixed(2);
        return { estimatedUsdc, fee: fee.toFixed(2), price };
    }

    /**
     * Estimates the gas fee in USDC for an EIP-2612 permit + bridge flow.
     */
    async getPermitBridgeQuote(sourceChain, amount) {
        const chainIdMap = {
            'mon': '10143',
            'avax': '43113',
            'eth': '11155111'
        };
        const chainId = chainIdMap[sourceChain.toLowerCase()] || sourceChain;
        const chainCfg = CCTP_CHAINS[chainId];
        if (!chainCfg) throw new Error(`Unsupported source chain: ${sourceChain}`);

        const provider = this.destProviders[chainId] || new ethers.JsonRpcProvider(chainCfg.rpc);
        const relayerWallet = this.destWallets[chainId];
        const relayerAddress = relayerWallet ? relayerWallet.address : '0x0000000000000000000000000000000000000000';

        // 1. Fetch current gas price dynamically
        let gasPrice = 50000000000n; // Default 50 Gwei
        try {
            const feeData = await provider.getFeeData();
            if (feeData && feeData.gasPrice) {
                gasPrice = feeData.gasPrice;
            }
        } catch (e) {
            console.warn(`[getPermitBridgeQuote] Failed to get gas price, using default 50 Gwei: ${e.message}`);
        }

        // 2. Compute native token gas cost
        // Estimate 300,000 gas units for permit + transferFrom + depositForBurn on source
        const gasUsed = 300000n;
        const nativeGasCostWei = gasUsed * gasPrice;
        const nativeGasCostEth = parseFloat(ethers.formatEther(nativeGasCostWei));

        // 3. Convert to USDC
        const nativePrices = {
            '10143': 2.5,     // MON
            '43113': 35.0,    // AVAX
            '11155111': 3500.0 // ETH
        };
        const nativePrice = nativePrices[chainId] || 1.0;
        const rawGasFeeUsdc = nativeGasCostEth * nativePrice;

        // Apply 1.3x safety buffer + 0.05 USDC minimum floor to cover relayer overhead
        let gasFeesUsdc = rawGasFeeUsdc * 1.3;
        if (gasFeesUsdc < 0.05) {
            gasFeesUsdc = 0.05;
        }
        gasFeesUsdc = parseFloat(gasFeesUsdc.toFixed(4));

        const netAmount = parseFloat((amount - gasFeesUsdc).toFixed(4));
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour deadline

        return {
            relayerAddress,
            gasFeesUsdc,
            netAmount,
            deadline
        };
    }

    /**
     * Executes the EIP-2612 permit-based cross-chain bridge transaction flow.
     */
    async executePermitBridge(userAddr, sourceChain, amount, userAddress, permit, destMintRecipient, io) {
        const chainIdMap = {
            'mon': '10143',
            'avax': '43113',
            'eth': '11155111'
        };
        const chainId = chainIdMap[sourceChain.toLowerCase()] || sourceChain;
        const chainCfg = CCTP_CHAINS[chainId];
        if (!chainCfg) throw new Error(`Unsupported source chain: ${sourceChain}`);

        const relayerWallet = this.destWallets[chainId];
        if (!relayerWallet) throw new Error(`No relayer configured for chain ${sourceChain}`);

        console.log(`[Permit-Bridge] Initiating for user ${userAddr} from ${chainCfg.name}. Amount: ${amount} USDC`);

        // Trigger CCTP Initiated notification
        notificationService.notifyUser(
            userAddr,
            "CCTP Bridge Initiated",
            `Started bridging ${amount} USDC from ${chainCfg.name} to Arc Testnet. Gas fees paid by platform gas relayer.`,
            "info"
        );

        // Compute quote again on-chain for fee logic
        const quote = await this.getPermitBridgeQuote(sourceChain, amount);
        if (quote.netAmount <= 0) {
            throw new Error(`Amount of ${amount} USDC too small to cover gas fees of ${quote.gasFeesUsdc} USDC`);
        }

        const amountRaw = BigInt(Math.round(amount * 1e6));
        const netAmountRaw = BigInt(Math.round(quote.netAmount * 1e6));

        const usdcAbi = [
            'function nonces(address owner) external view returns (uint256)',
            'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
            'function transferFrom(address from, address to, uint256 value) external returns (bool)',
            'function allowance(address owner, address spender) external view returns (uint256)'
        ];
        const usdcContract = new ethers.Contract(chainCfg.usdc, usdcAbi, relayerWallet);

        // Step 1: Submit permit transaction (if signature is provided and not already approved)
        if (permit && permit.v !== undefined) {
            const currentAllowance = await usdcContract.allowance(userAddress, relayerWallet.address);
            if (currentAllowance < amountRaw) {
                console.log(`[Permit-Bridge] Submitting EIP-2612 permit for ${userAddress} spender ${relayerWallet.address}...`);
                const txPermit = await usdcContract.permit(
                    userAddress,
                    relayerWallet.address,
                    amountRaw,
                    permit.deadline,
                    permit.v,
                    permit.r,
                    permit.s
                );
                await txPermit.wait(1);
                console.log(`[Permit-Bridge] Permit transaction success: ${txPermit.hash}`);
            } else {
                console.log(`[Permit-Bridge] Existing allowance ${ethers.formatUnits(currentAllowance, 6)} is sufficient. Skipping permit.`);
            }
        }

        // Step-2: Transfer USDC from user's wallet to the relayer
        console.log(`[Permit-Bridge] Calling transferFrom for ${amount} USDC from ${userAddress} to relayer...`);
        let txTransfer;
        let transferRetries = 3;
        while (transferRetries > 0) {
            try {
                txTransfer = await usdcContract.transferFrom(userAddress, relayerWallet.address, amountRaw);
                const transferReceipt = await rpc.waitForReceipt(txTransfer.hash);
                if (!transferReceipt || transferReceipt.status !== 1) throw new Error('transferFrom reverted on-chain');
                console.log(`[Permit-Bridge] transferFrom transaction success: ${txTransfer.hash}`);
                break;
            } catch (err) {
                console.error(`[Permit-Bridge] transferFrom error: ${err.message}. Retries left: ${transferRetries - 1}`);
                transferRetries--;
                if (transferRetries === 0) throw err;
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Step 3: Approve CCTP TokenMessenger to spend the USDC on behalf of the relayer
        const usdcStandardAbi = [
            'function approve(address spender, uint256 value) external returns (bool)',
            'function allowance(address owner, address spender) external view returns (uint256)'
        ];
        const usdcWithStandardAbi = new ethers.Contract(chainCfg.usdc, usdcStandardAbi, relayerWallet);
        const tokenMessengerAllowance = await usdcWithStandardAbi.allowance(relayerWallet.address, chainCfg.tokenMessenger);
        if (tokenMessengerAllowance < netAmountRaw) {
            console.log(`[Permit-Bridge] Approving CCTP TokenMessenger (${chainCfg.tokenMessenger}) for ${quote.netAmount} USDC...`);
            let txApprove;
            let approveRetries = 3;
            while (approveRetries > 0) {
                try {
                    txApprove = await usdcWithStandardAbi.approve(chainCfg.tokenMessenger, netAmountRaw);
                    const approveReceipt = await rpc.waitForReceipt(txApprove.hash);
                    if (!approveReceipt || approveReceipt.status !== 1) throw new Error('approve reverted on-chain');
                    break;
                } catch (err) {
                    console.error(`[Permit-Bridge] approve error: ${err.message}. Retries left: ${approveRetries - 1}`);
                    approveRetries--;
                    if (approveRetries === 0) throw err;
                    await new Promise(r => setTimeout(r, 2000));
                }
            }
        }

        // Step 4: Burn USDC via CCTP TokenMessenger
        console.log(`[Permit-Bridge] Calling depositForBurn for ${quote.netAmount} USDC recipient ${destMintRecipient}...`);
        const tokenMessengerAbi = [
            'function depositForBurn(uint256 amount, uint32 destinationDomain, bytes32 mintRecipient, address burnToken, bytes32 hookData, uint256 maxFee, uint32 finalityThreshold) external returns (uint64)'
        ];
        const tokenMessenger = new ethers.Contract(chainCfg.tokenMessenger, tokenMessengerAbi, relayerWallet);
        const recipientBytes32 = ethers.zeroPadValue(destMintRecipient, 32);
        
        const destDomain = 26; // Arc Testnet CCTP domain is always 26
        const BYTES32_ZERO = '0x0000000000000000000000000000000000000000000000000000000000000000';
        let txBurn, burnReceipt;
        let retries = 3;
        while (retries > 0) {
            try {
                txBurn = await tokenMessenger.depositForBurn(
                    netAmountRaw,
                    destDomain,
                    recipientBytes32,
                    chainCfg.usdc,
                    BYTES32_ZERO,
                    0n,
                    2000
                );
                burnReceipt = await rpc.waitForReceipt(txBurn.hash);
                if (!burnReceipt || burnReceipt.status !== 1) throw new Error('depositForBurn reverted on-chain');
                console.log(`[Permit-Bridge] depositForBurn transaction success: ${txBurn.hash}`);
                break;
            } catch (err) {
                console.error(`[Permit-Bridge] depositForBurn error: ${err.message}. Retries left: ${retries - 1}`);
                retries--;
                if (retries === 0) throw err;
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // Step 5: Start asynchronous monitoring of CCTP burn and settlement on Arc Testnet
        this.monitorAndSettleCCTP(userAddr, txBurn.hash, chainId, quote.netAmount, '5042002', io);

        return {
            success: true,
            txHash: txBurn.hash,
            netAmount: quote.netAmount
        };
    }


    deriveSessionAddress(userAddr) {
        const MASTER_SECRET = process.env.SESSION_MASTER_SECRET;
        if (!MASTER_SECRET) {
            throw new Error('[SessionWallet] SESSION_MASTER_SECRET is not set. This variable is REQUIRED — no hardcoded default. Set it in the deployment environment (Render) or a local .env.');
        }
        const entropy = ethers.toUtf8Bytes(MASTER_SECRET + userAddr.toLowerCase());
        const privateKey = ethers.keccak256(entropy);
        const wallet = new ethers.Wallet(privateKey);
        return wallet.address;
    }

    /**
     * Credits a user's platform trading balance (in-memory + DB).
     *
     * Every caller of this method is crediting a deposit whose USDC has
     * already arrived in the session wallet on-chain. chainReconciler watches
     * that same on-chain balance to catch deposits that bypassed the app
     * entirely, so it must be told to move its baseline by the same amount —
     * otherwise it would credit these deposits a second time.
     */
    async creditTradingWallet(userAddr, amount, txHash) {
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) return { success: false, error: 'Invalid amount' };

        const addr = userAddr.toLowerCase();
        console.log(`[FundingService] Crediting ${amountNum} USDC to ${addr} (tx: ${txHash})`);

        // Keep the reconciliation baseline in step with the on-chain inflow
        // this credit represents. Done first so a crash mid-credit cannot leave
        // the baseline permanently ahead of the chain.
        try {
            require('./chainReconciler').advanceBaselineForCreditedDeposit(addr, amountNum);
        } catch (reconErr) {
            console.warn('[FundingService] baseline advance failed:', reconErr.message);
        }

        let newBalance = amountNum;

        try {
            const cache = require('../cache');
            const profiles = require('../profiles');

            // 1. Update in-memory session cache (for live balance display)
            let session = cache.sessions.get(addr);
            if (session) {
                session.balance = Number((session.balance + amountNum).toFixed(4));
                newBalance = session.balance;
                console.log(`[FundingService] Session cache updated: ${addr} → ${newBalance} USDC`);
            } else {
                session = cache.getOrCreateSession(addr, {
                    identityKey: addr,
                    walletAddress: addr,
                    sessionAddress: addr,
                    balance: amountNum
                });
                console.log(`[FundingService] New session created for ${addr} with ${amountNum} USDC`);
            }

            // 2. Persist to profiles store (survives server restarts + Redis sync)
            try {
                const existing = profiles.get(addr);
                const currentBal = parseFloat(existing?.balance || 0);
                newBalance = Number((currentBal + amountNum).toFixed(4));
                profiles.upsert(addr, { balance: newBalance });
                // Also sync session cache to match persisted value
                if (session) session.balance = newBalance;
                console.log(`[FundingService] Profile persisted: ${addr} → ${newBalance} USDC`);
            } catch (profileErr) {
                console.warn(`[FundingService] Profile upsert failed (non-fatal): ${profileErr.message}`);
            }

        } catch (e) {
            console.warn(`[FundingService] Credit error (non-fatal): ${e.message}`);
        }

        return { success: true, credited: amountNum, newBalance, txHash };
    }

    async distributeFees(amount) {
        console.log(`[Nanopayments] Streaming ${amount.toFixed(6)} USDC to Treasury`);
    }

    /**
     * Core CCTP Relay: Monitor a burn tx, get attestation from IRIS, and
     * execute receiveMessage on the CORRECT destination chain.
     *
     * @param {string} userAddr       - User's platform address
     * @param {string} txHash         - Burn transaction hash on source chain
     * @param {string} fromChainId    - Source chain ID (e.g. '11155111' for Sepolia)
     * @param {string} amount         - USDC amount credited to user
     * @param {string} destChainId    - Destination chain ID (always '5042002' for Arc CCTP)
     */
    async monitorAndSettleCCTP(userAddr, txHash, fromChainId, amount, destChainId, io) {
        const sourceConfig = CCTP_CHAINS[fromChainId];
        if (!sourceConfig) {
            console.error(`[CCTP-Relayer] Unsupported source chain: ${fromChainId}`);
            return;
        }

        // Resolve destination chain — default to Arc testnet (5042002)
        const destId = destChainId || sourceConfig.defaultDest || '5042002';
        const destConfig = CCTP_CHAINS[destId];
        if (!destConfig) {
            console.error(`[CCTP-Relayer] Unsupported destination chain: ${destId}`);
            return;
        }

        console.log(`[CCTP-Relayer] Monitoring ${sourceConfig.name} → ${destConfig.name} | TX: ${txHash}`);

        try {
            // Step 1: Get tx receipt from source chain with retry loop
            const sourceProvider = new ethers.JsonRpcProvider(sourceConfig.rpc);
            let receipt = null;

            for (let attempt = 0; attempt < 30; attempt++) {
                try {
                    receipt = await sourceProvider.getTransactionReceipt(txHash);
                    if (receipt) break;
                } catch (e) { /* retry */ }
                await new Promise(r => setTimeout(r, 5000));
            }

            if (!receipt) {
                console.error(`[CCTP-Relayer] Receipt timeout for ${txHash}`);
                return;
            }

            if (receipt.status === 0) {
                console.error(`[CCTP-Relayer] TX reverted on-chain: ${txHash}. Cannot relay.`);
                return;
            }

            console.log(`[CCTP-Relayer] Receipt confirmed (status: ${receipt.status}, logs: ${receipt.logs.length})`);

            // Step 2: Extract CCTP MessageSent log
            const messageSentTopic = ethers.id('MessageSent(bytes)');
            const log = receipt.logs.find(l => l.topics && l.topics[0] === messageSentTopic);

            if (!log) {
                console.error(`[CCTP-Relayer] No MessageSent log found in TX ${txHash}. Not a valid CCTP burn.`);
                console.error('[CCTP-Relayer] Log topics found:', receipt.logs.map(l => l.topics?.[0]).filter(Boolean));
                return;
            }

            const messageBytes = ethers.AbiCoder.defaultAbiCoder().decode(['bytes'], log.data)[0];
            console.log(`[CCTP-Relayer] Message extracted (${messageBytes.length} bytes). Polling IRIS V2 API...`);

            // Step 3: Poll Circle IRIS V2 Attestation API
            // Endpoint: GET /v2/messages/{sourceDomain}?transactionHash={txHash}
            // Arc Testnet (domain 26) IS fully supported — the old bypass was wrong.
            const irisUrl = `${IRIS_API_BASE}/v2/messages/${sourceConfig.domain}?transactionHash=${txHash}`;
            let messageData = null; // { message, attestation }
            for (let i = 0; i < 72; i++) { // 72 × 10s = 12 minutes max
                try {
                    const irisRes = await axios.get(irisUrl);
                    const msg = irisRes.data?.messages?.[0];
                    if (msg?.status === 'complete' && msg?.attestation && msg?.message) {
                        messageData = { message: msg.message, attestation: msg.attestation };
                        console.log(`[CCTP-Relayer] Attestation received after ${i * 10}s`);
                        break;
                    }
                    console.log(`[CCTP-Relayer] IRIS status: ${msg?.status || 'pending'} (attempt ${i + 1}/72)`);
                } catch (e) {
                    if (e.response?.status !== 404) {
                        console.warn(`[CCTP-Relayer] IRIS API error: ${e.message}`);
                    }
                }
                await new Promise(r => setTimeout(r, 10000));
            }

            if (!messageData) {
                console.error('[CCTP-Relayer] Attestation timeout after 12 minutes. The burn may not be attested by Circle IRIS.');
                console.error('[CCTP-Relayer] Check: was the burn done via the CCTP V2 TokenMessenger (0x8FE6...DAA)?');
                return;
            }

            // Step 4: Call receiveMessage on the DESTINATION chain's MessageTransmitter
            const relayerWallet = this.destWallets[destId];
            if (!relayerWallet) {
                console.error(`[CCTP-Relayer] No relayer wallet configured for destination chain ${destId}`);
                return;
            }

            const transmitterAbi = [
                'function receiveMessage(bytes calldata message, bytes calldata attestation) external returns (bool)'
            ];
            const transmitter = new ethers.Contract(
                destConfig.messageTransmitter,
                transmitterAbi,
                relayerWallet
            );

            console.log(`[CCTP-Relayer] Calling receiveMessage on ${destConfig.name} (${destConfig.messageTransmitter})`);
            const mintTx = await transmitter.receiveMessage(messageData.message, messageData.attestation);
            const mintReceipt = await rpc.waitForReceipt(mintTx.hash);
            if (!mintReceipt || mintReceipt.status !== 1) throw new Error('receiveMessage reverted on-chain');

            console.log(`[CCTP-Relayer] ✅ USDC minted on ${destConfig.name}! TX: ${mintTx.hash}`);

            // Step 5: The optimistic credit was already applied by the caller
            // (/fund/monitor-cctp or /fund/permit-bridge). Just sync profile
            // persistence and emit the confirmation event — do NOT call
            // creditTradingWallet() again as that would double-credit.
            const cache = require('../cache');
            const profiles = require('../profiles');
            const session = cache.sessions.get(userAddr);
            const currentBalance = session ? session.balance : parseFloat(amount || 0);
            // Persist to profile so balance survives restarts
            profiles.upsert(userAddr, { balance: currentBalance });

            // Step 5b: The USDC has now actually landed in the session wallet on
            // Arc. Move the reconciliation baseline up by the same amount so
            // chainReconciler sees no unexplained inflow and does not credit
            // this bridge a second time on top of the optimistic credit.
            try {
                require('./chainReconciler').advanceBaselineForCreditedDeposit(userAddr, amount);
            } catch (reconErr) {
                console.warn('[CCTP-Relayer] baseline advance failed:', reconErr.message);
            }

            // Trigger CCTP Bridge Confirmed notification
            notificationService.notifyUser(
                userAddr,
                "CCTP Bridge Confirmed",
                `Successfully settled ${amount} USDC on Arc Testnet via CCTP bridge. Your trading wallet has been credited!`,
                "success"
            );

            // Push live socket update to user confirming final on-chain settlement
            if (io) {
                io.to(userAddr).emit('balance_update', {
                    balance: String(currentBalance),
                    reason: 'DEPOSIT_CONFIRMED',
                    txHash: mintTx.hash
                });
                console.log(`[CCTP-Relayer] Socket balance_update emitted to ${userAddr}: ${currentBalance} USDC`);
            }

        } catch (err) {
            console.error(`[CCTP-Relayer] Settlement failed:`, err.message);
        }
    }
}

module.exports = new FundingService();
