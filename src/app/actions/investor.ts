"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkEligibility } from "@/lib/eligibility";
import { depositMode, deriveDepositAddress, normaliseAddress, safeAddress } from "@/lib/wallet";
import { pickExpectedAmount } from "@/lib/match";
import type { Investment } from "@/lib/types";

const withError = (path: string, message: string): never =>
  redirect(`${path}?error=${encodeURIComponent(message)}`);

const RESERVE_ERRORS: Record<string, string> = {
  NOT_VERIFIED: "Your account is not verified yet.",
  RISK_NOT_ACKNOWLEDGED: "Accept the risk disclosure before investing.",
  PROJECT_NOT_OPEN: "This deal is not open for funding.",
  BELOW_MINIMUM: "That amount is below the minimum for this deal.",
  ABOVE_MAXIMUM: "That amount is above the maximum for this deal.",
  ALREADY_SUBSCRIBED: "You already have a subscription in this deal. Send more to the same address to top up.",
  EXCEEDS_REMAINING: "That is more than what is left to raise. Enter a smaller amount.",
};

export async function subscribe(formData: FormData) {
  const slug = String(formData.get("slug") ?? "");
  const projectId = String(formData.get("project_id") ?? "");
  const amount = Number(formData.get("amount"));
  const path = `/projects/${slug}`;

  const profile = await requireProfile();
  const eligible = checkEligibility(profile);
  if (!eligible.ok) return withError(path, eligible.reason);
  if (formData.get("confirm_risk") !== "on") return withError(path, "Confirm that you understand you can lose this money.");
  if (!Number.isFinite(amount) || amount <= 0) return withError(path, "Enter the amount you want to invest.");
  const mode = depositMode();
  if (mode === "off") return withError(path, "Deposits are not open yet. Nothing was reserved.");
  // Safe deposits are matched to investors partly by the sending wallet, and we repay to it.
  if (mode === "safe" && !profile.payout_address) {
    return withError("/dashboard/profile", "Add the wallet you'll pay from (and want to be repaid to) before investing.");
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc("reserve_investment", {
    p_user: profile.id,
    p_project: projectId,
    p_amount: amount,
  });
  if (error) {
    const code = Object.keys(RESERVE_ERRORS).find((k) => error.message.includes(k));
    return withError(path, code ? RESERVE_ERRORS[code] : "Could not reserve your place. Try again.");
  }
  const inv = data as Investment;

  const expire = () => db.from("investments").update({ status: "expired" }).eq("id", inv.id);

  if (mode === "safe") {
    // Give this subscription an amount nobody else is currently asked to send, e.g. 1,500.37.
    let saved = false;
    for (let attempt = 0; attempt < 5 && !saved; attempt++) {
      const { data: live } = await db
        .from("investments")
        .select("expected_amount")
        .in("status", ["awaiting_deposit", "partially_funded"])
        .not("expected_amount", "is", null);
      const taken = new Set((live ?? []).map((r) => Math.round(Number(r.expected_amount) * 100)));
      const expected = pickExpectedAmount(Number(inv.committed_amount), taken);
      if (expected == null) break;
      const { error: e } = await db
        .from("investments")
        .update({ expected_amount: expected, deposit_address: safeAddress() })
        .eq("id", inv.id);
      saved = !e;
    }
    if (!saved) {
      await expire();
      return withError(path, "Could not prepare your deposit. Nothing was charged. Try a slightly different amount.");
    }
    redirect(`/dashboard/investments/${inv.id}`);
  }

  let address: string;
  try {
    address = deriveDepositAddress(Number(inv.deposit_index));
  } catch {
    // Never leave a reservation without an address the investor could pay into.
    await expire();
    return withError(path, "Deposits are not available right now. Nothing was charged. Try again later.");
  }
  const { error: updErr } = await db.from("investments").update({ deposit_address: address }).eq("id", inv.id);
  if (updErr) {
    await expire();
    return withError(path, "Could not create your deposit address. Try again.");
  }
  redirect(`/dashboard/investments/${inv.id}`);
}

const ProfileForm = z.object({
  full_name: z.string().trim().min(2, "Enter your full name."),
  country: z.string().trim().length(2, "Choose your country of residence."),
  payout_address: z.string().trim(),
});

export async function updateProfile(formData: FormData) {
  const profile = await requireProfile();
  const parsed = ProfileForm.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return withError("/dashboard/profile", parsed.error.issues[0].message);

  let payout: string | null = null;
  if (parsed.data.payout_address) {
    payout = normaliseAddress(parsed.data.payout_address);
    if (!payout) return withError("/dashboard/profile", "That is not a valid EVM wallet address (0x…).");
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: parsed.data.full_name,
      country: parsed.data.country.toUpperCase(),
      payout_address: payout,
      notify_new_projects: formData.get("notify_new_projects") === "on",
    })
    .eq("id", profile.id);
  if (error) return withError("/dashboard/profile", "Could not save your profile.");
  redirect("/dashboard/profile?notice=" + encodeURIComponent("Profile saved."));
}

export async function acknowledgeRisk(formData: FormData) {
  const profile = await requireProfile();
  const boxes = ["ack_loss", "ack_no_insurance", "ack_illiquid", "ack_crypto"];
  if (!boxes.every((b) => formData.get(b) === "on")) return withError("/risk", "Tick every box to continue.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ risk_ack_at: new Date().toISOString() })
    .eq("id", profile.id);
  if (error) return withError("/risk", "Could not save. Try again.");
  redirect("/dashboard?notice=" + encodeURIComponent("Risk disclosure accepted."));
}

export async function joinWaitlist(formData: FormData) {
  const email = z.string().trim().email().safeParse(formData.get("email"));
  if (!email.success) return withError("/", "Enter a valid email address.");
  const db = createAdminClient();
  await db.from("waitlist").upsert({ email: email.data.toLowerCase() }, { onConflict: "email", ignoreDuplicates: true });
  redirect("/?notice=" + encodeURIComponent("You are on the list. We will email you when a deal opens.") + "#updates");
}
