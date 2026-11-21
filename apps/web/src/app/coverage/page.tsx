import { SiteFooter, SiteNav } from "@/components/site";
import { CoverageSearch } from "@/components/site/coverage-search";
import { HeroMap, MapLegend } from "@/components/site/hero-map";
import { initLocale, place, t } from "@/lib/i18n";
import { getDb } from "@/server/db";
import { listHubs, listWilayas } from "@/server/services/directory";
import { mapData } from "@/server/services/map";
import { getTiers } from "@/server/services/parcels";

export const dynamic = "force-dynamic";
export const metadata = { title: "Coverage" };

const ZONE_DOT = ["", "bg-zone-north", "bg-zone-high", "bg-zone-south"];

export default async function Coverage() {
  await initLocale();
  const db = await getDb();
  const [wilayas, hubs, tiers, map] = await Promise.all([listWilayas(db), listHubs(db), getTiers(db), mapData(db)]);
  const order = map.hubs.map((h) => h.code);
  const sorted = [...hubs].sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  return (
    <div className="site">
      <header className="bg-navy text-white">
        <SiteNav dark />
        <div className="mx-auto grid max-w-7xl gap-6 px-4 pb-10 pt-6 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:px-8">
          <div>
            <h1 className="display text-5xl sm:text-6xl">{t("Every commune in Algeria")}</h1>
            <p className="lede mt-5 max-w-lg text-lg text-white/70">
              {t("{w} wilayas and {c} communes, each served by its nearest of {h} hubs. Parcels between hubs travel in sealed bags on scheduled linehaul.", {
                w: wilayas.length,
                c: new Intl.NumberFormat("en-US").format(map.communes),
                h: hubs.length,
              })}
            </p>
          </div>
          <div className="relative -mx-4 h-[360px] sm:mx-0 sm:h-[520px]"><HeroMap data={map} /></div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8"><MapLegend communes={map.communes} /></div>
      </header>
      <main>
        <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 sm:py-20">
          <h2 className="display text-3xl sm:text-4xl">{t("Find a commune")}</h2>
          <p className="mt-2 text-ink-2">{t("Search in French or Arabic, with or without accents.")}</p>
          <div className="mt-8"><CoverageSearch wilayas={wilayas} tiers={tiers} /></div>
        </section>
        <section className="border-t border-line bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
            <h2 className="display text-3xl sm:text-4xl">{t("{h} hubs, every wilaya", { h: hubs.length })}</h2>
            <div className="mt-10 grid gap-x-10 gap-y-12 md:grid-cols-2 lg:grid-cols-3">
              {sorted.map((h) => {
                const list = wilayas.filter((w) => w.hubId === h.id);
                return (
                  <article key={h.id}>
                    <h3 className="display text-xl">{t(h.name)}</h3>
                    <p className="mt-1 text-[13px] text-muted">{t("Serves {n} wilayas", { n: h.wilayas })}</p>
                    <ul className="mt-4 space-y-1.5 text-[15px]">
                      {list.map((w) => (
                        <li key={w.id} className="flex items-center gap-2.5">
                          <span className="tnum w-6 text-[13px] text-muted">{String(w.id).padStart(2, "0")}</span>
                          <span className={`size-1.5 rounded-full ${ZONE_DOT[w.zone]}`} aria-hidden />
                          <span className="flex-1">{place(w.name, w.nameAr)}</span>
                          <span className="tnum text-[13px] text-muted">{t("{n} communes", { n: w.communes })}</span>
                        </li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
