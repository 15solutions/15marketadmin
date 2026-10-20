import { ethers } from "ethers";
import fs from "fs";
import path from "path";

// Manually parse .env
const envPath = path.resolve("../nexus-core/.env");
if (fs.existsSync(envPath)) {
  const envFile = fs.readFileSync(envPath, "utf8");
  envFile.split("\n").forEach(line => {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (match) {
      let val = match[2] || "";
      process.env[match[1]] = val.trim();
    }
  });
}

const OLD_TREASURY = process.env.TREASURY_ADDRESS;
const NEW_TREASURY = "0x02858fddB58899bdEdC10E54253e4E63d9A1dd00";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ARC_RPC = process.env.ARC_RPC_1 || "https://rpc.testnet.arc.io";
const ENV_PATH = path.resolve("../nexus-core/.env");

const OLD_ABI = [
  "function withdraw(uint256 _amount) external"
];

const DELAY_MS = 15000; // 15 seconds between attempts
const MAX_RETRIES = 20;

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function withRetry(fn, label) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const result = await fn();
      return result;
    } catch (e) {
      const msg = e.message?.substring(0, 100) || "unknown";
      console.log(`  ⚠️  ${label} attempt ${i+1}/${MAX_RETRIES} failed: ${msg}`);
      if (i === MAX_RETRIES - 1) throw e;
      const wait = DELAY_MS + (i * 5000);
      console.log(`  ⏳ Waiting ${wait/1000}s before retry...`);
      await sleep(wait);
    }
  }
}

async function main() {
  const network = new ethers.Network("arc-testnet", 5042002);
  const provider = new ethers.JsonRpcProvider(ARC_RPC, network, { staticNetwork: true });
  const deployer = new ethers.Wallet(PRIVATE_KEY, provider);

  console.log("\n🔑 Deployer:", deployer.address);
  console.log("📦 Old Contract:", OLD_TREASURY);
  console.log("📦 New Contract:", NEW_TREASURY);

  // Check balances
  console.log("\n📊 Checking balances...");
  await sleep(5000);
  const oldBalWei = await withRetry(() => provider.getBalance(OLD_TREASURY), "Check old balance");
  const oldBal = ethers.formatEther(oldBalWei);
  console.log(`  Old Treasury: ${oldBal} ETH`);

  await sleep(5000);
  const newBalWei = await withRetry(() => provider.getBalance(NEW_TREASURY), "Check new balance");
  console.log(`  New Treasury: ${ethers.formatEther(newBalWei)} ETH`);

  if (oldBalWei === 0n) {
    console.log("\n✅ Old contract is empty. Nothing to migrate.");
  } else {
    // Step 1: Withdraw from old contract
    console.log(`\n🔄 Withdrawing ${oldBal} ETH from old contract...`);
    await sleep(DELAY_MS);
    const oldContract = new ethers.Contract(OLD_TREASURY, OLD_ABI, deployer);
    
    const withdrawTx = await withRetry(async () => {
      const tx = await oldContract.withdraw(oldBalWei, { gasLimit: 300000 });
      console.log(`  📤 Withdraw tx: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  ✅ Withdraw confirmed in block ${receipt.blockNumber}`);
      return tx;
    }, "Withdraw from old");

    // Step 2: Send to new contract
    console.log(`\n🔄 Sending ${oldBal} ETH to new contract...`);
    await sleep(DELAY_MS);
    
    await withRetry(async () => {
      const tx = await deployer.sendTransaction({
        to: NEW_TREASURY,
        value: oldBalWei,
        gasLimit: 100000
      });
      console.log(`  📤 Fund tx: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`  ✅ Fund confirmed in block ${receipt.blockNumber}`);
      return tx;
    }, "Fund new contract");

    // Verify
    await sleep(5000);
    const finalNewBal = await withRetry(() => provider.getBalance(NEW_TREASURY), "Check final balance");
    console.log(`\n  💰 New Treasury Balance: ${ethers.formatEther(finalNewBal)} ETH`);
  }

  // Step 3: Update .env
  console.log(`\n📝 Updating .env with new TREASURY_ADDRESS...`);
  let envContent = fs.readFileSync(ENV_PATH, "utf8");
  if (envContent.includes("TREASURY_ADDRESS=")) {
    envContent = envContent.replace(/TREASURY_ADDRESS=.*/, `TREASURY_ADDRESS=${NEW_TREASURY}`);
  } else {
    envContent += `\nTREASURY_ADDRESS=${NEW_TREASURY}`;
  }
  fs.writeFileSync(ENV_PATH, envContent);
  console.log(`  ✅ .env updated → TREASURY_ADDRESS=${NEW_TREASURY}`);

  console.log("\n🎉 Migration complete!");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  OLD: ${OLD_TREASURY}`);
  console.log(`  NEW: ${NEW_TREASURY}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ⚡ Restart nexus-core and update frontend env files.\n");
}

main().catch((error) => {
  console.error("\n❌ Migration failed:", error.message);
  console.error("  You can re-run this script safely — it's idempotent.");
  process.exitCode = 1;
});
