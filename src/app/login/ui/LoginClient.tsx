"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type Tab = "login" | "signup";

export default function LoginClient() {
  const router = useRouter();
  const supabase = createSupabaseBrowserClient();

  const [tab, setTab] = useState<Tab>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit() {
    setErr(null);
    setMsg(null);
    setLoading(true);
    try {
      if (!email.trim() || !password) throw new Error("Fyll i email och lösenord");

      if (tab === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) throw error;
        router.push("/select-company");
        router.refresh();
        return;
      }

      // signup
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          // Om du har email confirmation på i Supabase:
          // emailRedirectTo: `${location.origin}/select-company`,
        },
      });
      if (error) throw error;

      setMsg("Konto skapat. Om email-verifiering är på: kolla din mail och logga in.");
      setTab("login");
    } catch (e: any) {
      setErr(e?.message ?? "Okänt fel");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex rounded-lg border bg-slate-50 p-1">
        <button
          className={`flex-1 h-9 rounded-md text-sm font-medium ${
            tab === "login" ? "bg-white shadow-sm border" : "text-slate-600"
          }`}
          onClick={() => setTab("login")}
          type="button"
        >
          Logga in
        </button>
        <button
          className={`flex-1 h-9 rounded-md text-sm font-medium ${
            tab === "signup" ? "bg-white shadow-sm border" : "text-slate-600"
          }`}
          onClick={() => setTab("signup")}
          type="button"
        >
          Skapa konto
        </button>
      </div>

      <div className="space-y-2">
        <label className="text-xs text-slate-500">Email</label>
        <input
          className="h-10 w-full rounded-md border px-3 text-sm"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="du@bolag.se"
          autoComplete="email"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs text-slate-500">Lösenord</label>
        <input
          className="h-10 w-full rounded-md border px-3 text-sm"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          type="password"
          autoComplete={tab === "signup" ? "new-password" : "current-password"}
        />
      </div>

      <button
        onClick={onSubmit}
        disabled={loading}
        className="h-10 w-full rounded-md bg-slate-900 text-white text-sm font-medium disabled:opacity-50"
        type="button"
      >
        {loading ? "Jobbar…" : tab === "login" ? "Logga in" : "Skapa konto"}
      </button>

      {err ? <div className="text-xs text-rose-600">{err}</div> : null}
      {msg ? <div className="text-xs text-emerald-700">{msg}</div> : null}
    </div>
  );
}