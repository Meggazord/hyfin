import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

/** Lands here from confirmation and password-reset emails. Handles both PKCE (?code=) and token-hash links. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  // Only same-site paths, never a full URL, so the link can't send people elsewhere.
  const nextParam = searchParams.get("next") ?? "";
  const next = /^\/[a-zA-Z0-9/_-]*$/.test(nextParam) ? nextParam : type === "recovery" ? "/reset-password" : "/dashboard";
  const supabase = await createClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  }
  return NextResponse.redirect(
    ok ? `${origin}${next}` : `${origin}/login?error=${encodeURIComponent("That link is invalid or has expired.")}`,
  );
}
