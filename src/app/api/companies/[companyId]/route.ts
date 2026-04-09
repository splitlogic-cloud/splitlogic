import "server-only";

import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { findCompanyMembershipForUser } from "@/lib/company-membership";

type RouteContext = {
  params: Promise<{
    companyId: string;
  }>;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function hasManageRole(role: string | null): boolean {
  if (!role) return true;
  const normalized = role.toLowerCase();
  return normalized === "owner" || normalized === "admin";
}

function isSchemaCompatibilityError(message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("does not exist") ||
    normalized.includes("schema cache") ||
    normalized.includes("could not find") ||
    normalized.includes("relation")
  );
}

async function requireAuthorizedUser(
  companyId: string
): Promise<{ userId: string }> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("UNAUTHORIZED");
  }

  const membership = await findCompanyMembershipForUser({
    supabase,
    companyId,
    userId: user.id,
  });

  if (!membership) {
    throw new Error("FORBIDDEN");
  }

  if (!hasManageRole(membership.role)) {
    throw new Error("FORBIDDEN");
  }

  return { userId: user.id };
}

export async function PATCH(req: Request, context: RouteContext) {
  try {
    const { companyId } = await context.params;
    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "Missing companyId" },
        { status: 400 }
      );
    }

    await requireAuthorizedUser(companyId);

    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      slug?: string;
    };

    const updates: Record<string, string> = {};
    if (typeof body.name === "string" && body.name.trim()) {
      updates.name = body.name.trim();
    }
    if (typeof body.slug === "string" && body.slug.trim()) {
      const normalizedSlug = slugify(body.slug);
      if (!normalizedSlug) {
        return NextResponse.json(
          { ok: false, error: "Invalid slug" },
          { status: 400 }
        );
      }
      updates.slug = normalizedSlug;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { ok: false, error: "No fields to update" },
        { status: 400 }
      );
    }

    const admin = getSupabaseAdmin();
    const { data, error } = await admin
      .from("companies")
      .update(updates)
      .eq("id", companyId)
      .select("id,name,slug")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, company: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: RouteContext) {
  try {
    const { companyId } = await context.params;
    if (!companyId) {
      return NextResponse.json(
        { ok: false, error: "Missing companyId" },
        { status: 400 }
      );
    }

    await requireAuthorizedUser(companyId);
    const admin = getSupabaseAdmin();

    const membershipTables: Array<"company_memberships" | "memberships"> = [
      "company_memberships",
      "memberships",
    ];
    for (const table of membershipTables) {
      const { error } = await admin.from(table).delete().eq("company_id", companyId);
      if (error && !isSchemaCompatibilityError(error.message)) {
        return NextResponse.json(
          { ok: false, error: `Failed to clean memberships: ${error.message}` },
          { status: 400 }
        );
      }
    }

    const { error: deleteError } = await admin
      .from("companies")
      .delete()
      .eq("id", companyId);

    if (deleteError) {
      return NextResponse.json(
        { ok: false, error: deleteError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "UNAUTHORIZED") {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
    if (message === "FORBIDDEN") {
      return NextResponse.json(
        { ok: false, error: "Forbidden" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 }
    );
  }
}
