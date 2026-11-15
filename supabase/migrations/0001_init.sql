-- HyFin MVP schema
-- Everything lives in its own "hyfin" schema so it can share a Supabase project
-- with other apps without touching their tables.
-- After running this, add "hyfin" to Project Settings > API > Exposed schemas.

create schema if not exists hyfin;
grant usage on schema hyfin to anon, authenticated, service_role;

create type hyfin.user_role as enum ('investor', 'admin');
create type hyfin.kyc_status as enum ('none', 'pending', 'approved', 'rejected');
create type hyfin.project_status as enum ('draft', 'open', 'funded', 'repaid', 'defaulted', 'cancelled');
create type hyfin.investment_status as enum (
  'awaiting_deposit', 'partially_funded', 'funded', 'repaid', 'refunded', 'expired', 'defaulted'
);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table hyfin.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  country text,                                   -- ISO 3166-1 alpha-2
  role hyfin.user_role not null default 'investor',
  kyc hyfin.kyc_status not null default 'none',
  accredited boolean not null default false,      -- set by admin after verification
  payout_address text,                            -- EVM address repayments are sent to
  notify_new_projects boolean not null default true,
  risk_ack_at timestamptz,
  created_at timestamptz not null default now()
);

create table hyfin.projects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text not null,
  description text,
  borrower text not null,
  related_party boolean not null default false,   -- borrower is affiliated with HyFin
  use_of_funds text,
  collateral text,
  target_amount numeric(18, 2) not null check (target_amount > 0),
  min_ticket numeric(18, 2) not null default 100 check (min_ticket > 0),
  max_ticket numeric(18, 2),
  return_pct numeric(6, 3) not null check (return_pct >= 0),  -- for the whole term, e.g. 7.5
  term_days integer not null check (term_days > 0),
  opens_at timestamptz not null,
  closes_at timestamptz not null,
  funded_at timestamptz,
  matures_at timestamptz,
  status hyfin.project_status not null default 'draft',
  raised_amount numeric(18, 6) not null default 0,  -- confirmed on-chain deposits
  created_by uuid references hyfin.profiles (id),
  created_at timestamptz not null default now(),
  check (closes_at > opens_at)
);

create sequence hyfin.deposit_index_seq minvalue 0 start 0;

create table hyfin.investments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references hyfin.projects (id),
  user_id uuid not null references hyfin.profiles (id),
  committed_amount numeric(18, 2) not null check (committed_amount > 0),
  received_amount numeric(18, 6) not null default 0,
  deposit_index bigint not null unique,           -- HD derivation index
  deposit_address text unique,                    -- derived from DEPOSIT_XPUB / deposit_index
  status hyfin.investment_status not null default 'awaiting_deposit',
  payout_amount numeric(18, 6),                   -- principal + return, set at settlement
  payout_tx text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

-- One live subscription per investor per project. Top-ups go to the same address.
create unique index investments_one_live_per_user
  on hyfin.investments (project_id, user_id)
  where status not in ('expired', 'refunded');
create index investments_user_idx on hyfin.investments (user_id);
create index investments_project_idx on hyfin.investments (project_id);

create table hyfin.deposits (
  id uuid primary key default gen_random_uuid(),
  investment_id uuid not null references hyfin.investments (id),
  chain_id integer not null,
  token text not null,
  tx_hash text not null,
  log_index integer not null,
  from_address text,
  amount numeric(30, 6) not null check (amount > 0),
  block_number bigint not null,
  created_at timestamptz not null default now(),
  unique (chain_id, tx_hash, log_index)
);
create index deposits_investment_idx on hyfin.deposits (investment_id);

create table hyfin.scan_cursors (
  chain_id integer not null,
  token text not null,
  last_block bigint not null,
  updated_at timestamptz not null default now(),
  primary key (chain_id, token)
);

