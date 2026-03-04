// src/app/login/page.tsx
import LoginClient from "./ui/LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <div className="min-h-[calc(100vh-0px)] flex items-center justify-center p-6 bg-slate-50">
      <div className="w-full max-w-md rounded-2xl border bg-white p-6 shadow-sm space-y-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">SplitLogic</h1>
          <p className="text-sm text-slate-600">
            Logga in för att komma åt dina bolag. Du väljer bolag efter inloggning och kan byta när som helst.
          </p>
        </div>

        <LoginClient />

        <div className="pt-2 text-xs text-slate-500">
          Saknar du access? <span className="font-medium text-slate-700">Be om inbjudan</span> (lägg mail/CTA här).
        </div>
      </div>
    </div>
  );
}