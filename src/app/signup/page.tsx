import Link from "next/link";
import { signupAction } from "./actions";

export default function Page({ searchParams }: { searchParams?: { error?: string } }) {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-8">
      <form action={signupAction} className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-8 shadow-sm">
        <div className="text-xl font-semibold">Skapa konto</div>

        {searchParams?.error && (
          <div className="mt-4 text-sm text-rose-600">{searchParams.error}</div>
        )}

        <label className="block mt-6 text-sm font-medium">E-post</label>
        <input name="email" type="email" required className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" />

        <label className="block mt-4 text-sm font-medium">Lösenord</label>
        <input name="password" type="password" required className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2" />

        <button className="mt-6 w-full rounded-xl px-4 py-2 font-medium text-white bg-gradient-to-r from-cyan-500 to-violet-500 hover:opacity-95">
          Skapa konto
        </button>

        <div className="mt-4 text-sm text-slate-600">
          Har du konto? <Link className="text-cyan-700 hover:underline" href="/login">Logga in</Link>
        </div>
      </form>
    </div>
  );
}