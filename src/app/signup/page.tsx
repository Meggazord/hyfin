import Link from "next/link";
import { Suspense } from "react";
import { signUp } from "@/app/actions/auth";
import { Flash, PageShell } from "@/components/ui";
import { COUNTRIES } from "@/lib/countries";

export default function SignUp({ searchParams }: PageProps<"/signup">) {
  return (
    <PageShell title="Create account">
      <Suspense fallback={null}>
        <Flash searchParams={searchParams} />
      </Suspense>
      <form action={signUp} className="panel max-w-md space-y-4 p-6">
        <div>
          <label className="label" htmlFor="full_name">
            Full legal name
          </label>
          <input className="field" id="full_name" name="full_name" autoComplete="name" required />
        </div>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input className="field" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="country">
            Country of residence
          </label>
          <select className="field" id="country" name="country" required defaultValue="">
            <option value="" disabled>
              Choose a country
            </option>
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          <p className="hint">Deals are not available in every country. We verify this before you can invest.</p>
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input className="field" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          <p className="hint">At least 10 characters.</p>
        </div>
        <button className="btn w-full">Create account</button>
        <p className="text-sm text-muted">
          Already have an account?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </form>
    </PageShell>
  );
}
