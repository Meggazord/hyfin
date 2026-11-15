import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env, DB_SCHEMA } from "@/lib/env";

/**
 * Service-role client. Bypasses row level security.
 * Only call after the caller has been authorised (requireAdmin) or from the cron route.
 */
export function createAdminClient() {
  return createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
    db: { schema: DB_SCHEMA },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
