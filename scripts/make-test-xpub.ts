/**
 * Prints a throwaway seed phrase and its xpub so you can try the app on a testnet.
 * `npm run make:test-xpub`
 *
 * DO NOT use this for real money. For production, create the wallet on a
 * hardware device, export the extended public key at m/44'/60'/0'/0 from it,
 * and never type the seed phrase into any computer.
 */
import { HDNodeWallet, Mnemonic, randomBytes } from "ethers";

const mnemonic = Mnemonic.fromEntropy(randomBytes(16));
const account = HDNodeWallet.fromMnemonic(mnemonic, "m/44'/60'/0'/0");

console.log("TEST seed phrase (throwaway):", mnemonic.phrase);
console.log("DEPOSIT_XPUB=" + account.neuter().extendedKey);
console.log("First deposit address:", account.deriveChild(0).address);
