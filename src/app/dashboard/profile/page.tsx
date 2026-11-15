import Link from "next/link";
import { Suspense } from "react";
import { requireProfile } from "@/lib/auth";
import { updateProfile } from "@/app/actions/investor";
import { Flash, Loading, PageShell } from "@/components/ui";
import { COUNTRIES } from "@/lib/countries";
import { day } from "@/lib/format";

const KYC_TEXT = {
  none: "Not verified yet. We will contact you by email to verify your identity.",
  pending: "Verification in progress.",
  approved: "Verified.",
  rejected: "Not approved.",
} as const;

async function Content({ searchParams }: PageProps<"/dashboard/profile">) {
  const p = await requireProfile();
  return (
    <>
      <Flash searchParams={searchParams} />
      <form action={updateProfile} className="panel max-w-xl space-y-4 p-6">
        <div>
          <label className="label" htmlFor="full_name">
            Full legal name
          </label>
          <input className="field" id="full_name" name="full_name" defaultValue={p.full_name ?? ""} required />
        </div>
        <div>
          <label className="label" htmlFor="country">
            Country of residence
          </label>
          <select className="field" id="country" name="country" defaultValue={p.country ?? ""} required>
            <option value="" disabled>
              Choose a country
            </option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="payout_address">
            Payout wallet address
          </label>
          <input
            className="field"
            id="payout_address"
            name="payout_address"
            defaultValue={p.payout_address ?? ""}
            placeholder="0x…"
            spellCheck={false}
          />
          <p className="hint">
            Repayments are sent here in USDC or USDT. Use a wallet you control on Base, Arbitrum or Ethereum. Do not
            use an exchange deposit address unless the exchange confirms it accepts that token on that network.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="notify_new_projects" defaultChecked={p.notify_new_projects} />
          Email me when a new deal opens
        </label>
        <button className="btn">Save profile</button>
      </form>

      <dl className="panel mt-6 max-w-xl space-y-3 p-6 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Email</dt>
          <dd className="font-semibold">{p.email}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Identity verification</dt>
          <dd className="text-right font-semibold">{KYC_TEXT[p.kyc]}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted">Risk disclosure</dt>
          <dd className="font-semibold">
            {p.risk_ack_at ? (
              `Accepted ${day(p.risk_ack_at)}`
            ) : (
              <Link href="/risk" className="underline">
                Read and accept
              </Link>
            )}
          </dd>
        </div>
      </dl>
    </>
  );
}

export default function Profile(props: PageProps<"/dashboard/profile">) {
  return (
    <PageShell title="Profile">
      <Suspense fallback={<Loading />}>
        <Content {...props} />
      </Suspense>
    </PageShell>
  );
}
