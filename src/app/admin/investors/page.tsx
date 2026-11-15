import Link from "next/link";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { reviewInvestor } from "@/app/actions/admin";
import { accreditedOnlyCountries, blockedCountries } from "@/lib/eligibility";
import { countryName } from "@/lib/countries";
import { Flash, Loading, PageShell } from "@/components/ui";
import { day } from "@/lib/format";
import type { Profile } from "@/lib/types";

async function Content({ searchParams }: PageProps<"/admin/investors">) {
  await requireAdmin();
  const { data } = await createAdminClient().from("profiles").select("*").order("created_at", { ascending: false });
  const rows = (data ?? []) as Profile[];
  const blocked = blockedCountries();
  const accreditedOnly = accreditedOnlyCountries();

  return (
    <>
      <Link href="/admin" className="text-sm underline">
        Back to admin
      </Link>
      <div className="mt-4">
        <Flash searchParams={searchParams} />
      </div>
      <p className="max-w-3xl text-sm text-muted">
        Approve an investor only after you have verified their identity and screened them against sanctions lists.
        Tick “Accredited” only after reasonable steps to verify it. Blocked countries: {blocked.join(", ")}. Accredited
        only: {accreditedOnly.join(", ")}.
      </p>
      <div className="panel mt-4 overflow-x-auto">
        <table className="table">
          <thead>
            <tr>
              <th>Investor</th>
              <th>Country</th>
              <th>Joined</th>
              <th>Risk disclosure</th>
              <th>Verification</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <div className="font-semibold">{r.full_name ?? "—"}</div>
                  <div className="text-muted">{r.email}</div>
                </td>
                <td>
                  {countryName(r.country)}
                  {r.country && blocked.includes(r.country) && <div className="text-xs font-semibold text-red">Blocked country</div>}
                  {r.country && accreditedOnly.includes(r.country) && (
                    <div className="text-xs font-semibold text-amber">Accredited only</div>
                  )}
                </td>
                <td>{day(r.created_at)}</td>
                <td>{r.risk_ack_at ? day(r.risk_ack_at) : "Not accepted"}</td>
                <td>
                  <form action={reviewInvestor} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="user_id" value={r.id} />
                    <select name="kyc" defaultValue={r.kyc === "none" ? "pending" : r.kyc} className="field w-auto text-sm" aria-label="Verification status">
                      <option value="pending">Pending</option>
                      <option value="approved">Approved</option>
                      <option value="rejected">Rejected</option>
                    </select>
                    <label className="flex items-center gap-1 text-sm">
                      <input type="checkbox" name="accredited" defaultChecked={r.accredited} />
                      Accredited
                    </label>
                    <button className="btn btn-sm">Save</button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Investors(props: PageProps<"/admin/investors">) {
  return (
    <PageShell title="Investors" wide>
      <Suspense fallback={<Loading />}>
        <Content {...props} />
      </Suspense>
    </PageShell>
  );
}
