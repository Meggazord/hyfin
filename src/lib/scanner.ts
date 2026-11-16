import "server-only";
import { JsonRpcProvider, Network, formatUnits, getAddress, id as keccakId, zeroPadValue } from "ethers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabledChains, rpcUrl } from "@/lib/chains";
import { depositMode, safeAddress } from "@/lib/wallet";
import { matchTransfer, type MatchCandidate } from "@/lib/match";
import { sendEmail } from "@/lib/notify";
import { usd } from "@/lib/format";

const TRANSFER_TOPIC = keccakId("Transfer(address,address,uint256)");
const num = (v: string | undefined, d: number) => (v && Number.isFinite(Number(v)) ? Number(v) : d);

export type ScanReport = { chain: string; token: string; from: number; to: number; deposits: number }[];

/** Decodes an ERC-20 Transfer log into the fields we store. Exported for tests. */
export function decodeTransfer(log: { topics: readonly string[]; data: string }, decimals: number) {
  return {
    from: getAddress("0x" + log.topics[1].slice(26)),
    to: getAddress("0x" + log.topics[2].slice(26)),
    amount: formatUnits(BigInt(log.data), decimals),
  };
}

/**
 * Looks for stablecoin transfers into our deposit addresses and credits them.
 * Safe to run as often as you like: cursors make it incremental and
 * record_deposit() ignores transfers it has already seen.
 */
export async function scanDeposits(): Promise<ScanReport> {
  const db = createAdminClient();
  const report: ScanReport = [];

  // Watch every address of deals that are still raising or running.
  const { data: live, error: liveErr } = await db.from("projects").select("id").in("status", ["open", "funded"]);
  if (liveErr) throw liveErr;
  const projectIds = (live ?? []).map((p) => p.id);
  if (projectIds.length === 0) return report;

  const mode = depositMode();
  if (mode === "off") return report;

  const { data: invs, error: invErr } = await db
    .from("investments")
    .select("id, status, created_at, expected_amount, deposit_address, profiles(email, payout_address), projects(title)")
    .in("project_id", projectIds)
    .not("status", "in", "(expired,refunded)");
  if (invErr) throw invErr;

  type Info = { id: string; email?: string; title?: string };
  const info = new Map<string, Info>();
  const byAddress = new Map<string, Info>();
  const candidates: MatchCandidate[] = [];
  for (const i of invs ?? []) {
    const profile = i.profiles as unknown as { email: string; payout_address: string | null } | null;
    const project = i.projects as unknown as { title: string } | null;
    const row = { id: i.id, email: profile?.email, title: project?.title };
    info.set(i.id, row);
    if (i.deposit_address) byAddress.set(i.deposit_address.toLowerCase(), row);
    candidates.push({
      id: i.id,
      status: i.status,
      created_at: i.created_at,
      expected_amount: i.expected_amount,
      payout_address: profile?.payout_address ?? null,
    });
  }
  const safe = mode === "safe" ? safeAddress().toLowerCase() : null;
  const watched = safe ? [safe] : [...byAddress.keys()];
  if (watched.length === 0) return report;

  /** Which subscription a transfer belongs to, or null if nobody can be identified. */
  const resolve = (t: { to: string; from: string; amount: string }): Info | null => {
    if (!safe) return byAddress.get(t.to.toLowerCase()) ?? null;
    if (t.to.toLowerCase() !== safe) return null;
    const id = matchTransfer(t, candidates);
    if (!id) return null;
    // Keep candidates current so a second transfer in the same run matches correctly.
    const c = candidates.find((x) => x.id === id);
    if (c && c.status === "awaiting_deposit") c.status = "partially_funded";
    return info.get(id) ?? null;
  };

  const chunkSize = num(process.env.SCAN_BLOCK_CHUNK, 2000);
  const maxChunks = num(process.env.SCAN_MAX_CHUNKS, 20);
  const lookback = num(process.env.SCAN_INITIAL_LOOKBACK, 5000);

  for (const chain of enabledChains()) {
    const provider = new JsonRpcProvider(rpcUrl(chain), chain.id, {
      staticNetwork: Network.from(chain.id),
    });
    const safeHead = (await provider.getBlockNumber()) - chain.confirmations;

    for (const token of chain.tokens) {
      const { data: cursor } = await db
        .from("scan_cursors")
        .select("last_block")
        .eq("chain_id", chain.id)
        .eq("token", token.symbol)
        .maybeSingle();
      let from = cursor ? Number(cursor.last_block) + 1 : Math.max(safeHead - lookback, 0);
      const start = from;
      let found = 0;

      for (let n = 0; n < maxChunks && from <= safeHead; n++) {
        const to = Math.min(from + chunkSize - 1, safeHead);
        for (let a = 0; a < watched.length; a += 200) {
          const recipients = watched.slice(a, a + 200).map((addr) => zeroPadValue(addr, 32));
          const logs = await provider.getLogs({
            address: token.address,
            topics: [TRANSFER_TOPIC, null, recipients],
            fromBlock: from,
            toBlock: to,
          });
          for (const log of logs) {
            const t = decodeTransfer(log, token.decimals);
            if (Number(t.amount) <= 0) continue;
            const inv = resolve(t);
            if (!inv) {
              if (safe) {
                // Money arrived but we can't tell whose it is: park it for an admin to assign.
                const { error: uErr } = await db.from("unmatched_deposits").upsert(
                  {
                    chain_id: chain.id,
                    token: token.symbol,
                    tx_hash: log.transactionHash.toLowerCase(),
                    log_index: log.index,
                    from_address: t.from.toLowerCase(),
                    amount: t.amount,
                    block_number: log.blockNumber,
                  },
                  { onConflict: "chain_id,tx_hash,log_index", ignoreDuplicates: true },
                );
                if (uErr) throw uErr;
              }
              continue;
            }
            const { data: isNew, error } = await db.rpc("record_deposit", {
              p_investment: inv.id,
              p_chain: chain.id,
              p_token: token.symbol,
              p_tx: log.transactionHash,
              p_log_index: log.index,
              p_from: t.from,
              p_amount: t.amount,
              p_block: log.blockNumber,
            });
            if (error) throw error;
            if (isNew) {
              found++;
              if (inv.email) {
                await sendEmail(
                  [inv.email],
                  `Deposit received: ${usd(t.amount, 2)} ${token.symbol}`,
                  `<p>We received <strong>${usd(t.amount, 2)} ${token.symbol}</strong> on ${chain.name} for “${inv.title ?? "your deal"}”.</p>
                   <p>Transaction: <a href="${chain.explorer}/tx/${log.transactionHash}">${log.transactionHash}</a></p>`,
                ).catch(() => undefined);
              }
            }
          }
        }
        // Advance only after the whole block range has been processed for every address.
        const { error: curErr } = await db
          .from("scan_cursors")
          .upsert({ chain_id: chain.id, token: token.symbol, last_block: to, updated_at: new Date().toISOString() });
        if (curErr) throw curErr;
        from = to + 1;
      }
      report.push({ chain: chain.name, token: token.symbol, from: start, to: from - 1, deposits: found });
    }
  }
  return report;
}
