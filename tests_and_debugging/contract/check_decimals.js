const { ethers } = require("ethers");
require("dotenv").config();

const ARC_RPC = "https://rpc.testnet.arc.io";
const USDC_ADDRESS = "0x3600000000000000000000000000000000000000";

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);

    // Check decimals of native token (USDC is native gas token on Arc)
    // Actually, on Arc, USDC IS the native token, so we check the native balance/units
    // But Circle's USDC is also an ERC20. Let's check both.

    const usdc = new ethers.Contract(USDC_ADDRESS, ["function decimals() view returns (uint8)"], provider);
    try {
        const decimals = await usdc.decimals();
        console.log(`📏 USDC ERC20 Decimals: ${decimals}`);
    } catch (e) {
        console.log(`❌ Could not check ERC20 decimals (maybe only native?)`);
    }

    // Check balance of a known address to see magnitude
    const address = "0x2E8DC6aBd23fC5CCB75940C8D389D9DDB21eDb31";
    const balance = await provider.getBalance(address);
    console.log(`📊 Native Balance (Wei): ${balance.toString()}`);
    console.log(`📊 Native Balance (Ether): ${ethers.formatEther(balance)}`);

}

main().catch(console.error);
