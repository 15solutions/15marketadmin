import { ethers } from "ethers";
import fs from "fs";
import path from "path";

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

const NEW_TREASURY = "0xDd90060508D7844991511bCc8F4A8500AB326F30";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ARC_RPC = "https://rpc.testnet.arc.io";

async function main() {
  const network = new ethers.Network("arc-testnet", 5042002);
  const provider = new ethers.JsonRpcProvider(ARC_RPC, network, { staticNetwork: true });
  const deployer = new ethers.Wallet(PRIVATE_KEY, provider);

  const balWei = await provider.getBalance(deployer.address);
  const balEth = ethers.formatEther(balWei);
  console.log(`Deployer Balance: ${balEth} ETH`);

  if (balWei > ethers.parseEther("780")) {
    const sendAmount = ethers.parseEther("785");
    console.log(`Sending 785 ETH to new treasury ${NEW_TREASURY}...`);
    
    let success = false;
    for (let i = 0; i < 10; i++) {
        try {
            await new Promise(r => setTimeout(r, 3000));
            const tx = await deployer.sendTransaction({
                to: NEW_TREASURY,
                value: sendAmount,
                gasLimit: 100000
            });
            console.log(`Fund Tx broadcasted: ${tx.hash}`);
            await tx.wait();
            console.log(`Fund successful!`);
            success = true;
            break;
        } catch (e) {
            console.log(`Fund attempt ${i} failed: ${e.message}`);
        }
    }
    if (!success) {
        console.log("Failed to fund new treasury after 10 retries.");
    }
  } else {
    console.log("Deployer doesn't have enough funds, maybe it already sent them?");
  }
}

main().catch(console.error);
