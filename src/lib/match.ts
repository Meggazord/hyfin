/** A subscription a Safe deposit could belong to. */
export type MatchCandidate = {
  id: string;
  status: string;
  expected_amount: number | null;
  payout_address: string | null;
  created_at: string;
};

/**
 * Decides which subscription a transfer into the shared Safe belongs to.
 * 1. Exact unique amount (to the cent) of a subscription still awaiting money.
 * 2. Otherwise, the sender is the investor's registered wallet (top-ups, odd amounts).
 *    Only when exactly one live subscription has that wallet.
 * Anything else returns null and is parked for an admin.
 */
export function matchTransfer(
  t: { from: string; amount: string | number },
  candidates: MatchCandidate[],
): string | null {
  const cents = Math.round(Number(t.amount) * 100);
  const awaiting = candidates.filter((c) => ["awaiting_deposit", "partially_funded"].includes(c.status));

  const byAmount = awaiting.filter(
    (c) => c.expected_amount != null && Math.round(Number(c.expected_amount) * 100) === cents,
  );
  // A transfer with fractions of a cent is not an exact match.
  const exact = Math.abs(Number(t.amount) * 100 - cents) < 1e-6;
  if (exact && byAmount.length === 1) return byAmount[0].id;

  const from = t.from.toLowerCase();
  const bySender = candidates.filter(
    (c) => c.payout_address && c.payout_address.toLowerCase() === from &&
      ["awaiting_deposit", "partially_funded", "funded"].includes(c.status),
  );
  if (bySender.length === 1) return bySender[0].id;
  return null;
}

/** Picks the unique cents tag for a new subscription, avoiding amounts already in use. */
export function pickExpectedAmount(committed: number, taken: Set<number>, rand = Math.random): number | null {
  const base = Math.round(committed * 100);
  const free: number[] = [];
  for (let c = 1; c <= 99; c++) if (!taken.has(base + c)) free.push(base + c);
  if (free.length === 0) return null;
  return free[Math.floor(rand() * free.length)] / 100;
}
