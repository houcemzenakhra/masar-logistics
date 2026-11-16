import { Banknote, PackageCheck, Truck, Warehouse } from "lucide-react";
import { RateCalculator } from "@/components/rate-calculator";
import { SiteFooter, SiteNav, TrackForm } from "@/components/site";
import { LinkButton } from "@/components/ui";
import { initLocale, place, t } from "@/lib/i18n";
import { getDb } from "@/server/db";
import { listHubs, listWilayas } from "@/server/services/directory";
import { getTiers } from "@/server/services/parcels";

export const dynamic = "force-dynamic";

const STEPS = [
  { icon: PackageCheck, title: "Create the order", body: "Add the recipient and the amount to collect. Print the label and stick it on the parcel." },
  { icon: Truck, title: "We pick it up", body: "A courier collects from your door and the parcel is scanned at every hub on its route." },
  { icon: Banknote, title: "Get paid", body: "The courier collects cash on delivery. Your balance updates the moment the parcel is delivered." },
];

export default async function Home() {
  await initLocale();
  const db = await getDb();
  const [wilayas, hubs, tiers] = await Promise.all([listWilayas(db), listHubs(db), getTiers(db)]);
  const stats: [string | number, string][] = [
    [wilayas.length, "wilayas covered"],
    [hubs.length, "sorting hubs"],
    [`${tiers[0].base} ${t("DZD")}`, "local delivery from"],
  ];
  return (
    <>
      <header className="relative overflow-hidden bg-navy text-white">
        <div className="route-grid absolute inset-0" aria-hidden />
        <svg className="absolute -end-10 top-10 hidden h-[420px] w-[620px] opacity-90 lg:block rtl:-scale-x-100" viewBox="0 0 620 420" fill="none" aria-hidden>
          <path d="M20 380C120 360 150 250 250 240s120-90 200-110 110-70 150-100" stroke="#ff5b24" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 12" />
          {[[20, 380], [250, 240], [450, 130], [600, 30]].map(([x, y], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r="14" fill="#ff5b24" fillOpacity=".18" />
              <circle cx={x} cy={y} r="5" fill={i === 3 ? "#fff" : "#ff5b24"} />
            </g>
          ))}
        </svg>
        <div className="relative">
          <SiteNav dark />
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pb-28 sm:pt-20">
            <p className="text-sm font-medium text-accent">{t("Delivery for Algerian online sellers")}</p>
            <h1 className="mt-4 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">{t("Every parcel on the right path.")}</h1>
            <p className="mt-5 max-w-xl text-lg text-white/70">
              {t("Masar picks up from your door, moves parcels through {h} hubs and delivers to all {w} wilayas, with cash on delivery you can follow to the dinar.", { h: hubs.length, w: wilayas.length })}
            </p>
            <div className="mt-8"><TrackForm large /></div>
            <dl className="mt-12 grid max-w-xl grid-cols-3 gap-4 border-t border-white/10 pt-8 sm:gap-6">
              {stats.map(([v, l]) => (
                <div key={l}>
                  <dt className="tnum text-xl font-semibold sm:text-3xl">{v}</dt>
                  <dd className="mt-1 text-[13px] text-white/55 sm:text-sm">{t(l)}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("From your shop to their door")}</h2>
          <ol className="mt-8 grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-3xl border border-line bg-surface p-6 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-2xl bg-accent-soft text-accent-deep"><s.icon size={22} /></span>
                  <span className="tnum font-mono text-sm text-muted">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold">{t(s.title)}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-ink-2">{t(s.body)}</p>
              </li>
            ))}
          </ol>
        </section>

        <section id="rates" className="mx-auto max-w-6xl scroll-mt-8 px-4 pb-16 sm:px-6 sm:pb-20">
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("Know the price before you ship")}</h2>
          <p className="mt-2 max-w-xl text-ink-2">{t("One flat rate per zone, taken from the cash collected. Nothing to pay up front.")}</p>
          <div className="mt-8"><RateCalculator wilayas={wilayas} tiers={tiers} /></div>
        </section>

        <section id="coverage" className="scroll-mt-8 border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("{h} hubs, every wilaya", { h: hubs.length })}</h2>
            <p className="mt-2 max-w-xl text-ink-2">{t("Each wilaya is served by its nearest hub. Parcels between hubs travel in sealed bags on scheduled linehaul.")}</p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {hubs.map((h) => (
                <article key={h.id} className="rounded-2xl border border-line bg-paper/60 p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-xl bg-navy text-white"><Warehouse size={18} /></span>
                    <div>
                      <h3 className="font-semibold">{t(h.name)}</h3>
                      <p className="text-[13px] text-muted">{t("Serves {n} wilayas", { n: h.wilayas })}</p>
                    </div>
                  </div>
                  <p className="mt-4 text-[13px] leading-relaxed text-ink-2">
                    {wilayas.filter((w) => w.hubId === h.id).map((w) => place(w.name, w.nameAr)).join(" · ")}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="flex flex-wrap items-center justify-between gap-6 rounded-3xl bg-accent p-7 text-white sm:p-12">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t("Selling online? Ship your next order with Masar.")}</h2>
              <p className="mt-2 text-white/85">{t("Open an account in two minutes. Create orders, print labels and follow your cash on delivery balance in one place.")}</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/signup" variant="dark">{t("Create a merchant account")}</LinkButton>
              <LinkButton href="/login" variant="ghost">{t("Sign in")}</LinkButton>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
