import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { createCompanyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function Page({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  if (!me?.user) redirect("/login");

  // Om user redan har en membership -> gå direkt till första company
  const { data: memberships } = await supabase
    .from("company_memberships")
    .select("company_id, companies:companies(slug)")
    .eq("user_id", me.user.id)
    .limit(1);

    const existingSlug = (memberships?.[0]?.companies?.[0]?.slug ?? undefined) as string | undefined;
  if (existingSlug) redirect(`/c/${existingSlug}/dashboard`);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <form
        action={createCompanyAction}
        className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm"
      >
        <div className="text-xl font-semibold">Skapa din första company</div>
        <div className="text-sm text-slate-600 mt-2">
          Detta blir din tenant i SplitLogic.
        </div>

        {searchParams?.error && (
          <div className="mt-4 text-sm text-rose-600">
            {searchParams.error}
          </div>
        )}

        <label className="block mt-6 text-sm font-medium">Company name</label>
        <input
          name="name"
          required
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"
          placeholder="Demo AB"
        />

        <label className="block mt-4 text-sm font-medium">
          Slug (valfritt)
        </label>
        <input
          name="slug"
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2"
          placeholder="demo"
        />

        <button className="mt-6 w-full rounded-xl px-4 py-2 font-medium text-white bg-gradient-to-r from-cyan-500 to-violet-500 hover:opacity-95">
          Skapa company
        </button>

        <div className="mt-4 text-sm">
          <Link className="text-slate-500 hover:underline" href="/">
            Tillbaka
          </Link>
        </div>
      </form>
    </div>
  );
}