create table hyfin.waitlist (
  email text primary key,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- New user -> profile
-- ---------------------------------------------------------------------------

create function hyfin.handle_new_user() returns trigger
language plpgsql security definer set search_path = hyfin as $$
begin
  -- The auth.users table is shared by every app in the project.
  if coalesce(new.raw_user_meta_data ->> 'app', '') <> 'hyfin' then
    return new;
  end if;
  insert into hyfin.profiles (id, email, full_name, country)
  values (
    new.id,
    new.email,
    nullif(new.raw_user_meta_data ->> 'full_name', ''),
    upper(nullif(new.raw_user_meta_data ->> 'country', ''))
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  -- Never block a sign-up (for any app in this project) because of HyFin.
  -- The app creates a missing profile on first visit.
  return new;
end $$;

create trigger hyfin_on_auth_user_created
  after insert on auth.users
  for each row execute function hyfin.handle_new_user();

-- ---------------------------------------------------------------------------
-- Business logic (service role only)
-- ---------------------------------------------------------------------------

-- Reserve a slot in a project. Address is derived by the app and written afterwards.
create function hyfin.reserve_investment(p_user uuid, p_project uuid, p_amount numeric)
returns hyfin.investments
language plpgsql security definer set search_path = hyfin as $$
declare
  v_profile hyfin.profiles;
  v_project hyfin.projects;
  v_taken numeric;
  v_inv hyfin.investments;
begin
  select * into v_profile from hyfin.profiles where id = p_user;
  if not found then raise exception 'PROFILE_NOT_FOUND'; end if;
  if v_profile.kyc <> 'approved' then raise exception 'NOT_VERIFIED'; end if;
  if v_profile.risk_ack_at is null then raise exception 'RISK_NOT_ACKNOWLEDGED'; end if;

  select * into v_project from hyfin.projects where id = p_project for update;
  if not found or v_project.status <> 'open'
     or now() < v_project.opens_at or now() > v_project.closes_at then
    raise exception 'PROJECT_NOT_OPEN';
  end if;
  if p_amount is null or p_amount < v_project.min_ticket then raise exception 'BELOW_MINIMUM'; end if;
  if v_project.max_ticket is not null and p_amount > v_project.max_ticket then
    raise exception 'ABOVE_MAXIMUM';
  end if;

  if exists (
    select 1 from hyfin.investments
    where project_id = p_project and user_id = p_user and status not in ('expired', 'refunded')
  ) then
    raise exception 'ALREADY_SUBSCRIBED';
  end if;

  select coalesce(sum(greatest(committed_amount, received_amount)), 0) into v_taken
  from hyfin.investments
  where project_id = p_project and status in ('awaiting_deposit', 'partially_funded', 'funded');
  if v_taken + p_amount > v_project.target_amount then raise exception 'EXCEEDS_REMAINING'; end if;

  insert into hyfin.investments (project_id, user_id, committed_amount, deposit_index)
  values (p_project, p_user, round(p_amount, 2), nextval('hyfin.deposit_index_seq'))
  returning * into v_inv;
  return v_inv;
end $$;

-- Record one confirmed on-chain transfer. Idempotent on (chain, tx, log index).
create function hyfin.record_deposit(
  p_investment uuid, p_chain integer, p_token text, p_tx text, p_log_index integer,
  p_from text, p_amount numeric, p_block bigint
) returns boolean
language plpgsql security definer set search_path = hyfin as $$
declare
  v_project_id uuid;
  v_project hyfin.projects;
begin
  insert into hyfin.deposits (investment_id, chain_id, token, tx_hash, log_index, from_address, amount, block_number)
  values (p_investment, p_chain, p_token, lower(p_tx), p_log_index, lower(p_from), p_amount, p_block)
  on conflict (chain_id, tx_hash, log_index) do nothing;
  if not found then return false; end if;

  update hyfin.investments
  set received_amount = received_amount + p_amount,
      status = case
        when status in ('awaiting_deposit', 'partially_funded', 'expired') then
          (case when received_amount + p_amount >= committed_amount
                then 'funded' else 'partially_funded' end)::hyfin.investment_status
        else status
      end
  where id = p_investment
  returning project_id into v_project_id;

  update hyfin.projects set raised_amount = raised_amount + p_amount
  where id = v_project_id
  returning * into v_project;

  if v_project.status = 'open' and v_project.raised_amount >= v_project.target_amount then
    perform hyfin.close_funding(v_project_id);
  end if;
  return true;
end $$;

-- Stop taking money and start the clock. Called automatically at 100% or by an admin.
create function hyfin.close_funding(p_project uuid) returns void
language plpgsql security definer set search_path = hyfin as $$
begin
  update hyfin.projects
  set status = 'funded',
      funded_at = now(),
      matures_at = now() + make_interval(days => term_days)
  where id = p_project and status = 'open';
  if not found then raise exception 'PROJECT_NOT_OPEN'; end if;

  update hyfin.investments set status = 'expired'
  where project_id = p_project and status = 'awaiting_deposit' and received_amount = 0;
end $$;

-- Compute what each investor is owed: money actually received plus the fixed return.
create function hyfin.settle_project(p_project uuid) returns integer
language plpgsql security definer set search_path = hyfin as $$
declare
  v_project hyfin.projects;
  v_count integer;
begin
  select * into v_project from hyfin.projects where id = p_project for update;
  if not found or v_project.status <> 'funded' then raise exception 'PROJECT_NOT_FUNDED'; end if;

  update hyfin.investments
  set payout_amount = round(received_amount * (1 + v_project.return_pct / 100), 6)
  where project_id = p_project and received_amount > 0
    and status in ('funded', 'partially_funded');
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Mark one investor as paid. When nobody is left unpaid the project becomes 'repaid'.
create function hyfin.mark_paid(p_investment uuid, p_tx text) returns void
language plpgsql security definer set search_path = hyfin as $$
declare
  v_project_id uuid;
begin
  update hyfin.investments
  set status = 'repaid', payout_tx = p_tx, paid_at = now()
  where id = p_investment and payout_amount is not null
    and status in ('funded', 'partially_funded')
  returning project_id into v_project_id;
  if not found then raise exception 'NOT_PAYABLE'; end if;

  if not exists (
    select 1 from hyfin.investments
    where project_id = v_project_id and status in ('funded', 'partially_funded')
  ) then
    update hyfin.projects set status = 'repaid' where id = v_project_id and status = 'funded';
  end if;
end $$;

create function hyfin.expire_stale_reservations(p_hours integer default 48) returns integer
language plpgsql security definer set search_path = hyfin as $$
declare
  v_count integer;
begin
  update hyfin.investments set status = 'expired'
  where status = 'awaiting_deposit' and received_amount = 0
    and created_at < now() - make_interval(hours => p_hours);
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ---------------------------------------------------------------------------
-- Access control
-- ---------------------------------------------------------------------------

alter table hyfin.profiles enable row level security;
alter table hyfin.projects enable row level security;
alter table hyfin.investments enable row level security;
alter table hyfin.deposits enable row level security;
alter table hyfin.scan_cursors enable row level security;
alter table hyfin.waitlist enable row level security;

revoke all on all tables in schema hyfin from anon, authenticated;
revoke all on all sequences in schema hyfin from anon, authenticated;
revoke execute on all functions in schema hyfin from public, anon, authenticated;

grant select on hyfin.projects to anon, authenticated;
grant select on hyfin.profiles, hyfin.investments, hyfin.deposits to authenticated;
-- Investors can edit only these columns. Role, KYC and accreditation are admin-only.
grant update (full_name, country, payout_address, notify_new_projects, risk_ack_at)
  on hyfin.profiles to authenticated;

grant all on all tables in schema hyfin to service_role;
grant all on all sequences in schema hyfin to service_role;
grant execute on all functions in schema hyfin to service_role;

create policy "published projects are public" on hyfin.projects
  for select to anon, authenticated using (status <> 'draft');

create policy "read own profile" on hyfin.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "update own profile" on hyfin.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "read own investments" on hyfin.investments
  for select to authenticated using (user_id = (select auth.uid()));

create policy "read own deposits" on hyfin.deposits
  for select to authenticated using (
    exists (
      select 1 from hyfin.investments i
      where i.id = deposits.investment_id and i.user_id = (select auth.uid())
    )
  );
