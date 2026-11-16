-- Pooled deposits into one Safe multisig on Base.
-- Each subscription gets a unique amount (committed + 0.01–0.99) so a transfer
-- can be matched to its investor. Transfers that match nothing are parked for
-- an admin to assign.

alter table hyfin.investments drop constraint if exists investments_deposit_address_key;

alter table hyfin.investments add column if not exists expected_amount numeric(18, 2);

-- No two open subscriptions may ask for the same exact amount.
create unique index if not exists investments_expected_amount_live
  on hyfin.investments (expected_amount)
  where expected_amount is not null and status in ('awaiting_deposit', 'partially_funded');

create table if not exists hyfin.unmatched_deposits (
  id uuid primary key default gen_random_uuid(),
  chain_id integer not null,
  token text not null,
  tx_hash text not null,
  log_index integer not null,
  from_address text,
  amount numeric(30, 6) not null check (amount > 0),
  block_number bigint not null,
  assigned_investment uuid references hyfin.investments (id),
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);

alter table hyfin.unmatched_deposits enable row level security;
revoke all on hyfin.unmatched_deposits from anon, authenticated;
grant all on hyfin.unmatched_deposits to service_role;
