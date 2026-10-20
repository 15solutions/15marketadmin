import "@nomicfoundation/hardhat-toolbox";
import dotenv from "dotenv";
dotenv.config({ path: "../../nexus-core/.env" });

const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ARC_RPC = process.env.ARC_RPC_1 || "https://rpc.testnet.arc.io";

/** @type import('hardhat/config').HardhatUserConfig */
export default {
  solidity: "0.8.20",
  networks: {
    arc: {
      url: ARC_RPC,
      accounts: [PRIVATE_KEY],
    }
  }
};
