import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createProject } from "@/app/actions/admin";
import { Flash, Loading, PageShell } from "@/components/ui";

async function Guard({ searchParams }: PageProps<"/admin/projects/new">) {
  await requireAdmin();
  return (
    <>
      <Flash searchParams={searchParams} />
      <form action={createProject} className="panel space-y-4 p-6">
        <div>
          <label className="label" htmlFor="title">
            Title
          </label>
          <input className="field" id="title" name="title" required placeholder="Purchase order: 1 container of …" />
        </div>
        <div>
          <label className="label" htmlFor="summary">
            Summary
          </label>
          <input className="field" id="summary" name="summary" required />
          <p className="hint">One or two sentences. Shown on the home page and in alerts.</p>
        </div>
        <div>
          <label className="label" htmlFor="borrower">
            Borrower
          </label>
          <input className="field" id="borrower" name="borrower" required />
        </div>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="related_party" className="mt-1" />
          <span>The borrower is owned by or affiliated with HyFin or its founder (shown to investors as a conflict of interest)</span>
        </label>
        <div>
          <label className="label" htmlFor="description">
            About this deal
          </label>
          <textarea className="field" id="description" name="description" rows={4} />
        </div>
        <div>
          <label className="label" htmlFor="use_of_funds">
            Use of funds
          </label>
          <textarea className="field" id="use_of_funds" name="use_of_funds" rows={3} />
          <p className="hint">Who gets paid, for what, and how the buyer&apos;s payment comes back.</p>
        </div>
        <div>
          <label className="label" htmlFor="collateral">
            Security and collateral
          </label>
          <textarea className="field" id="collateral" name="collateral" rows={3} />
          <p className="hint">Leave empty if there is none. Investors are then told the deal is unsecured.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="target_amount">
              Target (USD)
            </label>
            <input className="field" id="target_amount" name="target_amount" type="number" step="0.01" min="1" required />
          </div>
          <div>
            <label className="label" htmlFor="min_ticket">
              Minimum (USD)
            </label>
            <input className="field" id="min_ticket" name="min_ticket" type="number" step="0.01" min="1" defaultValue={100} required />
          </div>
          <div>
            <label className="label" htmlFor="max_ticket">
              Maximum (USD)
            </label>
            <input className="field" id="max_ticket" name="max_ticket" type="number" step="0.01" min="1" />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="return_pct">
              Return for the whole term (%)
            </label>
            <input className="field" id="return_pct" name="return_pct" type="number" step="0.001" min="0" required />
            <p className="hint">Not annual. 7.5 means investors get 7.5% on top of principal at the end.</p>
          </div>
          <div>
            <label className="label" htmlFor="term_days">
              Term (days after funding closes)
            </label>
            <input className="field" id="term_days" name="term_days" type="number" min="1" required />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label" htmlFor="opens_at">
              Funding opens
            </label>
            <input className="field" id="opens_at" name="opens_at" type="datetime-local" required />
          </div>
          <div>
            <label className="label" htmlFor="closes_at">
              Funding closes
            </label>
            <input className="field" id="closes_at" name="closes_at" type="datetime-local" required />
            <p className="hint">Times are UTC. Funding also closes as soon as the target is reached.</p>
          </div>
        </div>
        <button className="btn">Save as draft</button>
      </form>
    </>
  );
}

export default function NewProject(props: PageProps<"/admin/projects/new">) {
  return (
    <PageShell title="Create a deal">
      <Suspense fallback={<Loading />}>
        <Guard {...props} />
      </Suspense>
    </PageShell>
  );
}
