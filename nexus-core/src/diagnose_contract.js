const { ethers } = require('ethers');
require('dotenv').config();

const ARC_RPC = process.env.ARC_RPC_1 || "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = process.env.TREASURY_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function checkContractCapability() {
    console.log("🔍 [Diagnostic] Testing Treasury Contract Capability...");
    
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    
    const ABI = [
        "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)",
        "function settleBet(uint256 _betId, uint256 _exitPrice) external",
        "function owner() view returns (address)"
    ];
    
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

    try {
        // 1. Verify Ownership
        const owner = await contract.owner();
        console.log(`👤 Root Wallet: ${wallet.address}`);
        console.log(`👤 Contract Owner: ${owner}`);
        if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
            console.warn("⚠️  Root Wallet is NOT the contract owner. settleBet might fail.");
        }

        // 2. Scan for a real bet ID from events
        console.log("📡 Scanning events for a real bet ID...");
        const filter = ["event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"];
        const tempContract = new ethers.Contract(CONTRACT_ADDRESS, filter, provider);
        const block = await provider.getBlockNumber();
        const events = await tempContract.queryFilter("BetPlaced", block - 10000, block);

        if (events.length === 0) {
            console.log("❌ No recent bets found on-chain.");
            console.log("💡 Please place a small trade in the UI now.");
            return;
        }

        const lastEvent = events[events.length - 1];
        const testBetId = lastEvent.args.id;
        console.log(`🧪 Found Bet #${testBetId}. Checking if it's settled...`);
        
        const betData = await contract.bets(testBetId);
        if (betData.settled) {
            console.log(`⚠️ Bet #${testBetId} is already settled. Simulation might revert with 'Already Settled'.`);
        }

        console.log(`🧪 Found Bet #${testBetId}. Simulating WINNING settlement...`);
        
        // Simulating a win
        const winPrice = betData.direction === 0 ? betData.entryPrice + 1000n : betData.entryPrice - 1000n; 


        // 3. STATIC CALL SIMULATION
        // This checks if the transaction WOULD succeed and if it would revert.
        try {
            await contract.settleBet.staticCall(testBetId, winPrice);
            console.log("✅ SIMULATION SUCCESSFUL: The contract accepts the settleBet call.");
            console.log("🚀 The contract logic is correctly accepting settlement parameters.");
        } catch (simErr) {
            console.error("❌ SIMULATION FAILED:", simErr.message);
            if (simErr.message.includes("OwnableUnauthorizedAccount")) {
                console.error("Critical: The Root Wallet is not authorized to settle bets.");
            }
        }

    } catch (err) {
        console.error("Diagnostic failed:", err.message);
    }
}

checkContractCapability();
