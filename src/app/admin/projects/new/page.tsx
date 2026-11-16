import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createProject } from "@/app/actions/admin";
import { Flash, Loading, PageShell } from "@/components/ui";
import { DealForm } from "@/components/deal-form";

async function Guard({ searchParams }: PageProps<"/admin/projects/new">) {
  await requireAdmin();
  return (
    <>
      <Flash searchParams={searchParams} />
      <DealForm action={createProject} submitLabel="Save as draft" />
    </>
  );
}

export default function NewProject(props: PageProps<"/admin/projects/new">) {
  return (
    <PageShell title="Create a deal">
      <Suspense fallback={<Loading />}>
        <Guard {...props} />
      </Suspense>
    </PageShell>
  );
}
