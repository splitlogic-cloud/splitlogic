import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/features/supabase/server";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: memberships, error } = await supabase
    .from("memberships")
    .select("role, company:companies(id, name, base_currency)")
    .eq("user_id", user.id);

  return (
    <main style={{ padding: 40 }}>
      <h1>Dashboard</h1>
      <p>Inloggad som: {user.email}</p>

      <h2>Dina bolag</h2>

      {error && <p>Fel: {error.message}</p>}

      <ul>
        {(memberships ?? []).map((m: any) => (
          <li key={m.company.id}>
            {m.company.name} ({m.company.base_currency}) – {m.role}
          </li>
        ))}
      </ul>
    </main>
  );
}
