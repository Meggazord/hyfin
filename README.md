# HyFin web MVP

Deal-by-deal working capital financing funded in stablecoins. Investors subscribe to one
purchase-order deal, send USDC/USDT to a deposit address that is unique to their
subscription, and are repaid principal plus a fixed return when the deal settles.

Stack: Next.js 16 (App Router) + Supabase (Auth, Postgres, RLS) + ethers. Hosted on Cloudflare Workers through the OpenNext adapter.

## How a deal runs

| Step | Who | What happens | Where |
| --- | --- | --- | --- |
| 1 | Admin | Creates a deal as a draft: target, return for the term, term in days, funding window, borrower, use of funds, collateral, related-party flag | `/admin/projects/new` |
| 2 | Admin | Publishes. Deal goes public; alerts go to opted-in investors (email) and your own Telegram channel / Discord | `/admin/projects/[id]` |
| 3 | Investor | Signs up, is verified by an admin, adds a payout wallet, accepts the risk disclosure | `/signup`, `/dashboard/profile`, `/risk` |
| 4 | Investor | Subscribes for an amount. Gets a deposit address + QR that belongs to that subscription only | `/projects/[slug]` → `/dashboard/investments/[id]` |
| 5 | Scanner | Every few minutes reads Transfer logs on each enabled network and credits confirmed deposits. Raised amount updates. Unpaid reservations expire after 48h | `/api/cron/scan` |
| 6 | System | At 100% (or when the admin closes early) funding stops and the term clock starts | `close_funding()` |
| 7 | Admin | When the buyer pays: calculate payouts, pay each investor from the treasury wallet, paste each tx hash. Deal becomes Repaid when all are paid | `/admin/projects/[id]` |
| – | Admin | Other exits: cancel (refund each deposit, record tx) or mark as defaulted. Finished deals stay on the public track record | same page |

Money never touches the server. Deposit addresses are derived from an extended **public**
key (`DEPOSIT_XPUB`), so the app can create and watch addresses but cannot spend. The seed
stays on a hardware wallet; deposit index `i` is account `i` at `m/44'/60'/0'/0/i`.

## Setup

All tables live in a separate Postgres schema called `hyfin`, so the app can share a
Supabase project with other apps. Sign-ups are tagged `app: hyfin`; only those get a
HyFin profile.

1. `npm install`
2. In Supabase: run `supabase/migrations/0001_init.sql` in the SQL editor, then add
   `hyfin` under Project Settings > API > Exposed schemas.
3. `cp .env.example .env.local` and fill it in. `SUPABASE_SECRET_KEY` is the
   `service_role` key on projects that still use the legacy keys.
4. `npm run dev`, sign up, then make yourself admin in the SQL editor:
   `update hyfin.profiles set role = 'admin', kyc = 'approved' where email = 'you@example.com';`

For a dry run: `npm run make:test-xpub` prints a throwaway xpub.

## Deploy to Cloudflare

- `npm run cf:preview` runs the production build locally on the Workers runtime
  (put secrets in `.dev.vars`). `npm run cf:deploy` builds and deploys.
- With Workers Builds (GitHub connected): build command `npx opennextjs-cloudflare build`,
  deploy command `npx wrangler deploy`.
- `NEXT_PUBLIC_*` values are baked in at build time, so set them as build variables.
  Everything else in `.env.example` goes in as Worker secrets/variables.
- `wrangler.jsonc` schedules the deposit scanner every 5 minutes (`custom-worker.ts`).
  It needs `CRON_SECRET` to be set.
- In Supabase > Authentication > URL configuration, add `https://<your-domain>/auth/callback`
  to the redirect URLs.

## Tests

`npm test` runs:

- `test:schema` – the migration on an in-memory Postgres: eligibility gates, reservation
  limits, duplicate-deposit handling, auto-close at 100%, payout maths, row level security.
- `test:wallet` – address derivation against known vectors, refusal of private keys,
  Transfer log decoding.

## Accepted tokens

Configured in `src/lib/chains.ts`: USDC on Base; USDC and USDT on Arbitrum and Ethereum.
A network is offered only when its `RPC_*` variable is set. Re-check every contract
address against Circle's and Tether's own lists before going live. Tron (TRC-20) and
Solana are not supported; the deposit page tells investors so.

## Before real money

Not optional. None of this is built or decided by the code:

- **Legal structure.** Offering a return to the public is a securities offering in most
  countries. Get a securities lawyer to choose the route (for example US accredited-only
  with verification, non-US only, or a licensed platform partner), write the investor
  agreement and loan note, and set `BLOCKED_COUNTRIES` / `ACCREDITED_ONLY_COUNTRIES`.
  The defaults are placeholders.
- **KYC / sanctions screening.** The admin approves investors by hand. Plug in a provider
  (Sumsub, Persona, Veriff) before volume.
- **Treasury operations.** Each deposit address needs a little gas to be swept to the
  treasury. Use a multisig for the treasury, not a single key.
- **Deal documents.** Add document uploads (PO, invoice, bill of lading) to the deal page.
- **Legal pages.** Terms, privacy policy, and the risk disclosure need legal review.
- **Own Supabase project.** Sharing a project is fine for testing. Before real investors,
  move HyFin to its own project: logins, email templates and the Site URL are shared
  with the other app until then.

## Not built yet

- Savings wallet with auto-subscribe (phase 2: needs a custody and yield partner)
- Mobile apps
- Document uploads, investor agreements with e-signature
- Automated payouts (deliberately manual: no spending keys on the server)
- Tron / Solana deposits
