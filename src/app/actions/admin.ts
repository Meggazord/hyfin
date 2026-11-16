"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { announceProject } from "@/lib/notify";
import { slugify } from "@/lib/format";
import type { Project } from "@/lib/types";

const go = (path: string, kind: "error" | "notice", message: string): never =>
  redirect(`${path}?${kind}=${encodeURIComponent(message)}`);

const optionalNumber = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().positive().nullable());
const optionalText = z.preprocess((v) => (typeof v === "string" && v.trim() ? v.trim() : null), z.string().nullable());

const ProjectForm = z
  .object({
    title: z.string().trim().min(3, "Give the deal a title."),
    summary: z.string().trim().min(10, "Write a one or two sentence summary."),
    description: optionalText,
    borrower: z.string().trim().min(2, "Name the borrower."),
    use_of_funds: optionalText,
    collateral: optionalText,
    target_amount: z.coerce.number().positive("Target must be above zero."),
    min_ticket: z.coerce.number().positive("Minimum must be above zero."),
    max_ticket: optionalNumber,
    return_pct: z.coerce.number().min(0).max(100, "Return looks wrong."),
    term_days: z.coerce.number().int().positive("Term must be at least one day."),
    opens_at: z.string().min(1, "Set an opening date."),
    closes_at: z.string().min(1, "Set a closing date."),
  })
  .refine((v) => new Date(v.closes_at) > new Date(v.opens_at), "Closing date must be after the opening date.")
  .refine((v) => v.min_ticket <= v.target_amount, "Minimum cannot be above the target.");

export async function createProject(formData: FormData) {
  const admin = await requireAdmin();
  const parsed = ProjectForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return go("/admin/projects/new", "error", parsed.error.issues[0].message);
  const v = parsed.data;

  const db = createAdminClient();
  const { data, error } = await db
    .from("projects")
    .insert({
      ...v,
      opens_at: new Date(v.opens_at).toISOString(),
      closes_at: new Date(v.closes_at).toISOString(),
      related_party: formData.get("related_party") === "on",
      slug: `${slugify(v.title)}-${Math.random().toString(36).slice(2, 6)}`,
      created_by: admin.id,
      status: "draft",
    })
    .select("id")
    .single();
  if (error) return go("/admin/projects/new", "error", error.message);
  redirect(`/admin/projects/${data.id}`);
}

export async function updateProject(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const editPath = `/admin/projects/${id}/edit`;
  const db = createAdminClient();
  const { data: existing } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  if (!existing) return go("/admin", "error", "Deal not found.");
  const p = existing as Project;
  const { count } = await db
    .from("investments")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id)
    .not("status", "in", "(expired,refunded)");
  const lockTerms = (count ?? 0) > 0 || !["draft", "open"].includes(p.status);
  const lockDates = !["draft", "open"].includes(p.status);

  // Locked fields are disabled in the form, so take them from the saved deal.
  const raw: Record<string, unknown> = Object.fromEntries(formData);
  if (lockTerms) {
    Object.assign(raw, {
      target_amount: p.target_amount,
      min_ticket: p.min_ticket,
      max_ticket: p.max_ticket ?? "",
      return_pct: p.return_pct,
      term_days: p.term_days,
      opens_at: p.opens_at,
    });
  }
  if (lockDates) Object.assign(raw, { opens_at: p.opens_at, closes_at: p.closes_at });

  const parsed = ProjectForm.safeParse(raw);
  if (!parsed.success) return go(editPath, "error", parsed.error.issues[0].message);
  const v = parsed.data;
  if (lockTerms && !lockDates && new Date(v.closes_at) < new Date(p.closes_at)) {
    return go(editPath, "error", "Investors have subscribed, so the closing date can only be extended, not brought forward.");
  }

  const { error } = await db
    .from("projects")
    .update({
      ...v,
      opens_at: new Date(v.opens_at).toISOString(),
      closes_at: new Date(v.closes_at).toISOString(),
      related_party: lockTerms ? p.related_party : formData.get("related_party") === "on",
    })
    .eq("id", id);
  if (error) return go(editPath, "error", error.message);
  go(`/admin/projects/${id}`, "notice", "Deal updated.");
}

export async function publishProject(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const db = createAdminClient();
  const { data, error } = await db
    .from("projects")
    .update({ status: "open" })
    .eq("id", id)
    .eq("status", "draft")
    .select("*")
    .single();
  if (error || !data) return go(`/admin/projects/${id}`, "error", "Only a draft can be published.");
  const r = await announceProject(data as Project);
  const sent = [`${r.emails} emails`, r.telegram && "Telegram", r.discord && "Discord"].filter(Boolean).join(", ");
  go(
    `/admin/projects/${id}`,
    r.errors.length ? "error" : "notice",
    r.errors.length ? `Published, but some alerts failed: ${r.errors.join("; ")}` : `Published. Alerts sent: ${sent}.`,
  );
}

