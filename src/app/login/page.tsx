"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/features/supabase/browser";

export default function LoginPage() {
  const supabase = createSupabaseBrowser();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      setMessage(error.message);
    } else {
      setMessage("Magic link skickad. Kolla din inbox.");
    }

    setLoading(false);
  };

  return (
    <main style={{ maxWidth: 400, margin: "80px auto" }}>
      <h1>Login</h1>

      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <input
          type="email"
          placeholder="your@email.com"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: 8 }}
        />

        <button type="submit" disabled={loading} style={{ padding: 8 }}>
          {loading ? "Skickar..." : "Skicka magic link"}
        </button>
      </form>

      {message && <p style={{ marginTop: 12 }}>{message}</p>}
    </main>
  );
}
