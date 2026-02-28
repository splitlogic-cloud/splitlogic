import "server-only";
import { requireCompanyBySlugForUser } from "@/features/companies/companies.repo";
import { listImportJobsByCompanyAdmin } from "@/features/imports/imports.repo";
import UploadImportsClient from "./UploadImportsClient";

export default async function ImportsListPage({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  const company = await requireCompanyBySlugForUser(companySlug);

  const jobs = await listImportJobsByCompanyAdmin({
    companyId: company.id,
    limit: 50,
    offset: 0,
  });

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 700 }}>Imports</h1>

      <div style={{ marginTop: 12 }}>
        <UploadImportsClient companyId={company.id} />
      </div>

      <div style={{ marginTop: 18 }}>
        {jobs.length === 0 ? (
          <div>No imports yet.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ textAlign: "left" }}>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>
                  File
                </th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>
                  Provider
                </th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>
                  Status
                </th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>
                  Created
                </th>
                <th style={{ padding: 8, borderBottom: "1px solid #ddd" }}>
                  Processed
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                    <a href={`/c/${company.slug}/imports/${j.id}`}>
                      {j.file_name ?? j.id}
                    </a>
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                    {j.provider ?? "-"}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                    {j.status}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                    {new Date(j.created_at).toLocaleString()}
                  </td>
                  <td style={{ padding: 8, borderBottom: "1px solid #eee" }}>
                    {j.processed_at
                      ? new Date(j.processed_at).toLocaleString()
                      : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}