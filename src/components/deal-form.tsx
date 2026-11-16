import type { Project } from "@/lib/types";

/** "2026-11-30T12:00:00Z" -> "2026-11-30T12:00" for datetime-local inputs (UTC). */
const toInput = (iso: string | null | undefined) => (iso ? new Date(iso).toISOString().slice(0, 16) : undefined);

type Props = {
  action: (fd: FormData) => Promise<void>;
  submitLabel: string;
  project?: Project;
  /** Money terms can't change once someone has subscribed. */
  lockTerms?: boolean;
  /** Funding dates can't change once funding has closed. */
  lockDates?: boolean;
};

export function DealForm({ action, submitLabel, project: p, lockTerms = false, lockDates = false }: Props) {
  return (
    <form action={action} className="panel space-y-4 p-6">
      {p && <input type="hidden" name="id" value={p.id} />}
      {lockTerms && (
        <p className="rounded-md bg-amber-soft px-4 py-3 text-sm text-amber">
          Investors have already subscribed, so the amounts, return, term and conflict-of-interest flag are locked. You
          can still edit the text{lockDates ? "" : " and extend the closing date"}.
        </p>
      )}
      <div>
        <label className="label" htmlFor="title">
          Title
        </label>
        <input className="field" id="title" name="title" required defaultValue={p?.title} placeholder="Purchase order: 1 container of …" />
      </div>
      <div>
        <label className="label" htmlFor="summary">
          Summary
        </label>
        <input className="field" id="summary" name="summary" required defaultValue={p?.summary} />
        <p className="hint">One or two sentences. Shown on the home page and in alerts.</p>
      </div>
      <div>
        <label className="label" htmlFor="borrower">
          Borrower
        </label>
        <input className="field" id="borrower" name="borrower" required defaultValue={p?.borrower} />
        <p className="hint">Shown publicly. Can be a description (e.g. &quot;US food importer&quot;) rather than a company name.</p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="related_party" className="mt-1" defaultChecked={p?.related_party} disabled={lockTerms} />
        <span>The borrower is owned by or affiliated with HyFin or its founder (shown to investors as a conflict of interest)</span>
      </label>
      <div>
        <label className="label" htmlFor="description">
          About this deal
        </label>
        <textarea className="field" id="description" name="description" rows={4} defaultValue={p?.description ?? ""} />
      </div>
      <div>
        <label className="label" htmlFor="use_of_funds">
          Use of funds
        </label>
        <textarea className="field" id="use_of_funds" name="use_of_funds" rows={3} defaultValue={p?.use_of_funds ?? ""} />
        <p className="hint">Who gets paid, for what, and how the buyer&apos;s payment comes back.</p>
      </div>
      <div>
        <label className="label" htmlFor="collateral">
          Security and collateral
        </label>
        <textarea className="field" id="collateral" name="collateral" rows={3} defaultValue={p?.collateral ?? ""} />
        <p className="hint">Leave empty if there is none. Investors are then told the deal is unsecured.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="target_amount">
            Target (USD)
          </label>
          <input className="field" id="target_amount" name="target_amount" type="number" step="0.01" min="1" required defaultValue={p?.target_amount} disabled={lockTerms} />
        </div>
        <div>
          <label className="label" htmlFor="min_ticket">
            Minimum (USD)
          </label>
          <input className="field" id="min_ticket" name="min_ticket" type="number" step="0.01" min="1" required defaultValue={p?.min_ticket ?? 100} disabled={lockTerms} />
        </div>
        <div>
          <label className="label" htmlFor="max_ticket">
            Maximum (USD)
          </label>
          <input className="field" id="max_ticket" name="max_ticket" type="number" step="0.01" min="1" defaultValue={p?.max_ticket ?? undefined} disabled={lockTerms} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="return_pct">
            Return for the whole term (%)
          </label>
          <input className="field" id="return_pct" name="return_pct" type="number" step="0.001" min="0" required defaultValue={p?.return_pct} disabled={lockTerms} />
          <p className="hint">Not annual. 7.5 means investors get 7.5% on top of principal at the end.</p>
        </div>
        <div>
          <label className="label" htmlFor="term_days">
            Term (days after funding closes)
          </label>
          <input className="field" id="term_days" name="term_days" type="number" min="1" required defaultValue={p?.term_days} disabled={lockTerms} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="opens_at">
            Funding opens
          </label>
          <input className="field" id="opens_at" name="opens_at" type="datetime-local" required defaultValue={toInput(p?.opens_at)} disabled={lockTerms || lockDates} />
        </div>
        <div>
          <label className="label" htmlFor="closes_at">
            Funding closes
          </label>
          <input className="field" id="closes_at" name="closes_at" type="datetime-local" required defaultValue={toInput(p?.closes_at)} disabled={lockDates} />
          <p className="hint">Times are UTC. Funding also closes as soon as the target is reached.</p>
        </div>
      </div>
      <button className="btn">{submitLabel}</button>
    </form>
  );
}
