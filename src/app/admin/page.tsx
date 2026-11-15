import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { enabledChains } from "@/lib/chains";
import { Flash, Loading, PageShell, ProjectBadge } from "@/components/ui";
import { day, pct, usd } from "@/lib/format";
import type { Project } from "@/lib/types";

async function Content({ searchParams }: PageProps<"/admin">) {
  await requireAdmin();
  const db = createAdminClient();
  const [{ data: projects }, { count: pending }, { count: waitlist }] = await Promise.all([
    db.from("projects").select("*").order("created_at", { ascending: false }),
    db.from("profiles").select("id", { count: "exact", head: true }).in("kyc", ["none", "pending"]),
    db.from("waitlist").select("email", { count: "exact", head: true }),
  ]);
  const rows = (projects ?? []) as Project[];
  const chains = enabledChains();

  return (
    <>
      <Flash searchParams={searchParams} />
      {(chains.length === 0 || !process.env.DEPOSIT_XPUB) && (
        <p className="mb-6 rounded-md bg-red-soft px-4 py-3 text-sm font-medium text-red">
          Deposits are off: {!process.env.DEPOSIT_XPUB ? "DEPOSIT_XPUB is not set. " : ""}
          {chains.length === 0 ? "No RPC URL is set for any network." : ""} Do not publish a deal until this is fixed.
        </p>
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
