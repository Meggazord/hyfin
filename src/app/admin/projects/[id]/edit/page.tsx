import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateProject } from "@/app/actions/admin";
import { DealForm } from "@/components/deal-form";
import { Flash, Loading, PageShell } from "@/components/ui";
import type { Project } from "@/lib/types";

async function Content({ params, searchParams }: PageProps<"/admin/projects/[id]/edit">) {
  await requireAdmin();
  const { id } = await params;
  const db = createAdminClient();
  const { data } = await db.from("projects").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const p = data as Project;
  const { count } = await db
    .from("investments")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id)
    .not("status", "in", "(expired,refunded)");
  const lockDates = !["draft", "open"].includes(p.status);
  const lockTerms = (count ?? 0) > 0 || lockDates;

  return (
    <>
      <Link href={`/admin/projects/${p.id}`} className="text-sm underline">
        Back to the deal
      </Link>
      <div className="mt-4">
        <Flash searchParams={searchParams} />
      </div>
      <DealForm action={updateProject} submitLabel="Save changes" project={p} lockTerms={lockTerms} lockDates={lockDates} />
    </>
  );
}

export default function EditProject(props: PageProps<"/admin/projects/[id]/edit">) {
  return (
    <PageShell title="Edit deal">
      <Suspense fallback={<Loading />}>
        <Content {...props} />
      </Suspense>
    </PageShell>
  );
}
