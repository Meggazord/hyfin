import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanDeposits } from "@/lib/scanner";

export const maxDuration = 60;

/**
 * Run every few minutes. Credits confirmed deposits and frees reservations
 * nobody paid for. Protected by CRON_SECRET (Vercel Cron sends it as a Bearer token).
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const db = createAdminClient();
    const hours = Number(process.env.RESERVATION_HOURS ?? 48);
    const { data: expired, error } = await db.rpc("expire_stale_reservations", { p_hours: hours });
    if (error) throw error;
    const report = await scanDeposits();
    return NextResponse.json({ ok: true, expired, report });
  } catch (e) {
    console.error("scan failed", e);
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
