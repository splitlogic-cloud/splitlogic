"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function createCompanyAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const slugInput = String(formData.get("slug") || "").trim();
  const slug = slugInput ? slugify(slugInput) : slugify(name);

  if (!name) redirect(`/onboarding?error=${encodeURIComponent("Skriv ett namn.")}`);
  if (!slug) redirect(`/onboarding?error=${encodeURIComponent("Ogiltig slug.")}`);

  const supabase = await createClient();

  const { data: me } = await supabase.auth.getUser();
  if (!me?.user) redirect("/login");

  const { error } = await supabase.rpc("create_company_for_user", {
    p_name: name,
    p_slug: slug,
  });

  if (error) redirect(`/onboarding?error=${encodeURIComponent(error.message)}`);

  redirect(`/c/${slug}/dashboard`);
}