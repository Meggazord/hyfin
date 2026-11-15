import Link from "next/link";
import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { checkEligibility } from "@/lib/eligibility";
import { Flash, InvestmentBadge, Loading, PageShell } from "@/components/ui";
import { day, pct, usd } from "@/lib/format";
import type { Investment, Project } from "@/lib/types";

type Row = Investment & { projects: Project };

async function Content({ searchParams }: PageProps<"/dashboard">) {
  const profile = await requireProfile();
  const supabase = await createClient();
  const { data } = await supabase
    .from("investments")
    .select("*, projects(*)")
    .order("created_at", { ascending: false });
  const rows = (data ?? []) as Row[];

  const active = rows.filter((r) => r.status === "funded" || r.status === "partially_funded");
  const repaid = rows.filter((r) => r.status === "repaid");
  const invested = active.reduce((s, r) => s + Number(r.received_amount), 0);
  const expected = active.reduce(
    (s, r) => s + Number(r.received_amount) * (1 + Number(r.projects.return_pct) / 100),
    0,
  );
  const earned = repaid.reduce((s, r) => s + (Number(r.payout_amount ?? 0) - Number(r.received_amount)), 0);
  const eligible = checkEligibility(profile);

  return (
    <>
      <Flash searchParams={searchParams} />
      {!eligible.ok && (
        <div className="mb-6 rounded-md bg-amber-soft px-4 py-3 text-sm text-amber">
          <p className="font-semibold">You cannot invest yet</p>
          <p>{eligible.reason}</p>
          {eligible.action && (
            <Link href={eligible.action === "risk" ? "/risk" : "/dashboard/profile"} className="mt-1 inline-block underline">
              {eligible.action === "risk" ? "Read the risk disclosure" : "Complete your profile"}
            </Link>
          )}
        </div>
      )}

      <dl className="grid gap-4 sm:grid-cols-3">
        {[
          ["Invested in running deals", usd(invested, 2)],
          ["Due back if all are repaid", usd(expected, 2)],
          ["Returns received so far", usd(earned, 2)],
        ].map(([label, value]) => (
          <div key={label} className="panel p-5">
            <dt className="text-sm text-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-bold tracking-tight">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-8 flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Your investments</h2>
        <Link href="/dashboard/profile" className="text-sm underline">
          Profile and payout wallet
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="panel mt-4 p-6">
          <p className="text-muted">You have not invested in a deal yet.</p>
          <Link href="/" className="btn mt-4">
            See open deals
          </Link>
        </div>
      ) : (
        <div className="panel mt-4 overflow-x-auto">
          <table className="table">
            <thead>
              <tr>
                <th>Deal</th>
                <th>Subscribed</th>
                <th>Received</th>
                <th>Return</th>
                <th>Due</th>
                <th>Repaid</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <Link href={`/dashboard/investments/${r.id}`} className="font-semibold underline">
                      {r.projects.title}
                    </Link>
                  </td>
                  <td>{usd(r.committed_amount)}</td>
                  <td>{usd(r.received_amount, 2)}</td>
                  <td>
                    {pct(r.projects.return_pct)} / {r.projects.term_days}d
                  </td>
                  <td>{day(r.projects.matures_at)}</td>
                  <td>{r.payout_amount && r.status === "repaid" ? usd(r.payout_amount, 2) : "—"}</td>
                  <td>
                    <InvestmentBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

export default function Dashboard(props: PageProps<"/dashboard">) {
  return (
    <PageShell title="My investments" wide>
      <Suspense fallback={<Loading />}>
        <Content {...props} />
      </Suspense>
    </PageShell>
  );
}
