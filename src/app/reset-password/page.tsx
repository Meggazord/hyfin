import { Suspense } from "react";
import { updatePassword } from "@/app/actions/auth";
import { Flash, PageShell } from "@/components/ui";

export default function ResetPassword({ searchParams }: PageProps<"/reset-password">) {
  return (
    <PageShell title="Set a new password">
      <Suspense fallback={null}>
        <Flash searchParams={searchParams} />
      </Suspense>
      <form action={updatePassword} className="panel max-w-md space-y-4 p-6">
        <div>
          <label className="label" htmlFor="password">
            New password
          </label>
          <input className="field" id="password" name="password" type="password" autoComplete="new-password" minLength={10} required />
          <p className="hint">At least 10 characters.</p>
        </div>
        <div>
          <label className="label" htmlFor="confirm">
            Repeat new password
          </label>
          <input className="field" id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={10} required />
        </div>
        <button className="btn w-full">Save new password</button>
      </form>
    </PageShell>
  );
}
