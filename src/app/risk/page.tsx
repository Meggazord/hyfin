import { Suspense } from "react";
import { getProfile } from "@/lib/auth";
import { acknowledgeRisk } from "@/app/actions/investor";
import { Flash, PageShell } from "@/components/ui";
import { day } from "@/lib/format";

const RISKS: { title: string; body: string }[] = [
  {
    title: "You can lose everything",
    body: "Each deal is a short-term loan to a trading business. If the buyer does not pay, the goods are lost, damaged, rejected or delayed, or the borrower fails, you may get back less than you put in, or nothing.",
  },
  {
    title: "No insurance, no guarantee",
    body: "HyFin is not a bank. Your money is not a deposit, is not covered by any deposit insurance or investor compensation scheme, and is not guaranteed by HyFin or anyone else. The stated return is what the borrower has agreed to pay, not a promise that it will be paid.",
  },
  {
    title: "Your money is locked",
    body: "You cannot withdraw or sell your position before the deal is repaid. Repayment can be late. Only invest money you will not need during the term and for some time after it.",
  },
  {
    title: "Concentration and conflicts",
    body: "A deal depends on one borrower, one supplier and one buyer. Some borrowers are owned by HyFin's founder; when that is so, the deal page says it. In those deals HyFin is not independent and you rely on the same people on both sides.",
  },
  {
    title: "Stablecoin and blockchain risk",
    body: "USDC and USDT are issued by third parties and can lose their peg or be frozen by the issuer. Transfers cannot be reversed. If you send the wrong token, use the wrong network or send to the wrong address, the funds may be lost for good.",
  },
  {
    title: "Legal and tax",
    body: "These deals are available only to verified investors in permitted countries. You are responsible for checking that you may invest under your local law and for any tax on your returns. Nothing on this site is investment, legal or tax advice.",
  },
];

async function Acknowledge() {
  const profile = await getProfile();
  if (!profile) return null;
  if (profile.risk_ack_at) {
    return <p className="mt-8 text-sm text-muted">You accepted this disclosure on {day(profile.risk_ack_at)}.</p>;
  }
  return (
    <form action={acknowledgeRisk} className="panel mt-8 space-y-3 p-6">
      <h2 className="text-lg font-bold">Confirm you understand</h2>
      {[
        ["ack_loss", "I can lose all the money I invest."],
        ["ack_no_insurance", "My money is not a bank deposit and is not insured or guaranteed."],
        ["ack_illiquid", "I cannot withdraw before a deal is repaid, and repayment can be late."],
        ["ack_crypto", "Stablecoin transfers are irreversible and sending to the wrong network or address can lose my funds."],
      ].map(([name, text]) => (
        <label key={name} className="flex items-start gap-2 text-sm">
          <input type="checkbox" name={name} required className="mt-1" />
          <span>{text}</span>
        </label>
      ))}
      <button className="btn">Accept the risk disclosure</button>
    </form>
  );
}

export default function Risk({ searchParams }: PageProps<"/risk">) {
  return (
    <PageShell title="Risk disclosure">
      <Suspense fallback={null}>
        <Flash searchParams={searchParams} />
      </Suspense>
      <p className="max-w-2xl text-muted">
        Read this before you invest. It is written to be understood, not to be skipped.
      </p>
      <div className="mt-8 space-y-6">
        {RISKS.map((r) => (
          <section key={r.title}>
            <h2 className="text-xl font-bold tracking-tight">{r.title}</h2>
            <p className="mt-1 max-w-2xl text-muted">{r.body}</p>
          </section>
        ))}
      </div>
      <Suspense fallback={null}>
        <Acknowledge />
      </Suspense>
    </PageShell>
  );
}
