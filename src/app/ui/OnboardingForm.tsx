"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function slugify(input: string) {
  return input
    .toLowerCase()
    .trim()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function OnboardingForm() {
  const router = useRouter();
  const supabase = createClient();

  const [name, setName] = useState("");
  const autoSlug = useMemo(() => slugify(name || "demo"), [name]);
  const [slug, setSlug] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setLoading(true);

    const finalSlug = (slug.trim() || autoSlug).slice(0, 40);

    const { data, error } = await supabase.rpc("create_company_for_user", {
      p_name: name.trim(),
      p_slug: finalSlug,
    });

    setLoading(false);

    if (error) return setErr(error.message);
    if (!data) return setErr("No company id returned");

    router.push(`/c/${finalSlug}/dashboard`);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="text-sm text-slate-600">Company name</label>
        <input
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Demo AB"
        />
      </div>

      <div>
        <label className="text-sm text-slate-600">Slug</label>
        <input
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          placeholder={autoSlug}
        />
        <div className="text-xs text-slate-500 mt-1">
          URL: <span className="font-mono">/c/{slug.trim() || autoSlug}</span>
        </div>
      </div>

      {err && <div className="text-sm text-rose-600">{err}</div>}

      <button
        disabled={loading || !name.trim()}
        className="w-full rounded-xl px-4 py-2 font-medium text-white bg-gradient-to-r from-cyan-500 to-violet-500 hover:opacity-95 disabled:opacity-60"
      >
        {loading ? "Skapar..." : "Skapa company"}
      </button>
    </form>
  );
}