export default async function Test({ params }: { params: Promise<{ x: string }> }) {
    const { x } = await params;
    return <pre style={{ padding: 24 }}>{JSON.stringify({ x }, null, 2)}</pre>;
  }