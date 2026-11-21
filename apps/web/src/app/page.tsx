import { ArrowUpRight, Boxes, ScanLine, Smartphone, Store } from "lucide-react";
import Link from "next/link";
import { RateCalculator } from "@/components/rate-calculator";
import { SiteFooter, SiteNav, TrackForm } from "@/components/site";
import { CashFlow } from "@/components/site/cash-flow";
import { CoverageSearch } from "@/components/site/coverage-search";
import { ImportDemo, LabelDemo, SmsDemo } from "@/components/site/demos";
import { Faq } from "@/components/site/faq";
import { HeroMap, MapLegend } from "@/components/site/hero-map";
import { Journey } from "@/components/site/journey";
import { LinkButton } from "@/components/ui";
import { initLocale, t } from "@/lib/i18n";
import { getDb } from "@/server/db";
import { INCLUDED_KG } from "@/server/domain/pricing";
import { MAX_ATTEMPTS } from "@/server/domain/state";
import { listHubs, listWilayas } from "@/server/services/directory";
import { mapData } from "@/server/services/map";
import { getTiers } from "@/server/services/parcels";

export const dynamic = "force-dynamic";

const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

export default async function Home() {
  await initLocale();
  const db = await getDb();
  const [wilayas, hubs, tiers, map] = await Promise.all([listWilayas(db), listHubs(db), getTiers(db), mapData(db)]);
  const tier = Object.fromEntries(tiers.map((x) => [x.key, x]));
  const minReturn = Math.min(...tiers.map((x) => x.returnFee));

  const apps = [
    { icon: Store, name: t("Merchant dashboard"), who: t("For you and your team, in the browser."), does: [t("Create orders one by one or import a spreadsheet"), t("Print labels, ten to a sheet or one per sticker"), t("Follow every parcel and your cash balance")] },
    { icon: Smartphone, name: t("Courier app"), who: t("For couriers, on the phone."), does: [t("Today's stops in driving order"), t("Call the recipient, record delivery or a failed attempt"), t("Cash held and what to hand in")] },
    { icon: ScanLine, name: t("Hub station"), who: t("For sorting teams at each hub."), does: [t("Scan parcels in and out"), t("Fill and seal bags for other hubs"), t("Send and receive linehaul manifests")] },
    { icon: Boxes, name: t("Operations"), who: t("For the people running the network."), does: [t("Assign couriers and plan routes"), t("Rates, merchants, couriers and hubs"), t("Finance, text messages and the audit log")] },
  ];

  const faq: [string, string][] = [
    [t("What happens if nobody is home?"), t("The courier marks a failed attempt and tries again on another day. After {n} failed attempts the parcel comes back to you.", { n: MAX_ATTEMPTS })],
    [t("What does a return cost?"), t("Only the return fee for the zone, from {x} DZD. No delivery fee is charged on a parcel that comes back.", { x: fmt(minReturn) })],
    [t("How is the price worked out?"), t("By zone: same wilaya, north, highlands or south, whichever of the two wilayas is further out. The first {kg} kg are included; each extra kilo is added at the zone's rate.", { kg: INCLUDED_KG })],
    [t("Which files can I import?"), t("CSV or Excel files, with column titles in French, Arabic or English. Every row is checked before anything is created, and commune spelling mistakes are corrected when the match is clear.")],
    [t("Where do you deliver?"), t("All {w} wilayas and {c} communes, through {h} hubs.", { w: wilayas.length, c: fmt(map.communes), h: hubs.length })],
    [t("Which language are the texts in?"), t("French or Arabic, chosen on each order. French when the order does not say.")],
    [t("When do I get paid?"), t("Your balance is credited when the parcel is marked delivered. Payouts from your balance are recorded in your wallet with the date and amount.")],
    [t("Can I connect my online shop?"), t("Yes. The API creates orders one at a time or up to 1,000 in one call, and returns tracking numbers and fees.")],
  ];

  return (
    <div className="site">
      <header className="relative overflow-hidden bg-navy text-white">
        <SiteNav dark />
        <div className="mx-auto grid max-w-7xl gap-6 px-4 pb-10 pt-6 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:gap-4 lg:px-8 lg:pb-16">
          <div className="relative z-10 lg:py-16">
            <h1 className="display text-[44px] sm:text-7xl lg:text-[80px]">{t("Every parcel on the right path.")}</h1>
            <p className="lede mt-6 max-w-lg text-lg leading-relaxed text-white/70">
              {t("Masar picks up from your door, moves parcels through {h} hubs and delivers to all {w} wilayas, with cash on delivery you can follow to the dinar.", { h: hubs.length, w: wilayas.length })}
            </p>
            <div className="mt-8"><TrackForm large /></div>
            <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
              <Link href="/signup" className="font-medium text-white underline decoration-accent decoration-2 underline-offset-[6px] hover:decoration-white">{t("Create a merchant account")}</Link>
              <Link href="#rates" className="text-white/70 hover:text-white">{t("See the rates")}</Link>
            </div>
          </div>
          <div className="relative -mx-4 h-[380px] sm:mx-0 sm:h-[540px] lg:h-[680px]">
            <HeroMap data={map} />
          </div>
        </div>
        <div className="mx-auto max-w-7xl px-4 pb-8 sm:px-6 lg:px-8"><MapLegend communes={map.communes} /></div>
      </header>

      <main>
        <section id="how" className="mx-auto max-w-7xl scroll-mt-4 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="max-w-2xl">
            <h2 className="display text-4xl sm:text-5xl">{t("How a parcel moves")}</h2>
            <p className="lede mt-4 text-lg text-ink-2">{t("Six steps from your shelf to your customer's hands, each one recorded, so you and they always know where it is.")}</p>
          </div>
          <div className="mt-12"><Journey /></div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
          <h2 className="display max-w-2xl text-4xl sm:text-5xl">{t("Less typing, fewer calls, no surprises")}</h2>
          <div className="mt-12 grid gap-4 lg:grid-cols-12">
            <article className="rounded-[28px] bg-white p-6 ring-1 ring-line sm:p-8 lg:col-span-7">
              <h3 className="display text-2xl">{t("Hundreds of orders from one spreadsheet")}</h3>
              <p className="mt-2 max-w-md text-ink-2">{t("Drop in the file you already keep. Each row is checked, wilayas and communes are matched, and you fix only what needs fixing.")}</p>
              <div className="mt-6"><ImportDemo /></div>
            </article>
            <article className="rounded-[28px] bg-accent-soft p-6 sm:p-8 lg:col-span-5">
              <h3 className="display text-2xl">{t("Texts your customers can read")}</h3>
              <p className="mt-2 text-ink-2">{t("Recipients get a text when the parcel is on its way, if a delivery fails, and when it arrives. These are the real messages.")}</p>
              <div className="mt-6"><SmsDemo /></div>
            </article>
            <article className="flex flex-col rounded-[28px] bg-white p-6 ring-1 ring-line sm:p-8 lg:col-span-4">
              <h3 className="display text-2xl">{t("Labels in a click")}</h3>
              <p className="mt-2 text-ink-2">{t("Print on A4 sheets or a label printer. The route code tells the hub where it goes.")}</p>
              <div className="mt-8 flex flex-1 items-center py-2"><LabelDemo /></div>
            </article>
            <article className="rounded-[28px] bg-white p-6 ring-1 ring-line sm:p-8 lg:col-span-4">
              <h3 className="display text-2xl">{t("Tracking anyone can open")}</h3>
              <p className="mt-2 text-ink-2">{t("A link in every text shows each scan, with no account and no personal details on the page.")}</p>
              <ol className="mt-6 space-y-0">
                {[t("Picked up"), t("At hub"), t("In transit"), t("Out for delivery")].map((s, k, all) => (
                  <li key={s} className="relative flex gap-3 pb-4 last:pb-0">
                    {k < all.length - 1 && <span className="absolute start-[5px] top-3 h-full w-px bg-line" aria-hidden />}
                    <span className={`relative mt-1.5 size-[11px] shrink-0 rounded-full ${k === all.length - 1 ? "bg-accent ring-4 ring-accent/20" : "bg-ink"}`} aria-hidden />
                    <span className={k === all.length - 1 ? "font-medium" : "text-ink-2"}>{s}</span>
                  </li>
                ))}
              </ol>
            </article>
            <article className="rounded-[28px] bg-navy p-6 text-white sm:p-8 lg:col-span-4">
              <h3 className="display text-2xl">{t("In your team's language")}</h3>
              <p className="mt-2 text-white/65">{t("Every screen works in Arabic, French and English, right to left where it should be.")}</p>
              <p className="mt-8 space-y-1">
                <span className="display block text-4xl" lang="ar" dir="rtl">مسار</span>
                <span className="display block text-4xl text-white/70" lang="fr">Masar</span>
                <span className="display block text-4xl text-white/40" lang="en">Masar</span>
              </p>
            </article>
          </div>
        </section>

        <section className="bg-navy text-white">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
            <div className="max-w-2xl">
              <h2 className="display text-4xl sm:text-5xl">{t("Follow your cash to the dinar")}</h2>
              <p className="lede mt-4 text-lg text-white/65">{t("Every dinar collected is recorded from the recipient's hand to your wallet. Each move is a balanced ledger entry, so the totals always agree.")}</p>
            </div>
            <div className="mt-12"><CashFlow /></div>
          </div>
        </section>

        <section id="rates" className="mx-auto max-w-7xl scroll-mt-4 px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
            <div className="max-w-2xl">
              <h2 className="display text-4xl sm:text-5xl">{t("Know the price before you ship")}</h2>
              <p className="lede mt-4 text-lg text-ink-2">{t("One flat rate per zone, taken from the cash collected. Nothing to pay up front.")}</p>
            </div>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-3 sm:grid-cols-4">
              {(
                [
                  ["local", t("Same wilaya"), "bg-ink"],
                  ["north", t("North"), "bg-zone-north"],
                  ["highlands", t("Highlands"), "bg-zone-high"],
                  ["south", t("South"), "bg-zone-south"],
                ] as const
              ).map(([k, label, dot]) => (
                <div key={k}>
                  <dt className="flex items-center gap-1.5 text-[13px] text-muted"><span className={`size-2 rounded-full ${dot}`} aria-hidden />{label}</dt>
                  <dd className="tnum display mt-1 text-2xl">{fmt(tier[k].base)} <span className="text-sm text-muted">{t("DZD")}</span></dd>
                </div>
              ))}
            </dl>
          </div>
          <div className="mt-10"><RateCalculator wilayas={wilayas} tiers={tiers} /></div>
          <div className="mt-14 grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            <div>
              <h3 className="display text-2xl">{t("Is my customer covered?")}</h3>
              <p className="mt-2 text-ink-2">{t("Yes, wherever they are. Search their commune to see the hub that serves it and the price from your wilaya.")}</p>
              <Link href="/coverage" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-accent-deep hover:underline">
                {t("All wilayas and hubs")} <ArrowUpRight size={15} aria-hidden className="rtl:-scale-x-100" />
              </Link>
            </div>
            <CoverageSearch wilayas={wilayas} tiers={tiers} compact />
          </div>
        </section>

        <section className="border-t border-line bg-white">
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
            <h2 className="display max-w-2xl text-4xl sm:text-5xl">{t("Four apps, one parcel history")}</h2>
            <p className="lede mt-4 max-w-2xl text-lg text-ink-2">{t("Everyone who touches a parcel works from the same record, so what you see is what the courier and the hub see.")}</p>
            <ul className="mt-12 divide-y divide-line border-y border-line">
              {apps.map((a) => (
                <li key={a.name} className="grid gap-4 py-7 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-10">
                  <div className="flex items-start gap-4">
                    <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-chalk text-ink"><a.icon size={20} aria-hidden /></span>
                    <div>
                      <h3 className="display text-xl">{a.name}</h3>
                      <p className="mt-1 text-[15px] text-muted">{a.who}</p>
                    </div>
                  </div>
                  <ul className="grid gap-x-8 gap-y-2 text-[15px] text-ink-2 sm:grid-cols-3">
                    {a.does.map((d) => (
                      <li key={d} className="border-s-2 border-accent/30 ps-3">{d}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center">
            <div>
              <h2 className="display text-4xl sm:text-5xl">{t("Ship straight from your shop")}</h2>
              <p className="lede mt-4 text-lg text-ink-2">{t("Send orders from your website or your stock system. Check a batch first, then create it in one call; if one order has a problem, none are created.")}</p>
              <LinkButton href="/developers" variant="dark" className="mt-8 h-11 px-5">{t("Read the API guide")}</LinkButton>
            </div>
            <pre className="ltr overflow-x-auto rounded-[24px] bg-navy p-6 font-mono text-[13px] leading-relaxed text-white/85" dir="ltr">
              <code>
                <span className="text-white/40"># {t("Create orders in one call")}</span>{"\n"}
                <span className="text-accent">POST</span> /api/v1/parcels/bulk{"\n\n"}
                {`{
  "orders": [{
    "name": "Amina Belkacem",
    "phone": "0550 12 34 56",
    "wilaya": 16,
    "commune": "Bab Ezzouar",
    "address": "Cité 5 juillet, bt 12",
    "cod": 4500,
    "lang": "ar"
  }]
}`}
                {"\n\n"}
                <span className="text-white/40">→ 201</span>{" "}
                <span className="text-zone-high">{`{ "created": [{ "tracking": "MSR004512907", "deliveryFee": 400 }] }`}</span>
              </code>
            </pre>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-20 sm:px-6 sm:pb-28 lg:px-8">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
            <h2 className="display text-4xl sm:text-5xl">{t("Questions sellers ask")}</h2>
            <Faq items={faq} />
          </div>
        </section>

        <section className="px-4 pb-20 sm:px-6 lg:px-8">
          <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[32px] bg-accent px-6 py-14 text-white sm:px-14 sm:py-20">
            <svg className="absolute -bottom-10 end-0 h-[260px] w-[520px] opacity-30 rtl:-scale-x-100" viewBox="0 0 520 260" fill="none" aria-hidden>
              <path d="M10 250C120 230 160 140 260 130S400 60 510 10" stroke="#fff" strokeWidth="2.5" strokeDasharray="2 11" strokeLinecap="round" />
            </svg>
            <div className="relative max-w-2xl">
              <h2 className="display text-4xl sm:text-6xl">{t("Ship your next order with Masar.")}</h2>
              <p className="mt-4 text-lg text-white/85">{t("Open an account in two minutes. Create orders, print labels and follow your cash on delivery balance in one place.")}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <LinkButton href="/signup" variant="dark" className="h-12 px-6 text-base">{t("Create a merchant account")}</LinkButton>
                <LinkButton href="/track" variant="ghost" className="h-12 px-6 text-base">{t("Track a parcel")}</LinkButton>
              </div>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
