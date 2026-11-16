import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { chainById, enabledChains } from "@/lib/chains";
import { depositMode, safeAddress } from "@/lib/wallet";
import { assignDeposit } from "@/app/actions/admin";
import { Flash, Loading, PageShell, ProjectBadge } from "@/components/ui";
import { day, pct, shortAddr, usd } from "@/lib/format";
import type { Project } from "@/lib/types";

async function Content({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const db = createAdminClient();
  const [{ data: projects }, { count: pending }, { count: waitlist }, { data: unmatched }, { data: live }] = await Promise.all([
    db.from("projects").select("*").order("created_at", { ascending: false }),
    db.from("profiles").select("id", { count: "exact", head: true }).in("kyc", ["none", "pending"]),
    db.from("waitlist").select("email", { count: "exact", head: true }),
    db.from("unmatched_deposits").select("*").is("assigned_investment", null).order("created_at"),
    db
      .from("investments")
      .select("id, committed_amount, expected_amount, profiles(email), projects(title)")
      .in("status", ["awaiting_deposit", "partially_funded", "funded"]),
  ]);
  const rows = (projects ?? []) as Project[];
  const chains = enabledChains();
  const mode = depositMode();
  let safe = "";
  try {
    if (mode === "safe") safe = safeAddress();
  } catch {
    safe = "invalid address";
  }

  return (
    <>
      <Flash searchParams={searchParams} />
      {mode === "off" || chains.length === 0 ? (
        <p className="mb-6 rounded-md bg-red-soft px-4 py-3 text-sm font-medium text-red">
          Deposits are off: set DEPOSIT_SAFE_ADDRESS (the Safe on Base) in Cloudflare. Do not publish a deal until
          this is fixed.
        </p>
      ) : (
        <p className="mb-6 text-sm text-muted">
          {mode === "safe" ? (
            <>
              Deposits go to the Safe <span className="font-semibold">{safe}</span> on Base, matched by unique amount
              or sender wallet. Checked every 5 minutes.
            </>
          ) : (
            "Deposits use one derived address per investor."
          )}
        </p>
      )}
      {(unmatched ?? []).length > 0 && (
        <section className="mb-6 rounded-md border border-amber bg-amber-soft p-4">
          <h2 className="font-bold text-amber">Payments we couldn&apos;t match ({unmatched!.length})</h2>
          <p className="mt-1 text-sm">Money is in the Safe. Pick whose it is, or refund it if nobody claims it.</p>
          <ul className="mt-3 space-y-3">
            {unmatched!.map((d) => {
              const chain = chainById(d.chain_id);
              return (
                <li key={d.id} className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-semibold">
                    {usd(d.amount, 2)} {d.token}
                  </span>
                  <span>from {shortAddr(d.from_address ?? "")}</span>
                  <a className="underline" href={`${chain?.explorer}/tx/${d.tx_hash}`} target="_blank" rel="noreferrer">
                    transaction
                  </a>
                  <form action={assignDeposit} className="flex gap-2">
                    <input type="hidden" name="deposit_id" value={d.id} />
                    <select name="investment_id" className="field text-xs" required defaultValue="">
                      <option value="" disabled>
                        Assign to…
                      </option>
                      {(live ?? []).map((i) => {
                        const who = i.profiles as unknown as { email: string } | null;
                        const deal = i.projects as unknown as { title: string } | null;
                        return (
                          <option key={i.id} value={i.id}>
                            {who?.email} · {usd(i.expected_amount ?? i.committed_amount, 2)} · {deal?.title}
                          </option>
                        );
                      })}
                    </select>
                    <button className="btn btn-sm">Credit</button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/admin/projects/new" className="btn">
          Create a deal
        </Link>
        <Link href="/admin/investors" className="btn btn-quiet">
          Review investors ({pending ?? 0} waiting)
        </Link>
        <span className="text-sm text-muted">{waitlist ?? 0} on the alert list</span>
      </div>

      <div className="panel mt-6 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Deal</th>
              <th>Status</th>
              <th>Raised</th>
              <th>Target</th>
              <th>Return</th>
              <th>Closes</th>
              <th>Due</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-muted">
                  No deals yet. Create the first one.
                </td>
              </tr>
            )}
            {rows.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link href={`/admin/projects/${p.id}`} className="font-semibold underline">
                    {p.title}
                  </Link>
                </td>
                <td>
                  <ProjectBadge status={p.status} />
                </td>
                <td>{usd(p.raised_amount, 2)}</td>
                <td>{usd(p.target_amount)}</td>
                <td>
                  {pct(p.return_pct)} / {p.term_days}d
                </td>
                <td>{day(p.closes_at)}</td>
                <td>{day(p.matures_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Admin(props: PageProps<"/admin">) {
  return (
    <PageShell title="Admin" wide>
      <Suspense fallback={<Loading />}>
        <Content {...props} />
      </Suspense>
    </PageShell>
  );
}
