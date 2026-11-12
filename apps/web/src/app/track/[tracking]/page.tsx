import { MapPin, PackageSearch } from "lucide-react";
import { SiteFooter, SiteNav, TrackForm } from "@/components/site";
import { ProgressRail, Timeline } from "@/components/tracking";
import { Card, Mono, StatusBadge } from "@/components/ui";
import { ago } from "@/lib/format";
import { getDb } from "@/server/db";
import { getParcel } from "@/server/services/parcels";

export const metadata = { title: "Tracking" };

export default async function Track({ params }: { params: Promise<{ tracking: string }> }) {
  const tracking = decodeURIComponent((await params).tracking);
  const p = await getParcel(await getDb(), { tracking });
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <div className="mb-8"><TrackForm defaultValue={tracking} /></div>
        {!p ? (
          <Card className="p-10 text-center">
            <PackageSearch className="mx-auto text-muted" size={36} />
            <h1 className="mt-4 text-xl font-semibold">We can&apos;t find {tracking}</h1>
            <p className="mt-2 text-ink-2">Check the number on your label. Masar tracking numbers start with MSR followed by nine digits.</p>
          </Card>
        ) : (
          <div className="space-y-5">
            <Card className="p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm text-muted">Tracking number</p>
                  <h1 className="mt-1 font-mono text-2xl font-semibold tracking-tight">{p.tracking}</h1>
                </div>
                <StatusBadge status={p.status} />
              </div>
              <div className="mt-8"><ProgressRail status={p.status} /></div>
              <div className="mt-8 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-3">
                <div>
                  <p className="text-muted">Destination</p>
                  <p className="mt-1 flex items-center gap-1.5 font-medium"><MapPin size={15} className="text-accent" />{p.commune}, {p.destWilaya}</p>
                </div>
                <div>
                  <p className="text-muted">Sent by</p>
                  <p className="mt-1 font-medium">{p.merchantName}</p>
                </div>
                <div>
                  <p className="text-muted">Last update</p>
                  <p className="mt-1 font-medium">{ago(p.updatedAt)}</p>
                </div>
              </div>
              {p.status === "out_for_delivery" && p.codAmount > 0 && (
                <p className="mt-5 rounded-xl bg-accent-soft px-4 py-3 text-sm text-accent-deep">
                  Please have <strong className="tnum">{new Intl.NumberFormat("en-US").format(p.codAmount)} DZD</strong> ready for the courier.
                </p>
              )}
            </Card>
            <Card className="p-6">
              <h2 className="mb-5 text-[15px] font-semibold">History</h2>
              {/* Recipients see where the parcel was, not who handled it or internal notes. */}
              <Timeline events={p.events.map((e) => ({ ...e, note: "", actor: null }))} />
            </Card>
            <p className="text-center text-xs text-muted">Reference <Mono>{p.tracking}</Mono></p>
          </div>
        )}
      </main>
      <SiteFooter />
    </>
  );
}
