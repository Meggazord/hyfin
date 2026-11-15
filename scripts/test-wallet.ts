/**
 * Checks deposit-address derivation and transfer decoding. `npm run test:wallet`
 */
import assert from "node:assert/strict";
import { AbiCoder, HDNodeWallet, Mnemonic, id, zeroPadValue } from "ethers";
import { deriveDepositAddress, normaliseAddress } from "../src/lib/wallet";
import { decodeTransfer } from "../src/lib/scanner";

// Well-known development mnemonic (Hardhat/Anvil). Never use it for real funds.
const phrase = "test test test test test test test test test test test junk";
const account = HDNodeWallet.fromMnemonic(Mnemonic.fromPhrase(phrase), "m/44'/60'/0'/0");
const xpub = account.neuter().extendedKey;

// Known vectors: Hardhat accounts #0 and #1.
assert.equal(deriveDepositAddress(0, xpub), "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
assert.equal(deriveDepositAddress(1, xpub), "0x70997970C51812dc3A010C7d01b50e0d17dc79C8");

// Every index maps to the address the seed holder controls at the same path.
for (const i of [2, 17, 4096, 2 ** 31 - 1]) {
  assert.equal(deriveDepositAddress(i, xpub), account.deriveChild(i).address);
}
assert.notEqual(deriveDepositAddress(5, xpub), deriveDepositAddress(6, xpub));

// The server must refuse a private key and out-of-range indexes.
assert.throws(() => deriveDepositAddress(0, account.extendedKey), /private key/);
assert.throws(() => deriveDepositAddress(-1, xpub), /out of range/);
assert.throws(() => deriveDepositAddress(2 ** 31, xpub), /out of range/);

assert.equal(normaliseAddress("0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266"), "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266");
assert.equal(normaliseAddress("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"), null);
assert.equal(normaliseAddress("0x123"), null);

// A 1,234.56 USDC transfer (6 decimals) to deposit address #1.
const log = {
  topics: [
    id("Transfer(address,address,uint256)"),
    zeroPadValue("0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", 32),
    zeroPadValue("0x70997970C51812dc3A010C7d01b50e0d17dc79C8", 32),
  ],
  data: AbiCoder.defaultAbiCoder().encode(["uint256"], [BigInt(1234560000)]),
};
assert.deepEqual(decodeTransfer(log, 6), {
  from: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  to: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  amount: "1234.56",
});

console.log("wallet tests passed");
