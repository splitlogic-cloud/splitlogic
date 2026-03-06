import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Topbar */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-slate-900 text-white flex items-center justify-center font-semibold">
              SL
            </div>
            <div className="leading-tight">
              <div className="font-semibold">SplitLogic</div>
              <div className="text-xs text-slate-500">Royalty engine</div>
            </div>
          </div>

          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="rounded-xl px-4 py-2 text-sm font-medium border border-slate-200 bg-white hover:bg-slate-50"
            >
              Logga in
            </Link>
            <Link
              href="/signup"
              className="rounded-xl px-4 py-2 text-sm font-medium text-white bg-gradient-to-r from-cyan-500 to-violet-500 hover:opacity-95"
            >
              Skapa konto
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <main>
        <section className="mx-auto max-w-6xl px-6 pt-12 pb-10 grid lg:grid-cols-2 gap-10 items-center">
          <div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-slate-900">
              Avtal blir utbetalningar
              <span className="block text-slate-600 mt-2 text-2xl md:text-3xl font-semibold">
                utan manuella fel
              </span>
            </h1>

            <p className="mt-5 text-slate-600 text-lg leading-relaxed">
              Ladda upp royaltyfiler. Definiera splits som strukturerade regler.
              SplitLogic räknar exakt enligt reglerna – varje gång.
            </p>

            <p className="mt-3 text-slate-600">
              Inga Excel. Inga manuella uträkningar. Inga “det måste ha blivit fel”.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-xl px-5 py-3 font-medium text-white bg-gradient-to-r from-cyan-500 to-violet-500 hover:opacity-95"
              >
                Boka demo
              </Link>
              <a
                href="#how"
                className="rounded-xl px-5 py-3 font-medium border border-slate-200 bg-white hover:bg-slate-50"
              >
                Se hur det fungerar
              </a>
            </div>

            <div className="mt-8 grid grid-cols-3 gap-4">
              <Stat title="99,9%" desc="Precision i splits" />
              <Stat title="10×" desc="Snabbare avräkning" />
              <Stat title="0" desc="Excel-ark" />
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 bg-gradient-to-r from-cyan-200/40 to-violet-200/40 blur-2xl rounded-[40px]" />
            <div className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-lg">
              <Image
                src="/brand/splitlogic-hero.jpg"
                alt="SplitLogic"
                width={1200}
                height={1400}
                className="w-full h-auto"
                priority
              />
            </div>
            <div className="mt-3 text-xs text-slate-500">
              (Din bild i <span className="font-mono">/public/brand/splitlogic-hero.jpg</span>)
            </div>
          </div>
        </section>

        {/* Problem */}
        <section className="mx-auto max-w-6xl px-6 py-10">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold text-slate-900">
              Branschen har ett kostbart problem
            </h2>
            <p className="mt-3 text-slate-600">
              Royaltyhantering bygger fortfarande på CSV-filer, split sheets i mejltrådar och
              manuella Excel-formler. Resultatet blir fel, misstro och onödigt arbete.
            </p>

            <ul className="mt-6 grid md:grid-cols-2 gap-3 text-slate-700">
              <Li>CSV från DSP:er + manuella tolkningar</Li>
              <Li>Excel-formler som ändras och “glöms”</Li>
              <Li>Förskott/recoup räknas olika varje gång</Li>
              <Li>Artister saknar insyn i varför siffror blev som de blev</Li>
              <Li>Labels/managers lägger timmar på kontroll och korrigering</Li>
              <Li>Konflikter för att ingen kan peka på en gemensam “sanning”</Li>
            </ul>
          </div>
        </section>

        {/* How it works */}
        <section id="how" className="mx-auto max-w-6xl px-6 py-10">
          <h2 className="text-2xl font-semibold text-slate-900">
            Allt du behöver för korrekt royalty
          </h2>

          <div className="mt-6 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <Card
              title="Strukturerade splits"
              body="Definiera ägarandelar och regler som data – inte som text. Regler kan granskas, ändras och versionshanteras."
            />
            <Card
              title="Deterministisk beräkning"
              body="Samma input + samma regler = samma output. Alltid. Revisionssäkert och konsekvent över tid."
            />
            <Card
              title="Förskott & recoupment"
              body="Automatisk avräkning mot saldo med full historik: vad är   recoupat, vad återstår, och varför."
            />
            <Card
              title="Full transparens"
              body="Se exakt hur varje krona räknats: per rad, per regel, per period. Slut på gissningar."
            />
            <Card
              title="Avräkningar & export"
              body="Skapa tydliga statements och exportera underlag för utbetalning/fakturering utan manuellt pill."
            />
            <Card
              title="Byggt för indie"
              body="För labels, managers och artister som vill ha ordning – utan enterprise-krångel."
            />
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto max-w-6xl px-6 py-14">
          <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-slate-950 to-slate-900 p-10 text-white shadow-sm">
            <h2 className="text-3xl font-semibold">Redo att sluta räkna i Excel?</h2>
            <p className="mt-3 text-white/80 max-w-2xl">
              Boka en demo och se hur ni går från CSV till korrekt utbetalning på minuter.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-xl px-5 py-3 font-medium text-slate-900 bg-white hover:bg-white/90"
              >
                Boka demo
              </Link>
              <Link
                href="/login"
                className="rounded-xl px-5 py-3 font-medium border border-white/15 hover:bg-white/5"
              >
                Logga in
              </Link>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-slate-200 bg-white">
          <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-slate-500">
            © {new Date().getFullYear()} SplitLogic. Alla rättigheter förbehållna.
          </div>
        </footer>
      </main>
    </div>
  );
}

function Stat({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-2xl font-semibold text-slate-900">{title}</div>
      <div className="text-sm text-slate-500 mt-1">{desc}</div>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-slate-600 text-sm leading-relaxed">{body}</div>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-2 h-2 w-2 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 shrink-0" />
      <span>{children}</span>
    </li>
  );
}