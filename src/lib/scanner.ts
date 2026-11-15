import "server-only";
import { JsonRpcProvider, Network, formatUnits, getAddress, id as keccakId, zeroPadValue } from "ethers";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabledChains } from "@/lib/chains";
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

  const { data: invs, error: invErr } = await db
    .from("investments")
    .select("id, deposit_address, profiles(email), projects(title)")
    .in("project_id", projectIds)
    .not("deposit_address", "is", null);
  if (invErr) throw invErr;

  const byAddress = new Map<string, { id: string; email?: string; title?: string }>();
  for (const i of invs ?? []) {
    const profile = i.profiles as unknown as { email: string } | null;
    const project = i.projects as unknown as { title: string } | null;
    byAddress.set(i.deposit_address!.toLowerCase(), { id: i.id, email: profile?.email, title: project?.title });
  }
  const watched = [...byAddress.keys()];
  if (watched.length === 0) return report;

  const chunkSize = num(process.env.SCAN_BLOCK_CHUNK, 2000);
  const maxChunks = num(process.env.SCAN_MAX_CHUNKS, 20);
  const lookback = num(process.env.SCAN_INITIAL_LOOKBACK, 5000);

  for (const chain of enabledChains()) {
    const provider = new JsonRpcProvider(process.env[chain.rpcEnv], chain.id, {
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
            const inv = byAddress.get(t.to.toLowerCase());
            if (!inv || Number(t.amount) <= 0) continue;
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
