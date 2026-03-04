export const dynamic = "force-dynamic";

export default function Debug({ params }: { params: any }) {
  return (
    <div style={{ padding: 24 }}>
      <h1>Debug</h1>
      <pre>{JSON.stringify(params, null, 2)}</pre>
    </div>
  );
}