import Link from "next/link";
import { requireActiveCompany } from "@/lib/active-company";
import { getImportJob, listImportRows } from "@/features/imports/imports.repo";

export default async function ImportDetailPage({
  params,
}: {
  params: Promise<{ companySlug: string; importId: string }>;
}) {
  const { companySlug, importId } = await params;
  const ctx = await requireActiveCompany(companySlug);

  const job = await getImportJob(ctx.companyId, importId);
  if (!job) return <div style={{ padding: 24 }}>Not found</div>;

  const rows = await listImportRows(importId, 20);

  return (
    <div style={{ padding: 24, display: "grid", gap: 12 }}>
      <Link href={`/c/${companySlug}/imports`}>← Back</Link>

      <h1>Import</h1>

      <div style={{ fontSize: 12, opacity: 0.8 }}>
        <div>Status: {job.status}</div>
        <div>File: {job.file_name}</div>
        <div>Received: {new Date(job.received_at).toLocaleString()}</div>
      </div>

      {job.error_message && <div style={{ color: "crimson" }}>{job.error_message}</div>}

      <h2 style={{ marginTop: 16 }}>Preview (first 20 rows)</h2>

      <div style={{ border: "1px solid #ddd", padding: 12, overflowX: "auto" }}>
        {rows.length === 0 ? (
          <div>No rows yet.</div>
        ) : (
          <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>{JSON.stringify(rows, null, 2)}</pre>
        )}
      </div>
    </div>
  );
}