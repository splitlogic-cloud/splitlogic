"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  companyId: string;
  currentSlug: string;
  currentName: string;
  canManage: boolean;
};

export default function CompanyActionsMenu({
  companyId,
  currentSlug,
  currentName,
  canManage,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSave() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Failed: ${res.status}`);
      }
      setOpen(false);
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete() {
    if (!confirm(`Delete company "${currentName}"? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `Failed: ${res.status}`);
      }
      setOpen(false);
      if (window.location.pathname.includes(`/c/${currentSlug}/`)) {
        router.push("/select-company");
      }
      router.refresh();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen(true);
        }}
        disabled={!canManage}
        title={
          canManage
            ? "Edit or delete company"
            : "You need owner/admin role to manage this company"
        }
        className="text-xs px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Edit / Delete
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6">
          <div className="w-full max-w-md rounded-2xl border bg-white p-5 shadow-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-semibold">Edit company</div>
                  <div className="text-xs text-slate-500">Slug: {currentSlug}</div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="h-8 w-8 rounded-md border text-sm"
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-500">Bolagsnamn</label>
                <input
                  className="h-10 w-full rounded-md border px-3 text-sm"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Bolagsnamn"
                />
              </div>

              {error ? <div className="text-xs text-rose-600">{error}</div> : null}

              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  onClick={onDelete}
                  disabled={saving || deleting}
                  className="h-9 rounded-md border border-rose-300 px-3 text-xs font-medium text-rose-700 disabled:opacity-50"
                  type="button"
                >
                  {deleting ? "Deleting…" : "Delete company"}
                </button>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="h-9 rounded-md border px-3 text-xs font-medium"
                    type="button"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={onSave}
                    disabled={saving || deleting || !newName.trim()}
                    className="h-9 rounded-md bg-slate-900 px-3 text-xs font-medium text-white disabled:opacity-50"
                    type="button"
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
