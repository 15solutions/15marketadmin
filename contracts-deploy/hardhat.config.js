import fs from "fs";
import path from "path";

// Manually parse .env to avoid dotenv dependency issues
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

const PRIVATE_KEY = process.env.PRIVATE_KEY;

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: "0.8.20",
  networks: {
    arc: {
      type: "http",
      url: process.env.ARC_RPC_1 || "https://rpc.testnet.arc.io",
      accounts: [PRIVATE_KEY]
    }
  }
};
