import "server-only";

import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { runAllocation } from "@/features/allocations/run-allocation";
import { refreshImportJobAggregates } from "@/app/c/[companySlug]/imports/[importJobId]/actions";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const companySlug = String(body.companySlug ?? "").trim();
    const importJobId = String(body.importJobId ?? "").trim();

    if (!companySlug || !importJobId) {
      return NextResponse.json(
        { error: "companySlug and importJobId are required" },
        { status: 400 },
      );
    }

    // Hämta aktuell användare
    const supabase = await createClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      return NextResponse.json(
        { error: `auth failed: ${userError.message}` },
        { status: 401 },
      );
    }

    if (!user) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    // Hämta companyId från slug
    const { data: company, error: companyError } = await supabaseAdmin
      .from("companies")
      .select("id, slug")
      .eq("slug", companySlug)
      .maybeSingle();

    if (companyError || !company) {
      return NextResponse.json(
        { error: `company not found: ${companyError?.message ?? ""}` },
        { status: 404 },
      );
    }

    // Kör allocation med objekt
    const result = await runAllocation({
      companyId: company.id,
      importJobId,
      currency: null,
      createdBy: user.id,
    });

    await refreshImportJobAggregates(company.id, importJobId);

    // Revalidate path för Next-cache
    revalidatePath(`/c/${companySlug}/imports/${importJobId}`);
    revalidatePath(`/c/${companySlug}/allocations`);

    return NextResponse.json({ success: true, result });
  } catch (err: unknown) {
    console.error("run-allocation failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}