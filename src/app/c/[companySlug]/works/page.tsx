import { requireActiveCompany } from "@/lib/active-company";
import { listWorks } from "@/features/works/works.repo";
import { createWorkAction } from "@/features/works/works.actions";

export default async function WorksPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params; // ✅ unwrap params

  const ctx = await requireActiveCompany(companySlug);
  const works = await listWorks(ctx.companyId);

  const canWrite = ctx.role === "admin";

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Works</h1>
        <div>Role: {ctx.role}</div>
      </header>

      {canWrite && (
        <form action={createWorkAction.bind(null, companySlug)} style={{ display: "flex", gap: 8 }}>
          <input name="title" placeholder="New work title" />
          <button type="submit">Create</button>
        </form>
      )}

      <ul style={{ display: "grid", gap: 8 }}>
        {works.map((w) => (
          <li key={w.id}>
            <a href={`/c/${companySlug}/works/${w.id}`}>{w.title}</a>
          </li>
        ))}
      </ul>

      {works.length === 0 && <div>No works yet.</div>}
    </div>
  );
}