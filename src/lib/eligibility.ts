import type { Profile } from "@/lib/types";

/**
 * Who may invest. These defaults are conservative placeholders, not legal advice:
 * have counsel set the list for the exemption you rely on.
 *  - BLOCKED_COUNTRIES: comma separated ISO codes that can never invest.
 *  - ACCREDITED_ONLY_COUNTRIES: residents need `accredited = true` (set by an admin
 *    after verification) before they can invest.
 */
const list = (v: string | undefined, fallback: string) =>
  (v ?? fallback)
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);

export const blockedCountries = () => list(process.env.BLOCKED_COUNTRIES, "EG,KP,IR,SY,CU");
export const accreditedOnlyCountries = () => list(process.env.ACCREDITED_ONLY_COUNTRIES, "US");

export type Eligibility = { ok: true } | { ok: false; reason: string; action?: "profile" | "risk" };

export function checkEligibility(p: Profile): Eligibility {
  if (!p.country) return { ok: false, reason: "Add your country of residence to your profile.", action: "profile" };
  // Admins may run the investor flow end to end to test it, whatever their country.
  const isAdmin = p.role === "admin";
  if (!isAdmin && blockedCountries().includes(p.country))
    return { ok: false, reason: "HyFin deals are not available to residents of your country." };
  if (p.kyc !== "approved")
    return {
      ok: false,
      reason:
        p.kyc === "rejected"
          ? "Your verification was not approved."
          : "Your account is waiting for identity verification. We will email you when it is approved.",
    };
  if (!isAdmin && accreditedOnlyCountries().includes(p.country) && !p.accredited)
    return { ok: false, reason: "Residents of your country must be verified as accredited investors first." };
  if (!p.payout_address)
    return { ok: false, reason: "Add the wallet address you want to be repaid to.", action: "profile" };
  if (!p.risk_ack_at)
    return { ok: false, reason: "Read and accept the risk disclosure before investing.", action: "risk" };
  return { ok: true };
}
