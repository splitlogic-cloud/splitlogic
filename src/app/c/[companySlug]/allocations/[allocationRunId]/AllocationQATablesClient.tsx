"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type {
  AllocationQABlockerRow,
  AllocationQARow,
} from "@/features/allocations/allocation-qa.repo";

type Props = {
  companySlug: string;
  rows: AllocationQARow[];
  blockers: AllocationQABlockerRow[];
};

function includesText(value: string | null | undefined, query: string): boolean {
  if (!query) return true;
  return String(value ?? "").toLowerCase().includes(query);
}

export default function AllocationQATablesClient({
  companySlug,
  rows,
  blockers,
}: Props) {
  const [query, setQuery] = useState("");
  const [showBlockedOnly, setShowBlockedOnly] = useState(false);

  const blockedImportRowIds = useMemo(
    () => new Set(blockers.map((blocker) => blocker.importRowId).filter(Boolean)),
    [blockers]
  );

  const normalizedQuery = query.trim().toLowerCase();

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (showBlockedOnly && !blockedImportRowIds.has(row.importRowId)) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return (
        includesText(row.importRowId, normalizedQuery) ||
        includesText(row.workId, normalizedQuery) ||
        includesText(row.workTitle, normalizedQuery) ||
        includesText(row.partyId, normalizedQuery) ||
        includesText(row.partyName, normalizedQuery) ||
        includesText(row.currency, normalizedQuery)
      );
    });
  }, [rows, showBlockedOnly, blockedImportRowIds, normalizedQuery]);

  const filteredBlockers = useMemo(() => {
    if (!normalizedQuery) {
      return blockers;
    }

    return blockers.filter((blocker) => {
      return (
        includesText(blocker.importRowId, normalizedQuery) ||
        includesText(blocker.blockerCode, normalizedQuery) ||
        includesText(blocker.message, normalizedQuery) ||
        includesText(blocker.rawTitle, normalizedQuery) ||
        includesText(blocker.rowStatus, normalizedQuery) ||
        includesText(
          blocker.rowNumber != null ? String(blocker.rowNumber) : null,
          normalizedQuery
        )
      );
    });
  }, [blockers, normalizedQuery]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm font-medium text-slate-800">
            Search and filter allocation output
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search import row/work/party/blocker..."
              className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm md:w-96"
            />
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={showBlockedOnly}
                onChange={(event) => setShowBlockedOnly(event.target.checked)}
              />
              Show only rows with blockers
            </label>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-800">
          Allocation rows ({filteredRows.length} shown / {rows.length} total)
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Work</th>
              <th className="px-4 py-3 font-medium">Party</th>
              <th className="px-4 py-3 font-medium">Import row</th>
              <th className="px-4 py-3 font-medium">Source amount</th>
              <th className="px-4 py-3 font-medium">Share %</th>
              <th className="px-4 py-3 font-medium">Allocated</th>
              <th className="px-4 py-3 font-medium">Currency</th>
              <th className="px-4 py-3 font-medium">Blocked</th>
              <th className="px-4 py-3 font-medium">Links</th>
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => {
              const isBlocked = blockedImportRowIds.has(row.importRowId);
              return (
                <tr key={row.allocationRowId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.workTitle}</div>
                    <div className="text-xs text-slate-500">{row.workId}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{row.partyName}</div>
                    <div className="text-xs text-slate-500">{row.partyId}</div>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {row.importRowId}
                  </td>
                  <td className="px-4 py-3">{row.sourceAmount.toFixed(6)}</td>
                  <td className="px-4 py-3">{row.sharePercent.toFixed(6)}</td>
                  <td className="px-4 py-3 font-medium">{row.allocatedAmount.toFixed(6)}</td>
                  <td className="px-4 py-3">{row.currency || "—"}</td>
                  <td className="px-4 py-3">
                    {isBlocked ? (
                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Yes
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Link
                        href={`/c/${companySlug}/works/${row.workId}/splits`}
                        className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                      >
                        Work splits
                      </Link>
                      <Link
                        href={`/c/${companySlug}/parties/${row.partyId}`}
                        className="inline-flex rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-slate-50"
                      >
                        Party
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-4 py-3 text-sm font-medium text-slate-800">
          Blockers ({filteredBlockers.length} shown / {blockers.length} total)
        </div>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Severity</th>
              <th className="px-4 py-3 font-medium">Code</th>
              <th className="px-4 py-3 font-medium">Message</th>
              <th className="px-4 py-3 font-medium">Import row</th>
              <th className="px-4 py-3 font-medium">Row #</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Raw title</th>
            </tr>
          </thead>
          <tbody>
            {filteredBlockers.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                  No blockers match current filter.
                </td>
              </tr>
            ) : (
              filteredBlockers.map((blocker) => (
                <tr key={blocker.blockerId} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${
                        blocker.severity === "error"
                          ? "border-rose-200 bg-rose-100 text-rose-800"
                          : blocker.severity === "warning"
                          ? "border-amber-200 bg-amber-100 text-amber-800"
                          : "border-blue-200 bg-blue-100 text-blue-800"
                      }`}
                    >
                      {blocker.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{blocker.blockerCode}</td>
                  <td className="px-4 py-3">{blocker.message}</td>
                  <td className="px-4 py-3 font-mono text-xs">{blocker.importRowId ?? "—"}</td>
                  <td className="px-4 py-3">{blocker.rowNumber ?? "—"}</td>
                  <td className="px-4 py-3">{blocker.rowStatus ?? "—"}</td>
                  <td className="px-4 py-3">{blocker.rawTitle ?? "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
