import Link from "next/link";
import { Suspense } from "react";
import { signIn } from "@/app/actions/auth";
import { Flash, PageShell } from "@/components/ui";

export default function Login({ searchParams }: PageProps<"/login">) {
  return (
    <PageShell title="Sign in">
      <Suspense fallback={null}>
        <Flash searchParams={searchParams} />
      </Suspense>
      <form action={signIn} className="panel max-w-md space-y-4 p-6">
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input className="field" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div>
          <label className="label" htmlFor="password">
            Password
          </label>
          <input className="field" id="password" name="password" type="password" autoComplete="current-password" required />
        </div>
        <button className="btn w-full">Sign in</button>
        <p className="text-sm text-muted">
          New to HyFin?{" "}
          <Link href="/signup" className="underline">
            Create account
          </Link>
        </p>
      </form>
    </PageShell>
  );
}
