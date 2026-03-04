import UploadImportsClient from "./upload.client";

export default async function Page({
  params,
}: {
  params: Promise<{ companySlug: string }>;
}) {
  const { companySlug } = await params;

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 16 }}>Ny import</h1>

      <div
        style={{
          border: "1px solid rgba(0,0,0,0.08)",
          borderRadius: 16,
          padding: 16,
          background: "white",
          maxWidth: 900,
        }}
      >
        <UploadImportsClient companySlug={companySlug} />
      </div>
    </div>
  );
}