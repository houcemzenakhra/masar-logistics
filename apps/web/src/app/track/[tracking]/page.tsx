import { MapPin, PackageSearch } from "lucide-react";
import { SiteFooter, SiteNav, TrackForm } from "@/components/site";
import { ProgressRail, Timeline } from "@/components/tracking";
import { Card, StatusBadge } from "@/components/ui";
import { ago, money } from "@/lib/format";
import { initLocale, place, t } from "@/lib/i18n";
import { getDb } from "@/server/db";
import { getParcel } from "@/server/services/parcels";

export const metadata = { title: "Tracking" };

export default async function Track({ params }: { params: Promise<{ tracking: string }> }) {
  await initLocale();
  const tracking = decodeURIComponent((await params).tracking);
  const p = await getParcel(await getDb(), { tracking });
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-10">
        <div className="mb-6 sm:mb-8"><TrackForm defaultValue={tracking} /></div>
        {!p ? (
          <Card className="p-8 text-center sm:p-10">
            <PackageSearch className="mx-auto text-muted" size={36} />
            <h1 className="mt-4 text-xl font-semibold">{t("We can't find {x}", { x: tracking })}</h1>
            <p className="mt-2 text-ink-2">{t("Check the number on your label. Masar tracking numbers start with MSR followed by nine digits.")}</p>
          </Card>
        ) : (
          <div className="space-y-5">
            <Card className="p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">{t("Tracking number")}</p>
                  <h1 className="mt-1 inline-block font-mono text-2xl font-semibold tracking-tight">{p.tracking}</h1>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-8"><ProgressRail status={p.status} /></div>
              <div className="mt-8 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted">{t("Destination")}</p>
                  <p className="mt-1 flex items-center gap-1.5 font-medium"><MapPin size={15} className="shrink-0 text-accent" />{place(p.commune, p.communeAr)}, {place(p.destWilaya, p.destWilayaAr)}</p>
                </div>
                <div>
                  <p className="text-muted">{t("Sent by")}</p>
                  <p className="mt-1 font-medium">{p.merchantName}</p>
                </div>
                <div>
                  <p className="text-muted">{t("Last update")}</p>
                  <p className="mt-1 font-medium">{ago(p.updatedAt)}</p>
                </div>
              </div>
              {p.status === "out_for_delivery" && p.codAmount > 0 && (
                <p className="mt-5 rounded-xl bg-accent-soft px-4 py-3 text-sm font-medium text-accent-deep">
                  {t("Please have {x} DZD ready for the courier.", { x: money(p.codAmount) })}
                </p>
              )}
            </Card>
            <Card className="p-5 sm:p-6">
              <h2 className="mb-5 text-[15px] font-semibold">{t("History")}</h2>
              {/* Recipients see where the parcel was, not who handled it or internal notes. */}
              <Timeline events={p.events.map((e) => ({ ...e, note: "", actor: null }))} />
            </Card>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
