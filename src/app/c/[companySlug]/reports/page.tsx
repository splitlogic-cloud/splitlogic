import "server-only";

import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    companySlug: string;
  }>;
};

type AllocationLineReportRow = {
  allocated_amount: number | string | null;
  currency: string | null;
  work_id: string | null;
  works:
    | {
        title?: string | null;
      }
    | Array<{
        title?: string | null;
      }>
    | null;
  import_rows:
    | {
        canonical?: Record<string, unknown> | null;
        normalized?: Record<string, unknown> | null;
        raw?: Record<string, unknown> | null;
      }
    | Array<{
        canonical?: Record<string, unknown> | null;
        normalized?: Record<string, unknown> | null;
        raw?: Record<string, unknown> | null;
      }>
    | null;
};

type SongStats = {
  workId: string;
  workTitle: string;
  playCount: number;
  allocatedAmount: number;
  currencies: Set<string>;
};

type CountryStats = {
  country: string;
  playCount: number;
  allocatedAmount: number;
  currencies: Set<string>;
};

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown): string | null {
  if (value == null) return null;
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function asNumber(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeCountry(raw: string | null): string {
  if (!raw) return "Unknown";
  const normalized = raw.trim();
  if (!normalized) return "Unknown";
  if (normalized.length <= 3) return normalized.toUpperCase();
  return normalized[0].toUpperCase() + normalized.slice(1).toLowerCase();
}

function extractTerritoryFromImportRow(
  importRow:
    | {
        canonical?: Record<string, unknown> | null;
        normalized?: Record<string, unknown> | null;
        raw?: Record<string, unknown> | null;
      }
    | null
): string | null {
  if (!importRow) return null;

  const canonical = asObject(importRow.canonical);
  const normalized = asObject(importRow.normalized);
  const raw = asObject(importRow.raw);

  const candidates = [
    asString(canonical?.territory),
    asString(normalized?.territory),
    asString(raw?.territory),
    asString(raw?.country),
    asString(raw?.country_code),
    asString(raw?.market),
    asString(raw?.["Country"]),
    asString(raw?.["COUNTRY"]),
    asString(raw?.["Territory"]),
    asString(raw?.["TERRITORY"]),
  ];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }
  return null;
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("sv-SE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function firstObject<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

export default async function ReportsPage({ params }: PageProps) {
  const { companySlug } = await params;

  const { data: company, error: companyError } = await supabaseAdmin
    .from("companies")
    .select("id, slug, name")
    .eq("slug", companySlug)
    .maybeSingle();

  if (companyError) {
    throw new Error(`Failed to load company: ${companyError.message}`);
  }
  if (!company) {
    notFound();
  }

  const { data: allocationLines, error: allocationLinesError } = await supabaseAdmin
    .from("allocation_lines")
    .select(
      `
      allocated_amount,
      currency,
      work_id,
      works:works (
        title
      ),
      import_rows:import_rows (
        canonical,
        normalized,
        raw
      )
    `
    )
    .eq("company_id", company.id)
    .limit(20000);

  if (allocationLinesError) {
    throw new Error(`Failed to load report data: ${allocationLinesError.message}`);
  }

  const songMap = new Map<string, SongStats>();
  const countryMap = new Map<string, CountryStats>();
  let totalAllocated = 0;
  let totalRows = 0;

  for (const row of (allocationLines ?? []) as AllocationLineReportRow[]) {
    totalRows += 1;
    const amount = asNumber(row.allocated_amount);
    totalAllocated += amount;

    const currency = asString(row.currency);
    const workId = asString(row.work_id) ?? "unknown-work";
    const workObj = firstObject(row.works);
    const workTitle = asString(workObj?.title) ?? "Untitled work";

    const songStats = songMap.get(workId) ?? {
      workId,
      workTitle,
      playCount: 0,
      allocatedAmount: 0,
      currencies: new Set<string>(),
    };
    songStats.playCount += 1;
    songStats.allocatedAmount += amount;
    if (currency) songStats.currencies.add(currency);
    songMap.set(workId, songStats);

    const importRowObj = firstObject(row.import_rows);
    const territory = normalizeCountry(extractTerritoryFromImportRow(importRowObj));
    const countryStats = countryMap.get(territory) ?? {
      country: territory,
      playCount: 0,
      allocatedAmount: 0,
      currencies: new Set<string>(),
    };
    countryStats.playCount += 1;
    countryStats.allocatedAmount += amount;
    if (currency) countryStats.currencies.add(currency);
    countryMap.set(territory, countryStats);
  }

  const topSongs = [...songMap.values()]
    .sort((a, b) => b.allocatedAmount - a.allocatedAmount)
    .slice(0, 25);
  const topCountries = [...countryMap.values()]
    .sort((a, b) => b.allocatedAmount - a.allocatedAmount)
    .slice(0, 25);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-sm text-neutral-500">
          <Link href={`/c/${companySlug}/dashboard`} className="underline">
            Dashboard
          </Link>{" "}
          / Rapporter
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Rapporter</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Statistik över spelningar/intjäning per låt och land (baserat på allocation lines).
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Allokerade rader</div>
          <div className="mt-2 text-lg font-semibold">{totalRows}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Totalt allokerat</div>
          <div className="mt-2 text-lg font-semibold">{formatMoney(round2(totalAllocated))}</div>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-neutral-500">Unika låtar</div>
          <div className="mt-2 text-lg font-semibold">{songMap.size}</div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="overflow-hidden rounded-2xl border bg-white">
          <div className="border-b px-4 py-3 text-sm font-medium">Topplåtar (på intjäning)</div>
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Låt</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Spelningar</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Intjäning</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Valuta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {topSongs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    Ingen data ännu.
                  </td>
                </tr>
              ) : (
                topSongs.map((song) => (
                  <tr key={song.workId}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{song.workTitle}</div>
                      <div className="text-xs text-neutral-500">{song.workId}</div>
                    </td>
                    <td className="px-4 py-3">{song.playCount}</td>
                    <td className="px-4 py-3">{formatMoney(round2(song.allocatedAmount))}</td>
                    <td className="px-4 py-3">
                      {song.currencies.size > 0 ? [...song.currencies].join(", ") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-hidden rounded-2xl border bg-white">
          <div className="border-b px-4 py-3 text-sm font-medium">Länder / territorier</div>
          <table className="min-w-full divide-y divide-neutral-200 text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Land</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Spelningar</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Intjäning</th>
                <th className="px-4 py-3 text-left font-medium text-neutral-600">Valuta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {topCountries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    Ingen data ännu.
                  </td>
                </tr>
              ) : (
                topCountries.map((country) => (
                  <tr key={country.country}>
                    <td className="px-4 py-3 font-medium">{country.country}</td>
                    <td className="px-4 py-3">{country.playCount}</td>
                    <td className="px-4 py-3">
                      {formatMoney(round2(country.allocatedAmount))}
                    </td>
                    <td className="px-4 py-3">
                      {country.currencies.size > 0 ? [...country.currencies].join(", ") : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
