import Link from "next/link";
import { requireActiveCompany } from "@/lib/active-company";
import { createClient } from "@/features/supabase/server";
import { deleteWorkAction, updateWorkTitleAction } from "@/features/works/works.actions";

export default async function WorkDetailPage({
  params,
}: {
  params: { companySlug: string; workId: string };
}) {
  const { companySlug, workId } = await params;

  const ctx = await requireActiveCompany(companySlug);
  const supabase = await createClient();

  const { data: work, error } = await supabase
    .from("works")
    .select("id, title, created_at")
    .eq("company_id", ctx.companyId)
    .eq("id", workId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!work) return <div style={{ padding: 24 }}>Not found</div>;

  const canWrite = ctx.role === "admin";

  return (
    <div style={{ padding: 24, display: "grid", gap: 12 }}>
      <Link href={`/c/${companySlug}/works`}>← Back</Link>

      <h1>{work.title}</h1>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        <div>ID: {work.id}</div>
        <div>Created: {new Date(work.created_at).toLocaleString()}</div>
      </div>

      <div>Role: {ctx.role}</div>

      {canWrite && (
        <div style={{ display: "grid", gap: 12, marginTop: 12 }}>
          <form action={updateWorkTitleAction.bind(null, companySlug, workId)} style={{ display: "flex", gap: 8 }}>
            <input name="title" defaultValue={work.title} />
            <button type="submit">Save</button>
          </form>

          <form action={deleteWorkAction.bind(null, companySlug, workId)}>
            <button type="submit">Delete</button>
          </form>
        </div>
      )}
    </div>
  );
}