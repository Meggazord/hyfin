import assert from "node:assert/strict";
import { matchTransfer, pickExpectedAmount, type MatchCandidate } from "../src/lib/match";

const W1 = "0x1111111111111111111111111111111111111111";
const W2 = "0x2222222222222222222222222222222222222222";
const X = "0x9999999999999999999999999999999999999999";
const c = (id: string, status: string, exp: number | null, wallet: string | null): MatchCandidate => ({
  id, status, expected_amount: exp, payout_address: wallet, created_at: "2026-11-17",
});
const cands = [c("a", "awaiting_deposit", 1500.37, W1), c("b", "awaiting_deposit", 500.12, W2)];

assert.equal(matchTransfer({ from: X, amount: "1500.37" }, cands), "a", "exact amount from exchange");
assert.equal(matchTransfer({ from: X, amount: "1500.370000" }, cands), "a", "6-decimal formatting");
assert.equal(matchTransfer({ from: X, amount: "1500.36" }, cands), null, "off by a cent, unknown sender");
assert.equal(matchTransfer({ from: W2.toUpperCase().replace("0X", "0x"), amount: "200" }, cands), "b", "sender match, case-insensitive");
assert.equal(matchTransfer({ from: X, amount: "1500.375" }, cands), null, "fraction of a cent is not exact");
assert.equal(matchTransfer({ from: W1, amount: "100" }, [c("a", "funded", 1500.37, W1)]), "a", "top-up after funded");
assert.equal(matchTransfer({ from: X, amount: "1500.37" }, [c("a", "funded", 1500.37, W1)]), null, "exact amount only while awaiting");
assert.equal(matchTransfer({ from: W1, amount: "5" }, [c("a", "awaiting_deposit", 1.01, W1), c("z", "partially_funded", 2.02, W1)]), null, "ambiguous sender");

const taken = new Set<number>();
for (let i = 0; i < 99; i++) {
  const v = pickExpectedAmount(1500, taken)!;
  assert.ok(v > 1500 && v < 1501);
  taken.add(Math.round(v * 100));
}
assert.equal(pickExpectedAmount(1500, taken), null, "all 99 slots used");
assert.equal(pickExpectedAmount(1500.5, new Set(), () => 0), 1500.51);
console.log("match tests passed");
