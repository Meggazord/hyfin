/**
 * Runs the migration against an in-memory Postgres (PGlite) with Supabase stubs
 * and exercises the full deal lifecycle. `npm run test:schema`
 */
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";

const db = new PGlite();

async function expectError(sql: string, code: string) {
  try {
    await db.exec(sql);
  } catch (e) {
    assert.match(String((e as Error).message), new RegExp(code), `expected ${code}`);
    return;
  }
  assert.fail(`expected ${code} but statement succeeded`);
}

async function one<T = Record<string, unknown>>(sql: string): Promise<T> {
  const r = await db.query<T>(sql);
  return r.rows[0];
}

async function main() {
  // Supabase stubs
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated, service_role;
  `);
  // Another app's table in public: the migration must leave its privileges alone.
  await db.exec(`create table public.other_app (id int); grant select on public.other_app to anon;`);
  await db.exec(readFileSync(join(__dirname, "../supabase/migrations/0001_init.sql"), "utf8"));
  await db.exec(`set search_path = hyfin, public`);

  const alice = "00000000-0000-0000-0000-00000000000a";
  const bob = "00000000-0000-0000-0000-00000000000b";
  await db.exec(`
    insert into auth.users (id, email, raw_user_meta_data) values
      ('${alice}', 'alice@example.com', '{"app":"hyfin","full_name":"Alice","country":"ae"}'),
      ('${bob}', 'bob@example.com', '{"app":"hyfin"}'),
      ('00000000-0000-0000-0000-00000000000c', 'other-app-user@example.com', '{}');
  `);
  const p = await one<{ country: string; role: string; kyc: string }>(
    `select country, role, kyc from profiles where id='${alice}'`,
  );
  assert.deepEqual(p, { country: "AE", role: "investor", kyc: "none" });
  assert.equal((await db.query(`select * from profiles`)).rows.length, 2, "users of other apps get no HyFin profile");

  await db.exec(`
    insert into projects (id, slug, title, summary, borrower, target_amount, min_ticket, return_pct, term_days, opens_at, closes_at, status)
    values ('11111111-1111-1111-1111-111111111111', 'po-1', 'PO 1', 's', 'Tasty Foods', 35000, 100, 7.5, 45,
            now() - interval '1 day', now() + interval '10 days', 'open');
  `);
  const pid = "11111111-1111-1111-1111-111111111111";

  // Gates
  await expectError(`select reserve_investment('${alice}', '${pid}', 1000)`, "NOT_VERIFIED");
  await db.exec(`update profiles set kyc='approved' where id in ('${alice}','${bob}')`);
  await expectError(`select reserve_investment('${alice}', '${pid}', 1000)`, "RISK_NOT_ACKNOWLEDGED");
  await db.exec(`update profiles set risk_ack_at=now()`);
  await expectError(`select reserve_investment('${alice}', '${pid}', 50)`, "BELOW_MINIMUM");
  await expectError(`select reserve_investment('${alice}', '${pid}', 40000)`, "EXCEEDS_REMAINING");

  const a = await one<{ id: string; deposit_index: string }>(
    `select id, deposit_index from reserve_investment('${alice}', '${pid}', 20000)`,
  );
  assert.equal(Number(a.deposit_index), 0);
  await expectError(`select reserve_investment('${alice}', '${pid}', 100)`, "ALREADY_SUBSCRIBED");
  await expectError(`select reserve_investment('${bob}', '${pid}', 15000.01)`, "EXCEEDS_REMAINING");
  const b = await one<{ id: string; deposit_index: string }>(
    `select id, deposit_index from reserve_investment('${bob}', '${pid}', 15000)`,
  );
  assert.equal(Number(b.deposit_index), 1);

  // Deposits: partial, duplicate, completion
  const dep = (inv: string, tx: string, amt: number) =>
    one<{ ok: boolean }>(
      `select record_deposit('${inv}', 8453, 'USDC', '${tx}', 0, '0xABC', ${amt}, 100) as ok`,
    );
  assert.equal((await dep(a.id, "0xT1", 5000)).ok, true);
  assert.equal((await dep(a.id, "0xT1", 5000)).ok, false, "duplicate log must be ignored");
  let inv = await one<{ status: string; received_amount: string }>(
    `select status, received_amount from investments where id='${a.id}'`,
  );
  assert.equal(inv.status, "partially_funded");
  assert.equal(Number(inv.received_amount), 5000);

  await dep(a.id, "0xT2", 15000);
  await dep(b.id, "0xT3", 15000);
  const proj = await one<{ status: string; raised_amount: string; days: number }>(
    `select status, raised_amount, extract(day from matures_at - funded_at)::int as days from projects where id='${pid}'`,
  );
  assert.equal(proj.status, "funded", "project closes itself at 100%");
  assert.equal(Number(proj.raised_amount), 35000);
  assert.equal(proj.days, 45);
  await expectError(`select reserve_investment('${bob}', '${pid}', 100)`, "PROJECT_NOT_OPEN");

  // Settlement: 7.5% on 20,000 = 21,500
  const n = await one<{ n: number }>(`select settle_project('${pid}') as n`);
  assert.equal(n.n, 2);
  inv = await one(`select payout_amount::float8 as payout_amount from investments where id='${a.id}'`);
  assert.equal((inv as unknown as { payout_amount: number }).payout_amount, 21500);
  const total = await one<{ t: number }>(
    `select sum(payout_amount)::float8 as t from investments where project_id='${pid}'`,
  );
  assert.equal(total.t, 37625, "35,000 principal + 2,625 return");

  await db.exec(`select mark_paid('${a.id}', '0xP1')`);
  assert.equal((await one<{ status: string }>(`select status from projects where id='${pid}'`)).status, "funded");
  await db.exec(`select mark_paid('${b.id}', '0xP2')`);
  assert.equal((await one<{ status: string }>(`select status from projects where id='${pid}'`)).status, "repaid");
  await expectError(`select mark_paid('${b.id}', '0xP2')`, "NOT_PAYABLE");

  // Stale reservations
  await db.exec(`
    insert into projects (id, slug, title, summary, borrower, target_amount, return_pct, term_days, opens_at, closes_at, status)
    values ('22222222-2222-2222-2222-222222222222', 'po-2', 'PO 2', 's', 'X', 1000, 5, 30, now() - interval '5 day', now() + interval '5 day', 'open');
  `);
  const c = await one<{ id: string }>(
    `select id from reserve_investment('${alice}', '22222222-2222-2222-2222-222222222222', 500)`,
  );
  await db.exec(`update investments set created_at = now() - interval '3 days' where id='${c.id}'`);
  assert.equal((await one<{ n: number }>(`select expire_stale_reservations(48) as n`)).n, 1);
  // Expired slot frees up; investor can subscribe again
  await db.exec(`select reserve_investment('${alice}', '22222222-2222-2222-2222-222222222222', 500)`);

  // RLS: investor sees only own rows, cannot self-approve, cannot call functions
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${bob}', false);`);
  assert.equal((await db.query(`select * from investments`)).rows.length, 1);
  assert.equal((await db.query(`select * from profiles`)).rows.length, 1);
  assert.equal((await db.query(`select * from deposits`)).rows.length, 1);
  await expectError(`update profiles set kyc='approved', role='admin' where id='${bob}'`, "permission denied");
  await expectError(`select record_deposit('${b.id}', 1, 'USDC', '0xFAKE', 0, '0x', 999999, 1)`, "permission denied");
  await expectError(`insert into investments (project_id, user_id, committed_amount, deposit_index) values ('${pid}', '${bob}', 1, 99)`, "permission denied");
  await db.exec(`update profiles set payout_address='0x0000000000000000000000000000000000000001' where id='${bob}'`);
  await db.exec(`reset role; set role anon;`);
  assert.equal((await db.query(`select * from projects`)).rows.length, 2);
  await expectError(`select * from profiles`, "permission denied");
  await db.exec(`reset role; update projects set status='draft' where slug='po-2'; set role anon;`);
  assert.equal((await db.query(`select * from projects`)).rows.length, 1, "drafts are hidden");
  assert.equal((await db.query(`select * from public.other_app`)).rows.length, 0, "other app's grants untouched");

  console.log("schema tests passed");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
