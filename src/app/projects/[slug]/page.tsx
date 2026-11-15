import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getProfile } from "@/lib/auth";
import { checkEligibility } from "@/lib/eligibility";
import { subscribe } from "@/app/actions/investor";
import { DealSheet, Flash, Loading } from "@/components/ui";
import { day, pct, usd } from "@/lib/format";
import type { Investment, Project } from "@/lib/types";

async function SubscribeBox({ project }: { project: Project }) {
  const p = project;
  if (p.status !== "open") {
    return (
      <div className="panel p-6">
        <h2 className="text-lg font-bold">This deal is closed to new money</h2>
        <p className="mt-2 text-sm text-muted">
          {p.status === "funded"
            ? `It is funded and running. Repayment is due ${day(p.matures_at)}.`
            : "See the status above for how it ended."}
        </p>
      </div>
    );
  }
  const profile = await getProfile();
  if (!profile) {
    return (
      <div className="panel p-6">
        <h2 className="text-lg font-bold">Invest in this deal</h2>
        <p className="mt-2 text-sm text-muted">You need a verified account to invest.</p>
        <div className="mt-4 flex gap-3">
          <Link href="/signup" className="btn">
            Create account
          </Link>
          <Link href="/login" className="btn btn-quiet">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("investments")
    .select("*")
    .eq("project_id", p.id)
    .not("status", "in", "(expired,refunded)")
    .maybeSingle();
  if (existing) {
    const inv = existing as Investment;
    return (
      <div className="panel p-6">
        <h2 className="text-lg font-bold">You are subscribed for {usd(inv.committed_amount)}</h2>
        <p className="mt-2 text-sm text-muted">Received so far: {usd(inv.received_amount, 2)}.</p>
        <Link href={`/dashboard/investments/${inv.id}`} className="btn mt-4">
          View deposit address
        </Link>
      </div>
    );
  }

  const eligible = checkEligibility(profile);
  if (!eligible.ok) {
    return (
      <div className="panel p-6">
        <h2 className="text-lg font-bold">You cannot invest yet</h2>
        <p className="mt-2 text-sm text-muted">{eligible.reason}</p>
        {eligible.action === "profile" && (
          <Link href="/dashboard/profile" className="btn mt-4">
            Complete your profile
          </Link>
        )}
        {eligible.action === "risk" && (
          <Link href="/risk" className="btn mt-4">
            Read the risk disclosure
          </Link>
        )}
      </div>
    );
  }

  const remaining = Math.max(0, Number(p.target_amount) - Number(p.raised_amount));
  return (
    <form action={subscribe} className="panel space-y-4 p-6">
      <h2 className="text-lg font-bold">Invest in this deal</h2>
      <input type="hidden" name="project_id" value={p.id} />
      <input type="hidden" name="slug" value={p.slug} />
      <div>
        <label className="label" htmlFor="amount">
          Amount in US dollars
        </label>
        <input
          className="field"
          id="amount"
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={p.min_ticket}
          max={p.max_ticket ?? undefined}
          required
        />
        <p className="hint">
          Minimum {usd(p.min_ticket)}
          {p.max_ticket ? `, maximum ${usd(p.max_ticket)}` : ""}. About {usd(remaining)} left to raise.
        </p>
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="confirm_risk" required className="mt-1" />
        <span>
          I understand that I can lose all of this money, that it is locked for about {p.term_days} days, and that the{" "}
          {pct(p.return_pct)} return is a target the borrower has agreed to pay, not a guarantee.
        </span>
      </label>
      <button className="btn w-full">Get my deposit address</button>
      <p className="hint">Next you will see the address to send USDC or USDT to. Nothing is charged until you send.</p>
    </form>
  );
}

async function Deal({ params, searchParams }: PageProps<"/projects/[slug]">) {
  const { slug } = await params;
  // Read with the service key (the schema is closed to anonymous access); never show drafts.
  if (!process.env.SUPABASE_SECRET_KEY) notFound();
  const { data } = await createAdminClient()
    .from("projects")
    .select("*")
    .eq("slug", slug)
    .neq("status", "draft")
    .maybeSingle();
  if (!data) notFound();
  const p = data as Project;

  return (
    <div className="mx-auto max-w-6xl px-5 py-10">
      <Flash searchParams={searchParams} />
      <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-8">
          <DealSheet project={p} link={false} />
          {p.related_party && (
            <p className="rounded-md bg-amber-soft px-4 py-3 text-sm font-medium text-amber">
              Conflict of interest: the borrower, {p.borrower}, is owned by HyFin&apos;s founder. HyFin is not an
              independent party in this deal.
            </p>
          )}
          {p.description && (
            <section>
              <h2 className="text-xl font-bold tracking-tight">About this deal</h2>
              <p className="mt-2 whitespace-pre-line text-muted">{p.description}</p>
            </section>
          )}
          <section>
            <h2 className="text-xl font-bold tracking-tight">Use of funds</h2>
            <p className="mt-2 whitespace-pre-line text-muted">{p.use_of_funds ?? "Not stated."}</p>
          </section>
          <section>
            <h2 className="text-xl font-bold tracking-tight">Security and collateral</h2>
            <p className="mt-2 whitespace-pre-line text-muted">
              {p.collateral ?? "None. This deal is unsecured: if the borrower does not repay, there is nothing to claim against."}
            </p>
          </section>
        </div>
        <div className="space-y-6">
          <SubscribeBox project={p} />
          <p className="text-sm text-muted">
            Capital at risk. Read the{" "}
            <Link href="/risk" className="underline">
              risk disclosure
            </Link>{" "}
            before you invest.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function Page(props: PageProps<"/projects/[slug]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Deal {...props} />
    </Suspense>
  );
}
