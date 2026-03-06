"use client";

import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  return (
    <button
      className="rounded-md border px-3 py-2 text-sm hover:bg-neutral-50"
      onClick={async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        window.location.href = "/";
      }}
    >
      Logga ut
    </button>
  );
}