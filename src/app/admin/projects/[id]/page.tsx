import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelProject,
  closeFunding,
  markDefaulted,
  markPaid,
  markRefunded,
  publishProject,
  settleProject,
} from "@/app/actions/admin";
import { DealSheet, Flash, InvestmentBadge, Loading } from "@/components/ui";
import { usd } from "@/lib/format";
import type { Investment, Profile, Project } from "@/lib/types";

type Row = Investment & { profiles: Pick<Profile, "email" | "full_name" | "payout_address" | "country"> };

function Action({
  action,
  id,
  label,
  kind = "btn",
}: {
  action: (fd: FormData) => Promise<void>;
  id: string;
  label: string;
  kind?: string;
}) {
  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <button className={`btn btn-sm ${kind}`}>{label}</button>
    </form>
  );
}

async function Content({ params, searchParams }: PageProps<"/admin/projects/[id]">) {
  await requireAdmin();
  const { id } = await params;
  const db = createAdminClient();
  const { data: project } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  if (!project) notFound();
  const p = project as Project;
  const { data } = await db
    .from("investments")
    .select("*, profiles(email, full_name, payout_address, country)")
    .eq("project_id", id)
    .order("created_at");
  const rows = (data ?? []) as Row[];
  const owed = rows.reduce((s, r) => s + Number(r.payout_amount ?? 0), 0);
  const settled = rows.some((r) => r.payout_amount != null);

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Link href="/admin" className="text-sm underline">
        Back to admin
      </Link>
      <div className="mt-4">
        <Flash searchParams={searchParams} />
      </div>
      <div className="grid gap-8 lg:grid-cols-[0.8fr_1.2fr]">
        <DealSheet project={p} link={false} />
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xl font-bold tracking-tight">Next step</h2>
            <Link href={`/admin/projects/${p.id}/edit`} className="btn btn-quiet btn-sm">
              Edit deal
            </Link>
          </div>
          {p.status === "draft" && (
            <>
              <p className="text-sm text-muted">
                Publishing makes the deal public and sends alerts to opted-in investors and your own channels.
              </p>
              <div className="flex gap-3">
                <Action action={publishProject} id={p.id} label="Publish and send alerts" />
                <Action action={cancelProject} id={p.id} label="Cancel deal" kind="btn-quiet" />
              </div>
            </>
          )}
          {p.status === "open" && (
            <>
              <p className="text-sm text-muted">
                Funding closes on its own at 100%. Close it early to run the deal with what has been raised, or cancel
                and refund.
              </p>
              <div className="flex gap-3">
                <Action action={closeFunding} id={p.id} label="Close funding now" />
                <Action action={cancelProject} id={p.id} label="Cancel deal" kind="btn-danger" />
              </div>
            </>
          )}
          {p.status === "funded" && (
            <>
              <p className="text-sm text-muted">
                When the buyer has paid: calculate payouts, send each investor their amount from your treasury wallet,
                then record each transaction hash below. The deal becomes “Repaid” when everyone is paid.
              </p>
              <div className="flex gap-3">
                <Action action={settleProject} id={p.id} label={settled ? "Recalculate payouts" : "Calculate payouts"} />
                <Action action={markDefaulted} id={p.id} label="Mark as defaulted" kind="btn-danger" />
              </div>
              {settled && <p className="text-sm font-semibold">Total owed to investors: {usd(owed, 2)}</p>}
            </>
          )}
          {["repaid", "defaulted", "cancelled"].includes(p.status) && (
            <p className="text-sm text-muted">This deal is finished. It stays on the public track record.</p>
          )}
        </div>
      </div>

      <h2 className="mt-10 text-xl font-bold tracking-tight">Investors in this deal</h2>
      <div className="panel mt-3 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Investor</th>
              <th>Subscribed</th>
              <th>Received</th>
              <th>Deposit</th>
              <th>Status</th>
              <th>Owed</th>
              <th>Pay to</th>
              <th>Record payment</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-muted">
                  Nobody has subscribed yet.
                </td>
              </tr>
            )}
            {rows.map((r) => {
              const over = Number(r.received_amount) > Number(r.committed_amount);
              const payable = p.status === "funded" && r.payout_amount != null && ["funded", "partially_funded"].includes(r.status);
              const refundable = p.status === "cancelled" && Number(r.received_amount) > 0 && r.status !== "refunded";
              return (
                <tr key={r.id}>
                  <td>
                    <div className="font-semibold">{r.profiles.full_name ?? "—"}</div>
                    <div className="text-muted">
                      {r.profiles.email} ({r.profiles.country ?? "?"})
                    </div>
                  </td>
                  <td>{usd(r.committed_amount, 2)}</td>
                  <td className={over ? "font-semibold text-amber" : ""}>
                    {usd(r.received_amount, 2)}
                    {over && <div className="text-xs">More than subscribed</div>}
                  </td>
                  <td className="break-all text-xs">
                    {r.expected_amount != null ? (
                      <span className="font-semibold">Pays {usd(r.expected_amount, 2)}</span>
                    ) : (
                      <>
                        {r.deposit_address ?? "—"}
                        <div className="text-muted">index {r.deposit_index}</div>
                      </>
                    )}
                  </td>
                  <td>
                    <InvestmentBadge status={r.status} />
                  </td>
                  <td>{r.payout_amount != null ? usd(r.payout_amount, 2) : "—"}</td>
                  <td className="break-all text-xs">{r.profiles.payout_address ?? "No wallet on file"}</td>
                  <td>
                    {payable || refundable ? (
                      <form action={payable ? markPaid : markRefunded} className="flex min-w-56 gap-2">
                        <input type="hidden" name="project_id" value={p.id} />
                        <input type="hidden" name="investment_id" value={r.id} />
                        <input className="field text-xs" name="tx" placeholder="0x… transaction hash" required />
                        <button className="btn btn-sm">{payable ? "Mark paid" : "Mark refunded"}</button>
                      </form>
                    ) : r.payout_tx ? (
                      <span className="break-all text-xs text-muted">{r.payout_tx}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/admin/projects/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content {...props} />
    </Suspense>
  );
}
