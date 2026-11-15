import { getAddress } from "ethers";

export type Token = { symbol: "USDC" | "USDT"; address: string; decimals: number };
export type Chain = {
  id: number;
  name: string;
  rpcEnv: string;
  /** Blocks to wait before a transfer counts. */
  confirmations: number;
  explorer: string;
  tokens: Token[];
};

/**
 * Accepted networks and stablecoin contracts.
 * Before going live, re-check every address against the issuer's own list:
 *   USDC  https://developers.circle.com/stablecoins/usdc-contract-addresses
 *   USDT  https://tether.to/en/supported-protocols/
 * A chain is only offered to investors when its RPC env var is set.
 */
export const CHAINS: Chain[] = [
  {
    id: 8453,
    name: "Base",
    rpcEnv: "RPC_BASE",
    confirmations: 30,
    explorer: "https://basescan.org",
    tokens: [{ symbol: "USDC", address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 }],
  },
  {
    id: 42161,
    name: "Arbitrum One",
    rpcEnv: "RPC_ARBITRUM",
    confirmations: 60,
    explorer: "https://arbiscan.io",
    tokens: [
      { symbol: "USDC", address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
      { symbol: "USDT", address: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9", decimals: 6 },
    ],
  },
  {
    id: 1,
    name: "Ethereum",
    rpcEnv: "RPC_ETHEREUM",
    confirmations: 12,
    explorer: "https://etherscan.io",
    tokens: [
      { symbol: "USDC", address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
      { symbol: "USDT", address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    ],
  },
];

// Fails loudly at startup if an address above is mistyped (EIP-55 checksum).
for (const c of CHAINS) for (const t of c.tokens) getAddress(t.address);

export const enabledChains = () => CHAINS.filter((c) => Boolean(process.env[c.rpcEnv]));
export const chainById = (id: number) => CHAINS.find((c) => c.id === id);
