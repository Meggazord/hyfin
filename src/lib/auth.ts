import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isConfigured } from "@/lib/env";
import type { Profile } from "@/lib/types";

export async function getProfile(): Promise<Profile | null> {
  // Read the request first so pages that depend on the session are never prerendered.
  await cookies();
  if (!isConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (data) return data as Profile;
  // The Supabase project is shared with other apps, so someone can already have
  // a login there without a HyFin profile. Create it on their first visit.
  if (!process.env.SUPABASE_SECRET_KEY || !user.email) return null;
  const { data: created } = await createAdminClient()
    .from("profiles")
    .upsert({ id: user.id, email: user.email }, { onConflict: "id", ignoreDuplicates: true })
    .select("*")
    .maybeSingle();
  if (created) return created as Profile;
  const { data: again } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
  return (again as Profile | null) ?? null;
}

export async function requireProfile(): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (profile.role !== "admin") redirect("/dashboard");
  return profile;
}
