import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const companyId = String(searchParams.get("companyId") ?? "");
    const q = String(searchParams.get("q") ?? "").trim();

    if (!companyId || !q) {
      return NextResponse.json([]);
    }

    const { data, error } = await supabaseAdmin
      .from("works")
      .select("id, title, artist")
      .eq("company_id", companyId)
      .or(`title.ilike.%${q}%,artist.ilike.%${q}%`)
      .order("title", { ascending: true })
      .limit(20);

    if (error) {
      return NextResponse.json(
        { error: `Work search failed: ${error.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(data ?? []);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Work search failed",
      },
      { status: 500 }
    );
  }
}