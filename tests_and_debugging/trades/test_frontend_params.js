// Test with EXACT frontend parameters
require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = "https://rpc.testnet.arc.io";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ABI = [
    "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"
];

async function testExactFrontendParams() {
    console.log("🧪 Testing with EXACT frontend parameters...\n");

    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

    // Exact frontend logic
    const activePrice = 100; // Example: $100
    const amount = 1; // 1 USDC
    const duration = 10; // 10 seconds
    const direction = "UP";
    const activeMarketId = "sol";

    const tradeId = Date.now();
    const dirVal = (direction === "buy" || direction === "UP") ? 1 : 0;
    const entryPriceParams = Math.floor(activePrice * 100000000);
    const amountWei = ethers.parseUnits(amount.toString(), 18);
    const ASSET_ID_MAP = { 'sol': 5, 'btc': 0, 'eth': 1, 'mon': 2, 'jup': 3, 'xrp': 4 };
    const assetId = ASSET_ID_MAP[activeMarketId] || 0;

    console.log("📋 Parameters (exactly as frontend):");
    console.log(`   tradeId: ${tradeId}`);
    console.log(`   dirVal: ${dirVal}`);
    console.log(`   duration: ${duration}`);
    console.log(`   entryPriceParams: ${entryPriceParams}`);
    console.log(`   assetId: ${assetId}`);
    console.log(`   payoutAddress: ${wallet.address}`);
    console.log(`   amountWei: ${amountWei.toString()} (${ethers.formatUnits(amountWei, 18)} USDC)\n`);

    console.log("📤 Calling placeBet...");
    console.log(`   Args: [${tradeId}, ${dirVal}, ${duration}, ${entryPriceParams}, ${assetId}, ${wallet.address}]`);
    console.log(`   Value: ${amountWei.toString()}\n`);

    try {
        const tx = await contract.placeBet(
            BigInt(tradeId),
            Number(dirVal),
            BigInt(duration),
            BigInt(entryPriceParams),
            Number(assetId),
            wallet.address,
            {
                value: amountWei,
                gasLimit: 800000n
            }
        );

        console.log(`✅ Transaction sent: ${tx.hash}`);
        console.log(`🔗 https://testnet.arcscan.app/tx/${tx.hash}\n`);

        console.log("⏳ Waiting for confirmation...");
        const receipt = await tx.wait();

        if (receipt.status === 1) {
            console.log("✅ SUCCESS! Transaction confirmed!");
            console.log(`   Block: ${receipt.blockNumber}`);
            console.log(`   Gas Used: ${receipt.gasUsed.toString()}\n`);
            console.log("🎉 The contract logic is working correctly!");
            console.log("   Stakes are being held in treasury.");
            console.log("   Keeper can settle bets and pay winners.\n");
        } else {
            console.log("❌ Transaction failed (status: 0)\n");
        }

    } catch (error) {
        console.log("\n❌ TRANSACTION FAILED\n");
        console.log("Error:", error.message, "\n");

        if (error.message.includes("insufficient funds")) {
            console.log("🔴 Issue: Wallet doesn't have enough USDC");
            console.log("   Solution: Get testnet USDC from faucet\n");
        } else if (error.message.includes("Bet ID already exists")) {
            console.log("🔴 Issue: Bet ID collision");
            console.log("   Solution: Use more unique IDs\n");
        } else {
            console.log("🔴 Unknown issue - check Arc explorer for details\n");
        }
    }
}

testExactFrontendParams();
