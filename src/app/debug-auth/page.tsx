import { getUser } from "@/lib/auth/getUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DebugAuthPage() {
  const user = await getUser();

  return (
    <pre style={{ padding: 24 }}>
      {JSON.stringify(
        {
          user: user
            ? { id: user.id, email: user.email }
            : null,
        },
        null,
        2
      )}
    </pre>
  );
}