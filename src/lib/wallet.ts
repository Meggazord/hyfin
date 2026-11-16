import "server-only";
import { HDNodeWallet, HDNodeVoidWallet, isAddress, getAddress } from "ethers";
import { env } from "@/lib/env";

/**
 * Deposit addresses are derived from an extended PUBLIC key, so this server can
 * create and watch addresses but can never move funds. The matching seed stays
 * on a hardware wallet. Export the xpub at m/44'/60'/0'/0 so that index i here
 * is account i in the wallet.
 */
export function deriveDepositAddress(index: number, xpub = env("DEPOSIT_XPUB")): string {
  if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31) throw new Error("Deposit index out of range");
  const node = HDNodeWallet.fromExtendedKey(xpub);
  if (!(node instanceof HDNodeVoidWallet)) {
    throw new Error("DEPOSIT_XPUB is a private key. Use the extended public key (xpub) only.");
  }
  return node.deriveChild(index).address;
}

export type DepositMode = "safe" | "xpub" | "off";

/**
 * "safe": every investor pays one Safe multisig on Base, matched by a unique amount.
 * "xpub": one derived address per investor (needs DEPOSIT_XPUB).
 */
export function depositMode(): DepositMode {
  if (process.env.DEPOSIT_SAFE_ADDRESS) return "safe";
  if (process.env.DEPOSIT_XPUB) return "xpub";
  return "off";
}

export function safeAddress(): string {
  const a = normaliseAddress(env("DEPOSIT_SAFE_ADDRESS"));
  if (!a) throw new Error("DEPOSIT_SAFE_ADDRESS is not a valid address.");
  return a;
}

export function normaliseAddress(input: string): string | null {
  const v = input.trim();
  if (!isAddress(v)) return null;
  return getAddress(v);
}
