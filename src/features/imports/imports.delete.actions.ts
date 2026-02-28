"use server";

export async function deleteLatestImportAction(companyId: string, importId: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const res = await fetch(`${base}/api/imports/${importId}`, {
    method: "DELETE",
    headers: { "x-company-id": companyId },
    cache: "no-store",
  });

  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `Delete failed (${res.status})`);

  return json as { ok: true; deletedImportId: string };
}