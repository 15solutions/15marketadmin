const { ethers } = require("ethers");
require("dotenv").config();

const ARC_RPC = "https://rpc.testnet.arc.io";
const OLD_CONTRACT = "0x2E8DC6aBd23fC5CCB75940C8D389D9DDB21eDb31";
const NEW_CONTRACT = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function migrate() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`🚀 Starting Treasury Migration...`);

    // 1. Check Old Balance
    const oldBal = await provider.getBalance(OLD_CONTRACT);
    console.log(`📊 Old Contract Balance: ${ethers.formatEther(oldBal)} USDC`);

    if (oldBal === 0n) {
        console.log("❌ No funds to migrate in old contract.");
        return;
    }

    // 2. Withdraw from Old Contract
    // The contract has a withdraw(uint256 _amount) function
    const abi = ["function withdraw(uint256 _amount) external"];
    const oldContract = new ethers.Contract(OLD_CONTRACT, abi, wallet);

    console.log(`⏳ Withdrawing ${ethers.formatEther(oldBal)} USDC from old contract...`);
    try {
        const tx1 = await oldContract.withdraw(oldBal);
        console.log(`📤 Withdrawal TX Sent: ${tx1.hash}`);
        await tx1.wait();
        console.log(`✅ Withdrawal Successful!`);
    } catch (e) {
        console.error(`❌ Withdrawal failed: ${e.message}`);
        return;
    }

    // 3. Deposit to New Contract
    const newBalNow = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet Balance Now: ${ethers.formatEther(newBalNow)} USDC`);

    // Move most of it (keeping some for gas, though USDC is gas, let's move all but 1 USDC)
    const amountToMove = oldBal;
    console.log(`⏳ Moving ${ethers.formatEther(amountToMove)} USDC to new contract...`);

    const tx2 = await wallet.sendTransaction({
        to: NEW_CONTRACT,
        value: amountToMove
    });

    console.log(`📤 Deposit TX Sent: ${tx2.hash}`);
    await tx2.wait();
    console.log(`✅ Migration Complete!`);

    const finalBal = await provider.getBalance(NEW_CONTRACT);
    console.log(`📊 New Contract Final Balance: ${ethers.formatEther(finalBal)} USDC`);
}

migrate().catch(console.error);
