import Link from "next/link";
import { requireActiveCompany } from "@/lib/active-company";
import { listImportJobs } from "@/features/imports/imports.repo";
import UploadImportsClient from "./UploadImportsClient";

export default async function ImportsPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params; // companySlug = companyId (UUID)
  const ctx = await requireActiveCompany(companySlug);

  const jobs = await listImportJobs(ctx.companyId);
  const canWrite = ctx.role === "admin";

  return (
    <div style={{ padding: 24, display: "grid", gap: 16 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <h1>Imports</h1>
        <div>Role: {ctx.role}</div>
      </header>

      {canWrite ? <UploadImportsClient companyId={companySlug} /> : <div>Read-only</div>}

      <div style={{ display: "grid", gap: 8 }}>
        {jobs.map((j) => (
          <Link
            key={j.id}
            href={`/c/${companySlug}/imports/${j.id}`}
            style={{ display: "flex", justifyContent: "space-between", border: "1px solid #ddd", padding: 12 }}
          >
            <div style={{ display: "grid", gap: 4 }}>
              <div style={{ fontWeight: 600 }}>{j.file_name ?? j.storage_path}</div>
              <div style={{ fontSize: 12, opacity: 0.7 }}>
                {j.status} · {new Date(j.received_at).toLocaleString()}
              </div>
              {j.error_message && <div style={{ fontSize: 12, color: "crimson" }}>{j.error_message}</div>}
            </div>
            <div style={{ fontSize: 12, opacity: 0.7 }}>{j.provider}</div>
          </Link>
        ))}

        {jobs.length === 0 && <div>No imports yet.</div>}
      </div>
    </div>
  );
}