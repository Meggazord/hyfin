import Link from "next/link";
import { annualised, day, pct, usd } from "@/lib/format";
import type { InvestmentStatus, Project, ProjectStatus } from "@/lib/types";

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

/** Shows the ?error= or ?notice= message a server action redirected back with. */
export async function Flash({ searchParams }: { searchParams: Search }) {
  const sp = await searchParams;
  const error = typeof sp.error === "string" ? sp.error : null;
  const notice = typeof sp.notice === "string" ? sp.notice : null;
  if (!error && !notice) return null;
  return (
    <p
      role={error ? "alert" : "status"}
      className={`mb-5 rounded-md px-4 py-3 text-sm font-medium ${
        error ? "bg-red-soft text-red" : "bg-teal-soft text-teal-dark"
      }`}
    >
      {error ?? notice}
    </p>
  );
}

export function Progress({ raised, target }: { raised: number; target: number }) {
  const ratio = Math.max(0, Math.min(1, Number(raised) / Number(target)));
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between text-sm">
        <span>
          <span className="font-display text-lg font-bold text-ink">{usd(raised)}</span>{" "}
          <span className="text-muted">raised of {usd(target)}</span>
        </span>
        <span className="font-semibold text-teal-dark">{Math.floor(ratio * 100)}%</span>
      </div>
      <div
        className="meter"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        aria-label="Funding progress"
      >
        <div style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 2 : 0)}%` }} />
      </div>
    </div>
  );
}

const PROJECT_LABEL: Record<ProjectStatus, string> = {
  draft: "Draft",
  open: "Open for funding",
  funded: "Funded, in progress",
  repaid: "Repaid",
  defaulted: "Defaulted",
  cancelled: "Cancelled",
};
const INVESTMENT_LABEL: Record<InvestmentStatus, string> = {
  awaiting_deposit: "Waiting for your deposit",
  partially_funded: "Partly paid",
  funded: "Active",
  repaid: "Repaid",
  refunded: "Refunded",
  expired: "Expired",
  defaulted: "Defaulted",
};
const tone = (s: string) =>
  s === "defaulted" || s === "cancelled"
    ? "bg-red-soft text-red"
    : s === "awaiting_deposit" || s === "partially_funded" || s === "draft" || s === "expired"
      ? "bg-amber-soft text-amber"
      : "bg-teal-soft text-teal-dark";

export function ProjectBadge({ status }: { status: ProjectStatus }) {
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone(status)}`}>
      {PROJECT_LABEL[status]}
    </span>
  );
}
export function InvestmentBadge({ status }: { status: InvestmentStatus }) {
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${tone(status)}`}>
      {INVESTMENT_LABEL[status]}
    </span>
  );
}

/** The deal card. Used on the home page, the deal page and in admin. */
export function DealSheet({ project, link = true }: { project: Project; link?: boolean }) {
  const p = project;
  return (
    <article className="sheet">
      <div className="flex items-center justify-between gap-3 px-6 pt-5 text-sm">
        <span className="flex items-center gap-2 text-muted">
          {p.status === "open" && <span className="live-dot" aria-hidden />}
          {p.borrower}
        </span>
        <ProjectBadge status={p.status} />
      </div>
      <div className="px-6 pb-5 pt-3">
        <h3 className="text-xl font-bold leading-snug">{p.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">{p.summary}</p>
      </div>
      <div className="grid grid-cols-2 border-y border-line">
        <div className="border-r border-line px-6 py-5">
          <p className="text-sm text-muted">Return for the term</p>
          <p className="font-display text-glow mt-1 text-4xl font-extrabold tracking-tight">{pct(p.return_pct)}</p>
          <p className="mt-1 text-sm text-muted">in {p.term_days} days</p>
        </div>
        <div className="px-6 py-5">
          <p className="text-sm text-muted">Annualised</p>
          <p className="font-display mt-1 text-4xl font-extrabold tracking-tight">
            {pct(annualised(p.return_pct, p.term_days))}
          </p>
          <p className="mt-1 text-sm text-muted">simple, not compounded</p>
        </div>
      </div>
      <dl>
        <div className="sheet-row !border-t-0">
          <dt className="text-muted">{p.status === "open" ? "Funding window" : "Repayment due"}</dt>
          <dd className="text-right font-semibold">
            {p.status === "open" ? `${day(p.opens_at)} to ${day(p.closes_at)}` : day(p.matures_at)}
          </dd>
        </div>
        <div className="sheet-row">
          <dt className="text-muted">Minimum</dt>
          <dd className="font-semibold">{usd(p.min_ticket)}</dd>
        </div>
      </dl>
      <div className="sheet-tear px-6 py-5">
        <Progress raised={p.raised_amount} target={p.target_amount} />
        {link && (
          <Link href={`/projects/${p.slug}`} className="btn mt-5 w-full">
            {p.status === "open" ? "See the deal" : "View details"}
          </Link>
        )}
      </div>
    </article>
  );
}

export function PageShell({ title, children, wide }: { title: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`mx-auto px-5 py-10 ${wide ? "max-w-6xl" : "max-w-3xl"}`}>
      <h1 className="mb-6 text-3xl font-bold sm:text-4xl">{title}</h1>
      {children}
    </div>
  );
}

export const Loading = () => <p className="px-5 py-10 text-center text-sm text-muted">Loading…</p>;
