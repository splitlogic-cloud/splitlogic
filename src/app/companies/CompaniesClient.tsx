"use client";

import { useState } from "react";

export default function CompaniesClient({ initialData }: { initialData: any[] }) {
  const [companies, setCompanies] = useState(initialData);
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function addCompany(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    const json = await res.json();
    setLoading(false);

    if (!res.ok) {
      alert(json?.error?.message ?? json?.error ?? "Något gick fel");
      return;
    }

    setCompanies([json.data, ...companies]);
    setName("");
  }

  return (
    <div style={{ padding: "40px" }}>
      <h1>Companies</h1>

      <form onSubmit={addCompany} style={{ marginBottom: "20px" }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Company name"
        />
        <button type="submit" disabled={loading} style={{ marginLeft: "10px" }}>
          {loading ? "Saving..." : "Add"}
        </button>
      </form>

      <ul>
        {companies.map((c: any) => (
          <li key={c.id}>
            <strong>{c.name}</strong> – {c.base_currency}
          </li>
        ))}
      </ul>
    </div>
  );
}
