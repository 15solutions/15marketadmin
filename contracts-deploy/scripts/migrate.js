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
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ARC_RPC = process.env.ARC_RPC_1 || "https://rpc.testnet.arc.io";
const ENV_PATH = path.resolve("../nexus-core/.env");

// Minimal ABI to drain old contract
const OLD_ABI = [
  "function withdraw(uint256 _amount) external"
];

async function main() {
  const network = new ethers.Network("arc-testnet", 5042002);
  const provider = new ethers.JsonRpcProvider(ARC_RPC, network, { staticNetwork: true });
  const deployer = new ethers.Wallet(PRIVATE_KEY, provider);
  const deployerAddr = deployer.address;

  console.log("\n🔑 Deployer:", deployerAddr);
  console.log("📦 Old Contract:", OLD_TREASURY);

  // --- Step 1: Check old contract balance ---
  const oldBalWei = await provider.getBalance(OLD_TREASURY);
  const oldBal = ethers.formatEther(oldBalWei);
  console.log(`\n💰 Old Treasury Balance: ${oldBal} ETH (USDC equivalent)`);

  // --- Step 2: Deploy new contract ---
  console.log("\n🚀 Deploying new ArcPrediction contract...");
  const artifactPath = path.resolve("./artifacts/contracts/ArcPrediction.sol/ArcPrediction.json");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, deployer);
  
  let newContract, newAddress;
  for (let i = 0; i < 10; i++) {
    try {
      const delay = 10000 + (i * 5000); // 10s, 15s, 20s, ... escalating
      console.log(`  Attempt ${i+1}/10 (waiting ${delay/1000}s)...`);
      await new Promise(r => setTimeout(r, delay));
      newContract = await factory.deploy();
      await newContract.waitForDeployment();
      newAddress = await newContract.getAddress();
      break;
    } catch (e) {
      if (i === 9) throw e;
      console.log(`  Deploy failed, retrying: ${e.message.substring(0, 120)}`);
    }
  }
  console.log(`✅ New Contract Deployed: ${newAddress}`);

  // --- Step 3: Migrate funds from old → new ---
  if (oldBalWei > 0n) {
    console.log(`\n🔄 Migrating ${oldBal} ETH from old contract to new...`);

    // Create contract instance with hre signer (has provider + wallet)
    const oldContract = new ethers.Contract(OLD_TREASURY, OLD_ABI, deployer);

    // Withdraw to deployer (owner)
    let withdrawTx;
    for (let i = 0; i < 10; i++) {
      try {
        const delay = 10000 + (i * 5000);
        console.log(`  Withdraw attempt ${i+1}/10 (waiting ${delay/1000}s)...`);
        await new Promise(r => setTimeout(r, delay));
        withdrawTx = await oldContract.withdraw(oldBalWei, { gasLimit: 200000 });
        const withdrawReceipt = await withdrawTx.wait();
        console.log(`  ✅ Withdrawn | tx: ${withdrawTx.hash} | block: ${withdrawReceipt.blockNumber}`);
        break;
      } catch (e) {
        if (i === 9) throw e;
        console.log(`  Withdraw failed, retrying: ${e.message.substring(0, 120)}`);
      }
    }

    // Forward to new contract
    for (let i = 0; i < 10; i++) {
      try {
        const delay = 10000 + (i * 5000);
        console.log(`  Fund attempt ${i+1}/10 (waiting ${delay/1000}s)...`);
        await new Promise(r => setTimeout(r, delay));
        const sendTx = await deployer.sendTransaction({
          to: newAddress,
          value: oldBalWei,
          gasLimit: 100000
        });
        await sendTx.wait();
        console.log(`  ✅ Funded new contract | tx: ${sendTx.hash}`);
        break;
      } catch (e) {
        if (i === 9) throw e;
        console.log(`  Funding failed, retrying: ${e.message.substring(0, 120)}`);
      }
    }

    const newBal = await provider.getBalance(newAddress);
    console.log(`  💰 New Treasury Balance: ${ethers.formatEther(newBal)} ETH`);
  } else {
    console.log("\n  ⚠️  Old contract has zero balance — skipping fund migration.");
  }

  // --- Step 4: Update .env with new address ---
  console.log(`\n📝 Updating nexus-core/.env TREASURY_ADDRESS...`);
  let envContent = fs.readFileSync(ENV_PATH, "utf8");
  if (envContent.includes("TREASURY_ADDRESS=")) {
    envContent = envContent.replace(/TREASURY_ADDRESS=.*/, `TREASURY_ADDRESS=${newAddress}`);
  } else {
    envContent += `\nTREASURY_ADDRESS=${newAddress}`;
  }
  fs.writeFileSync(ENV_PATH, envContent);
  console.log(`  ✅ .env updated → TREASURY_ADDRESS=${newAddress}`);

  console.log("\n🎉 Migration complete!\n");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`  OLD: ${OLD_TREASURY}`);
  console.log(`  NEW: ${newAddress}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("  ⚡ Restart nexus-core for the new address to take effect.\n");
}

main().catch((error) => {
  console.error("❌ Migration failed:", error.message);
  process.exitCode = 1;
});
