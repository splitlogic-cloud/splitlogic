import { redirect } from "next/navigation";
import { createSupabaseServer } from "@/features/supabase/server";
import { listMembershipsForUser } from "@/lib/company-membership";

type DashboardMembershipRow = {
  role: string | null;
  company: {
    id: string;
    name: string | null;
    base_currency: string | null;
  };
};

export default async function DashboardPage() {
  const supabase = await createSupabaseServer();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { memberships, error } = await listMembershipsForUser(user.id);

  return (
    <main style={{ padding: 40 }}>
      <h1>Dashboard</h1>
      <p>Inloggad som: {user.email}</p>

      <h2>Dina bolag</h2>

      {error && <p>Fel: {error.message}</p>}

      <ul>
        {(memberships ?? []).map((m: DashboardMembershipRow) => (
          <li key={m.company.id}>
            {m.company.name} ({m.company.base_currency}) – {m.role}
          </li>
        ))}
      </ul>
    </main>
  );
}
