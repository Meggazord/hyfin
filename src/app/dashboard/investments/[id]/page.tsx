import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import QRCode from "qrcode";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { chainById, enabledChains } from "@/lib/chains";
import { InvestmentBadge, Loading } from "@/components/ui";
import { day, pct, shortAddr, usd } from "@/lib/format";
import type { Deposit, Investment, Project } from "@/lib/types";

async function Content({ params }: PageProps<"/dashboard/investments/[id]">) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();
  // Row level security limits this to the signed-in investor's own rows.
  const { data } = await supabase.from("investments").select("*, projects(*), deposits(*)").eq("id", id).maybeSingle();
  if (!data) notFound();
  const inv = data as Investment & { projects: Project; deposits: Deposit[] };
  const p = inv.projects;
  const outstanding = Math.max(0, Number(inv.committed_amount) - Number(inv.received_amount));
  const canDeposit = p.status === "open" && ["awaiting_deposit", "partially_funded"].includes(inv.status);
  const chains = enabledChains();
  const qr = inv.deposit_address
    ? await QRCode.toString(inv.deposit_address, { type: "svg", margin: 1, width: 184 })
    : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/dashboard" className="text-sm underline">
        Back to my investments
      </Link>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <h1 className="text-3xl font-bold tracking-tight">{p.title}</h1>
        <InvestmentBadge status={inv.status} />
      </div>

      <dl className="panel mt-6 grid gap-x-6 gap-y-4 p-6 sm:grid-cols-2">
        {[
          ["Subscribed", usd(inv.committed_amount, 2)],
          ["Received", usd(inv.received_amount, 2)],
          ["Return", `${pct(p.return_pct)} in ${p.term_days} days`],
          ["Repayment due", day(p.matures_at)],
          [
            "Due back",
            Number(inv.received_amount) > 0
              ? usd(Number(inv.received_amount) * (1 + Number(p.return_pct) / 100), 2)
              : "—",
          ],
          ["Repaid", inv.status === "repaid" ? `${usd(inv.payout_amount, 2)} on ${day(inv.paid_at)}` : "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="text-sm text-muted">{k}</dt>
            <dd className="font-semibold">{v}</dd>
          </div>
        ))}
      </dl>

      {canDeposit && inv.deposit_address && (
        <section className="sheet mt-6">
          <div className="px-5 py-5">
            <h2 className="text-xl font-bold tracking-tight">Send {usd(outstanding, 2)} to your deposit address</h2>
            <p className="mt-1 text-sm text-muted">
              This address is yours alone for this deal. You can send in more than one transfer.
            </p>
          </div>
          <div className="sheet-tear grid gap-6 px-5 py-5 sm:grid-cols-[200px_1fr]">
            {qr && (
              <div
                className="h-fit w-fit rounded-xl bg-white p-2"
                aria-label="QR code of your deposit address"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
            )}
            <div>
              <p className="label">Deposit address</p>
              <p className="select-all break-all rounded-lg border border-line bg-paper px-3 py-2.5 font-semibold text-teal-dark">{inv.deposit_address}</p>
              <p className="label mt-4">Accepted tokens and networks</p>
              {chains.length === 0 ? (
                <p className="text-sm text-red">Deposits are not switched on yet. Do not send funds.</p>
              ) : (
                <ul className="text-sm">
                  {chains.map((c) => (
                    <li key={c.id}>
                      <span className="font-semibold">{c.name}:</span> {c.tokens.map((t) => t.symbol).join(", ")}
                    </li>
                  ))}
                </ul>
              )}
              <p className="mt-4 rounded-md bg-amber-soft px-3 py-2 text-sm text-amber">
                Send only the tokens listed, on the networks listed. Anything else, including Tron (TRC-20) and
                Solana, cannot be credited and may be lost. Transfers cannot be reversed.
              </p>
            </div>
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-xl font-bold tracking-tight">Deposits</h2>
        {inv.deposits.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            Nothing received yet. A transfer appears here a few minutes after the network confirms it.
          </p>
        ) : (
          <div className="panel mt-3 overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Network</th>
                  <th>Transaction</th>
                </tr>
              </thead>
              <tbody>
                {inv.deposits.map((d) => {
                  const chain = chainById(d.chain_id);
                  return (
                    <tr key={d.id}>
                      <td>{day(d.created_at)}</td>
                      <td>
                        {usd(d.amount, 2)} {d.token}
                      </td>
                      <td>{chain?.name ?? d.chain_id}</td>
                      <td>
                        <a className="underline" href={`${chain?.explorer}/tx/${d.tx_hash}`} target="_blank" rel="noreferrer">
                          {shortAddr(d.tx_hash)}
                        </a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default function Page(props: PageProps<"/dashboard/investments/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Content {...props} />
    </Suspense>
  );
}
