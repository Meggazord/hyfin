"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/env";

const back = (path: string, message: string): never =>
  redirect(`${path}?error=${encodeURIComponent(message)}`);

const SignUp = z.object({
  full_name: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(10, "Use a password of at least 10 characters."),
  country: z.string().trim().length(2, "Choose your country of residence."),
});

export async function signUp(formData: FormData) {
  const parsed = SignUp.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return back("/signup", parsed.error.issues[0].message);
  const { email, password, full_name, country } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { app: "hyfin", full_name, country: country.toUpperCase() }, emailRedirectTo: `${siteUrl()}/auth/callback` },
  });
  if (error) return back("/signup", error.message);
  // With email confirmation on, there is no session yet.
  if (!data.session) redirect("/login?notice=" + encodeURIComponent("Check your email to confirm your account."));
  redirect("/dashboard");
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return back("/login", "Email or password is incorrect.");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