export async function closeFunding(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const { error } = await createAdminClient().rpc("close_funding", { p_project: id });
  if (error) return go(`/admin/projects/${id}`, "error", "Only an open deal can be closed.");
  go(`/admin/projects/${id}`, "notice", "Funding closed. The term has started.");
}

export async function cancelProject(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const db = createAdminClient();
  const { data, error } = await db
    .from("projects")
    .update({ status: "cancelled" })
    .eq("id", id)
    .in("status", ["draft", "open"])
    .select("id");
  if (error || !data?.length) return go(`/admin/projects/${id}`, "error", "Only a draft or open deal can be cancelled.");
  await db.from("investments").update({ status: "expired" }).eq("project_id", id).eq("received_amount", 0);
  go(`/admin/projects/${id}`, "notice", "Deal cancelled. Refund every deposit listed below, then mark it refunded.");
}

export async function settleProject(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const { data, error } = await createAdminClient().rpc("settle_project", { p_project: id });
  if (error) return go(`/admin/projects/${id}`, "error", "Only a funded deal can be settled.");
  go(`/admin/projects/${id}`, "notice", `Payouts calculated for ${data} investors. Pay each one, then record the transaction.`);
}

export async function markPaid(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("project_id"));
  const tx = String(formData.get("tx") ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return go(`/admin/projects/${id}`, "error", "Paste the payout transaction hash (0x…, 66 characters).");
  const { error } = await createAdminClient().rpc("mark_paid", {
    p_investment: String(formData.get("investment_id")),
    p_tx: tx.toLowerCase(),
  });
  if (error) return go(`/admin/projects/${id}`, "error", "Calculate payouts first, and only pay funded investments.");
  go(`/admin/projects/${id}`, "notice", "Payout recorded.");
}

export async function markRefunded(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("project_id"));
  const tx = String(formData.get("tx") ?? "").trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(tx)) return go(`/admin/projects/${id}`, "error", "Paste the refund transaction hash (0x…, 66 characters).");
  const db = createAdminClient();
  const { data: project } = await db.from("projects").select("status").eq("id", id).single();
  if (project?.status !== "cancelled") return go(`/admin/projects/${id}`, "error", "Refunds apply to cancelled deals only.");
  await db
    .from("investments")
    .update({ status: "refunded", payout_tx: tx.toLowerCase(), paid_at: new Date().toISOString() })
    .eq("id", String(formData.get("investment_id")))
    .gt("received_amount", 0);
  go(`/admin/projects/${id}`, "notice", "Refund recorded.");
}

export async function markDefaulted(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const db = createAdminClient();
  const { data, error } = await db
    .from("projects")
    .update({ status: "defaulted" })
    .eq("id", id)
    .eq("status", "funded")
    .select("id");
  if (error || !data?.length) return go(`/admin/projects/${id}`, "error", "Only a funded deal can be marked as defaulted.");
  await db
    .from("investments")
    .update({ status: "defaulted" })
    .eq("project_id", id)
    .in("status", ["funded", "partially_funded"]);
  go(`/admin/projects/${id}`, "notice", "Deal marked as defaulted. Investors now see this status.");
}

export async function reviewInvestor(formData: FormData) {
  await requireAdmin();
  const kyc = z.enum(["pending", "approved", "rejected"]).safeParse(formData.get("kyc"));
  if (!kyc.success) return go("/admin/investors", "error", "Unknown status.");
  const { error } = await createAdminClient()
    .from("profiles")
    .update({ kyc: kyc.data, accredited: formData.get("accredited") === "on" })
    .eq("id", String(formData.get("user_id")));
  if (error) return go("/admin/investors", "error", error.message);
  go("/admin/investors", "notice", "Investor updated.");
}

/** Credits a Safe deposit the scanner couldn't match to the subscription an admin picks. */
export async function assignDeposit(formData: FormData) {
  await requireAdmin();
  const depositId = String(formData.get("deposit_id") ?? "");
  const investmentId = String(formData.get("investment_id") ?? "");
  if (!investmentId) return go("/admin", "error", "Pick the subscription this payment belongs to.");
  const db = createAdminClient();
  const { data: d } = await db
    .from("unmatched_deposits")
    .select("*")
    .eq("id", depositId)
    .is("assigned_investment", null)
    .maybeSingle();
  if (!d) return go("/admin", "error", "That payment is already assigned or no longer exists.");
  const { error } = await db.rpc("record_deposit", {
    p_investment: investmentId,
    p_chain: d.chain_id,
    p_token: d.token,
    p_tx: d.tx_hash,
    p_log_index: d.log_index,
    p_from: d.from_address,
    p_amount: d.amount,
    p_block: d.block_number,
  });
  if (error) return go("/admin", "error", "Could not credit that payment. Check the subscription is still live.");
  await db
    .from("unmatched_deposits")
    .update({ assigned_investment: investmentId, assigned_at: new Date().toISOString() })
    .eq("id", depositId);
  go("/admin", "notice", "Payment credited.");
}
