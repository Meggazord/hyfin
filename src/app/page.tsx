import Link from "next/link";
import { Suspense } from "react";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConfigured } from "@/lib/env";
import { DealSheet, Flash, Loading } from "@/components/ui";
import { joinWaitlist } from "@/app/actions/investor";
import type { Project } from "@/lib/types";

async function loadDeals(): Promise<{ open: Project[]; past: Project[] }> {
  await cookies(); // always render deals at request time
  // The hyfin schema is closed to anonymous API access, so published deals are
  // read on the server with the service key. Drafts are never selected.
  if (!isConfigured() || !process.env.SUPABASE_SECRET_KEY) return { open: [], past: [] };
  const { data } = await createAdminClient()
    .from("projects")
    .select("*")
    .in("status", ["open", "funded", "repaid", "defaulted"])
    .order("opens_at", { ascending: false })
    .limit(20);
  const all = (data ?? []) as Project[];
  return { open: all.filter((p) => p.status === "open"), past: all.filter((p) => p.status !== "open") };
}

async function FeaturedDeal() {
  const { open } = await loadDeals();
  if (open.length === 0) {
    return (
      <div className="sheet px-6 py-10">
        <h3 className="text-xl font-bold">No deal is open right now</h3>
        <p className="mt-2 text-sm text-muted">
          Deals open one at a time and close when they are fully funded. Leave your email below and we will tell you
          when the next one opens.
        </p>
        <Link href="#updates" className="btn mt-5">
          Get new-deal alerts
        </Link>
      </div>
    );
  }
  return <DealSheet project={open[0]} />;
}

async function DealLists() {
  const { open, past } = await loadDeals();
  return (
    <>
      {open.length > 1 && (
        <section className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-3xl font-bold">More open deals</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {open.slice(1).map((p) => (
              <DealSheet key={p.id} project={p} />
            ))}
          </div>
        </section>
      )}
      {past.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-14">
          <h2 className="text-3xl font-bold">Track record</h2>
          <p className="mt-2 max-w-2xl text-muted">
            Every deal we have funded, including any that were repaid late or not at all.
          </p>
          <div className="mt-6 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {past.map((p) => (
              <DealSheet key={p.id} project={p} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}

const STEPS = [
  {
    title: "We publish a deal",
    body: "Each deal finances one purchase order. You see the amount, the term, the fixed return, who the borrower is and what the money buys.",
  },
  {
    title: "You fund it in USDC or USDT",
    body: "Subscribe for an amount and you get an exact USDC amount to send on Base. The cents identify your payment, and it shows up in your account once the network confirms it.",
  },
  {
    title: "The money pays the supplier",
    body: "When the deal is fully funded the term starts. The goods are bought, shipped and delivered to the buyer.",
  },
  {
    title: "You are repaid when the buyer pays",
    body: "At the end of the term your principal and return are sent to the wallet address in your profile.",
  },
];

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <>
      <section className="relative overflow-hidden">
        <div className="hero-grid" aria-hidden />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-20 pt-14 lg:grid-cols-[1.08fr_0.92fr] lg:pt-24">
          <div>
            <p className="chip">
              <span className="live-dot" aria-hidden />
              Pay in USDC or USDT on Base, Arbitrum and Ethereum
            </p>
            <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.04] sm:text-6xl lg:whitespace-nowrap">
              Real trade deals.
              <br />
              <span className="text-glow">Funded on{"\u2011"}chain.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted">
              HyFin finances purchase orders for trading businesses. You fund a deal in stablecoins, the money pays the
              supplier, and you are repaid with a fixed return when the buyer pays.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/signup" className="btn">
                Create account
              </Link>
              <Link href="#how" className="btn btn-quiet">
                How a deal works
              </Link>
            </div>
            <p className="mt-8 max-w-xl border-l-2 border-amber pl-4 text-sm leading-relaxed text-amber">
              You can lose all the money you invest. Deals are not bank deposits, are not insured, and cannot be
              withdrawn before the term ends.
            </p>
          </div>
          <Suspense fallback={<div className="sheet px-6 py-10 text-sm text-muted">Loading the current deal…</div>}>
            <FeaturedDeal />
          </Suspense>
        </div>
      </section>

      <Suspense fallback={<Loading />}>
        <DealLists />
      </Suspense>

      <section id="how" className="border-y border-line bg-surface/70">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <h2 className="text-3xl font-bold sm:text-4xl">How a deal works</h2>
          <ol className="mt-12 grid gap-10 md:grid-cols-2 lg:grid-cols-4 lg:gap-0">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative lg:pr-8">
                <div className="flex items-center">
                  <span className="font-display flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-teal/50 bg-teal-soft text-sm font-bold text-teal-dark">
                    {i + 1}
                  </span>
                  {i < STEPS.length - 1 && (
                    <span className="ml-3 hidden h-px flex-1 bg-gradient-to-r from-teal/50 to-transparent lg:block" />
                  )}
                </div>
                <h3 className="mt-5 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20">
        <h2 className="max-w-2xl text-3xl font-bold sm:text-4xl">What stands behind a deal, and what does not</h2>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          <div className="panel border-t-2 !border-t-teal p-7">
            <h3 className="text-lg font-bold">What you can check</h3>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-muted marker:text-teal">
              <li>Each deal is tied to one named purchase order, not a pool.</li>
              <li>The deal page states the borrower, the use of funds and any collateral.</li>
              <li>Every deposit and every repayment is an on-chain transaction you can look up.</li>
              <li>Deposits sit in a Safe vault that needs two separate keys to move money. The website holds neither.</li>
              <li>Past deals stay listed, including late or failed ones.</li>
            </ul>
          </div>
          <div className="panel border-t-2 !border-t-amber p-7">
            <h3 className="text-lg font-bold">What you should not assume</h3>
            <ul className="mt-4 list-disc space-y-2.5 pl-5 text-sm leading-relaxed text-muted marker:text-amber">
              <li>Repayment is not guaranteed. If the buyer does not pay or goods are lost, you can lose everything.</li>
              <li>There is no deposit insurance and no government protection scheme.</li>
              <li>You cannot exit early. Your money is locked until the deal is repaid.</li>
              <li>A high return means high risk. It is not a savings rate.</li>
              <li>Some borrowers are owned by HyFin&apos;s founder. The deal page says so when that is the case.</li>
            </ul>
          </div>
        </div>
      </section>

      <section id="updates" className="px-5 pb-20">
        <div className="sheet mx-auto max-w-4xl px-6 py-12 text-center sm:px-12">
          <h2 className="text-3xl font-bold">Hear about the next deal</h2>
          <p className="mt-3 text-muted">One email when a deal opens. Nothing else.</p>
          <div className="mx-auto mt-7 max-w-lg text-left">
            <Suspense fallback={null}>
              <Flash searchParams={searchParams} />
            </Suspense>
            <form action={joinWaitlist} className="flex flex-col gap-3 sm:flex-row">
              <label htmlFor="waitlist-email" className="sr-only">
                Email address
              </label>
              <input
                id="waitlist-email"
                name="email"
                type="email"
                required
                placeholder="you@example.com"
                className="field"
              />
              <button className="btn">Get new-deal alerts</button>
            </form>
          </div>
        </div>
      </section>
    </>
  );
}
