import { supabaseAdmin } from "@/lib/supabase/admin";
import { listSuggestions } from "@/features/matching/suggestions.repo";
import { approveSuggestion } from "@/features/matching/approve-suggestion-action";
import { rejectSuggestion } from "@/features/matching/reject-suggestion-action";
import { bulkApprove } from "@/features/matching/bulk-approve-suggestions-action";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ companySlug: string }>;
  searchParams: Promise<{ importId?: string }>;
};

function pick(obj: any, keys: string[]): string {
  for (const key of keys) {
    const value = obj?.[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }
  return "";
}

function formatConfidence(value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value.toFixed(2);
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed.toFixed(2);
    }
  }

  return "—";
}

export default async function SuggestionsPage({
  params,
  searchParams,
}: PageProps) {
  const { companySlug } = await params;
  const { importId } = await searchParams;

  if (!importId) {
    return (
      <div className="space-y-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-950">
          Suggested Matches
        </h1>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Missing <code>importId</code> in URL.
        </div>
      </div>
    );
  }

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError || !company) {
    throw new Error("Company not found");
  }

  const rows = await listSuggestions(importId);

  const pendingIds = rows.map((row: any) => String(row.id)).filter(Boolean);

  return (
    <div className="space-y-8 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">Matching / Suggestions</div>
          <h1 className="mt-1 text-4xl font-semibold tracking-tight text-slate-950">
            Suggested Matches
          </h1>
          <div className="mt-2 text-sm text-slate-600">
            {company.name ?? company.slug} · review likely matches before final
            allocation.
          </div>
        </div>

        {pendingIds.length > 0 ? (
          <form action={bulkApprove}>
            <input type="hidden" name="ids" value={pendingIds.join(",")} />
            <input type="hidden" name="companyId" value={company.id} />
            <input type="hidden" name="companySlug" value={companySlug} />
            <input type="hidden" name="importId" value={importId} />
            <button className="inline-flex rounded-lg bg-black px-4 py-2 text-sm font-medium text-white">
              Approve All
            </button>
          </form>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Pending suggestions
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-950">
            {rows.length}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Import ID
          </div>
          <div className="mt-2 text-sm font-medium text-slate-950">
            {importId}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-xs uppercase tracking-wide text-slate-500">
            Workflow
          </div>
          <div className="mt-2 text-sm text-slate-700">
            Approve saves the match. Reject keeps it out of this queue.
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Title</th>
              <th className="px-4 py-3 font-medium">Artist</th>
              <th className="px-4 py-3 font-medium">ISRC</th>
              <th className="px-4 py-3 font-medium">Suggested work</th>
              <th className="px-4 py-3 font-medium">Confidence</th>
              <th className="px-4 py-3 font-medium">Actions</th>
            </tr>
          </thead>

          <tbody>
            {rows.length > 0 ? (
              rows.map((row: any) => {
                const canonical = row.canonical || {};
                const raw = row.raw || {};
                const suggested = Array.isArray(row.works)
                  ? row.works[0]
                  : row.works;

                const title =
                  pick(canonical, ["title"]) ||
                  pick(raw, [
                    "title",
                    "track",
                    "track_title",
                    "trackTitle",
                    "song_title",
                  ]) ||
                  "—";

                const artist =
                  pick(canonical, ["artist"]) ||
                  pick(raw, [
                    "artist",
                    "track_artist",
                    "trackArtist",
                    "main_artist",
                  ]) ||
                  "—";

                const isrc =
                  pick(canonical, ["isrc"]) ||
                  pick(raw, ["isrc", "ISRC"]) ||
                  "—";

                const suggestedTitle =
                  (typeof suggested?.title === "string" &&
                  suggested.title.trim() !== ""
                    ? suggested.title
                    : "Untitled work") || "Untitled work";

                const suggestedArtist =
                  typeof suggested?.artist === "string" &&
                  suggested.artist.trim() !== ""
                    ? suggested.artist
                    : "";

                return (
                  <tr
                    key={row.id}
                    className="border-t border-slate-100 align-top"
                  >
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {title}
                    </td>

                    <td className="px-4 py-3 text-slate-700">{artist}</td>

                    <td className="px-4 py-3 text-slate-700">{isrc}</td>

                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {suggestedTitle}
                      </div>
                      {suggestedArtist ? (
                        <div className="mt-1 text-xs text-slate-500">
                          {suggestedArtist}
                        </div>
                      ) : null}
                      {suggested?.id ? (
                        <div className="mt-1 text-xs text-slate-500">
                          {suggested.id}
                        </div>
                      ) : null}
                    </td>

                    <td className="px-4 py-3 text-slate-700">
                      {formatConfidence(row.suggestion_confidence)}
                    </td>

                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <form action={approveSuggestion}>
                          <input type="hidden" name="rowId" value={row.id} />
                          <input
                            type="hidden"
                            name="workId"
                            value={suggested?.id ?? ""}
                          />
                          <input
                            type="hidden"
                            name="companySlug"
                            value={companySlug}
                          />
                          <input
                            type="hidden"
                            name="importId"
                            value={importId}
                          />
                          <button className="inline-flex rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700">
                            Approve
                          </button>
                        </form>

                        <form action={rejectSuggestion}>
                          <input type="hidden" name="rowId" value={row.id} />
                          <input
                            type="hidden"
                            name="companySlug"
                            value={companySlug}
                          />
                          <input
                            type="hidden"
                            name="importId"
                            value={importId}
                          />
                          <button className="inline-flex rounded-lg border border-rose-300 px-3 py-2 text-sm font-medium text-rose-700 hover:bg-rose-50">
                            Reject
                          </button>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">
                  No pending suggested matches for this import.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}