import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white shadow-sm">
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
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium hover:bg-slate-50"
            >
              Logga in
            </Link>
            <Link
              href="/signup"
              className="rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-95"
            >
              Boka demo
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.18),transparent_35%),radial-gradient(circle_at_top_right,rgba(139,92,246,0.18),transparent_35%)]" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-6 pb-14 pt-14 lg:grid-cols-2">
            <div>
              <div className="inline-flex items-center rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-xs font-medium text-cyan-700">
                För labels, managers och artistvänliga team
              </div>

              <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-900 md:text-6xl">
                Royalty utbetalningar
                <span className="block bg-gradient-to-r from-cyan-500 to-violet-500 bg-clip-text text-transparent">
                  utan Excel-kaos
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-lg leading-relaxed text-slate-600">
                Ladda upp royaltyfiler, definiera splits som strukturerade regler
                och låt SplitLogic räkna exakt varje gång. Transparant,
                revisionssäkert och byggt för musikbranschen.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href="/signup"
                  className="rounded-xl bg-slate-900 px-5 py-3 font-medium text-white shadow-sm hover:bg-slate-800"
                >
                  Boka demo
                </Link>
                <a
                  href="#how"
                  className="rounded-xl border border-slate-200 bg-white px-5 py-3 font-medium hover:bg-slate-50"
                >
                  Se hur det fungerar
                </a>
              </div>

              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-slate-500">
                <span>Inga manuella formler</span>
                <span>Full audit trail</span>
                <span>Byggt för indie</span>
              </div>

              <div className="mt-8 grid grid-cols-3 gap-4">
                <Stat title="99,9%" desc="Precision i splits" />
                <Stat title="10×" desc="Snabbare avräkning" />
                <Stat title="0" desc="Excel-ark" />
              </div>
            </div>

            <div className="relative">
              <div className="absolute -inset-6 rounded-[40px] bg-gradient-to-r from-cyan-200/40 to-violet-200/40 blur-2xl" />
              <div className="relative overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
                <Image
                  src="/brand/splitlogic-hero.jpg"
                  alt="SplitLogic dashboard"
                  width={1200}
                  height={1400}
                  className="h-auto w-full"
                  priority
                />
              </div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-8">
          <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
            <h2 className="text-2xl font-semibold">
              Branschen har ett kostsamt problem
            </h2>
            <p className="mt-3 max-w-3xl text-slate-600">
              Royaltyhantering bygger fortfarande på CSV-filer, split sheets i
              mejltrådar och manuella Excel-formler. Resultatet blir fel,
              misstro och onödigt arbete.
            </p>

            <ul className="mt-6 grid gap-3 text-slate-700 md:grid-cols-2">
              <Li>CSV från DSP:er + manuella tolkningar</Li>
              <Li>Excel-formler som ändras och glöms</Li>
              <Li>Förskott och recoup räknas olika varje gång</Li>
              <Li>Artister saknar insyn i varför siffror blev som de blev</Li>
              <Li>Labels och managers lägger timmar på kontroll</Li>
              <Li>Tvister uppstår när ingen har en gemensam sanning</Li>
            </ul>
          </div>
        </section>

        <section id="how" className="mx-auto max-w-6xl px-6 py-10">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold">
              Allt du behöver för korrekt royalty
            </h2>
            <p className="mt-2 text-slate-600">
              Från inläst revenue till färdig statement, utan manuellt pill.
            </p>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card
              title="Strukturerade splits"
              body="Definiera ägarandelar och regler som data i stället för lösa anteckningar och text."
            />
            <Card
              title="Deterministisk beräkning"
              body="Samma input och samma regler ger samma output. Varje gång."
            />
            <Card
              title="Förskott & recoupment"
              body="Automatisk avräkning mot saldo med full historik över vad som återstår och varför."
            />
            <Card
              title="Full transparens"
              body="Se exakt hur varje krona räknats per rad, regel och period."
            />
            <Card
              title="Statements & export"
              body="Skapa tydliga statements och underlag för utbetalning eller fakturering."
            />
            <Card
              title="Byggt för indie"
              body="För labels, managers och artister som vill ha ordning utan enterprise-krångel."
            />
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-6 py-14">
          <div className="rounded-[32px] border border-slate-200 bg-gradient-to-r from-slate-950 to-slate-900 p-10 text-white shadow-sm">
            <h2 className="text-3xl font-semibold">
              Redo att sluta räkna i Excel?
            </h2>
            <p className="mt-3 max-w-2xl text-white/80">
              Boka en demo och se hur ni går från CSV till korrekt utbetalning på
              minuter, inte dagar.
            </p>

            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="rounded-xl bg-white px-5 py-3 font-medium text-slate-900 hover:bg-white/90"
              >
                Boka demo
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-white/15 px-5 py-3 font-medium hover:bg-white/5"
              >
                Logga in
              </Link>
            </div>
          </div>
        </section>

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
      <div className="mt-1 text-sm text-slate-500">{desc}</div>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="font-semibold text-slate-900">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-slate-600">{body}</div>
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-gradient-to-r from-cyan-500 to-violet-500" />
      <span>{children}</span>
    </li>
  );
}