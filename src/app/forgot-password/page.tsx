import Link from "next/link";
import { Suspense } from "react";
import { requestPasswordReset } from "@/app/actions/auth";
import { Flash, PageShell } from "@/components/ui";

export default function ForgotPassword({ searchParams }: PageProps<"/forgot-password">) {
  return (
    <PageShell title="Reset your password">
      <Suspense fallback={null}>
        <Flash searchParams={searchParams} />
      </Suspense>
      <form action={requestPasswordReset} className="panel max-w-md space-y-4 p-6">
        <p className="text-sm text-muted">Enter your account email and we&apos;ll send you a link to set a new password.</p>
        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input className="field" id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <button className="btn w-full">Send reset link</button>
        <p className="text-sm text-muted">
          Remembered it?{" "}
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </form>
    </PageShell>
  );
}
