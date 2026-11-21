import { asc, eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { createZoneAction, deleteZoneAction, suggestZonesAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Card, CardHeader, Field, Input, PageHeader } from "@/components/ui";
import { place, t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { communes, wilayas } from "@/server/schema";
import { listHubs } from "@/server/services/directory";
import { listZones } from "@/server/services/sorting";

/**
 * Sorting lanes of a hub. Scanning a parcel in shows its lane in large letters, so the person at
 * the scanner knows where to put it without reading the label.
 */
export default async function Sorting({ searchParams }: { searchParams: Promise<{ hub?: string }> }) {
  const s = await requireRole("admin", "hub");
  const db = await getDb();
  const hubs = await listHubs(db);
  const hubId = s.role === "hub" ? s.hubId! : ((await searchParams).hub ?? hubs[0]?.id);
  const hub = hubs.find((h) => h.id === hubId);
  const [zones, served] = await Promise.all([listZones(db, hubId), db.select().from(wilayas).where(eq(wilayas.hubId, hubId)).orderBy(asc(wilayas.id))]);
  const local = served.length ? await db.select().from(communes).where(inArray(communes.wilayaId, served.map((w) => w.id))).orderBy(asc(communes.name)) : [];
  const used = new Set(zones.flatMap((z) => z.communeIds));
  const usedHubs = new Set(zones.flatMap((z) => z.destHubIds));
  const free = local.filter((c) => !used.has(c.id));
  const name = (id: number) => {
    const c = local.find((x) => x.id === id);
    return c ? place(c.name, c.nameAr) : String(id);
  };
  const chip = (on: boolean) => `whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset ${on ? "bg-navy text-white ring-navy" : "bg-surface text-ink-2 ring-line hover:bg-paper"}`;

  return (
    <>
      <PageHeader title={t("Sorting lanes")} subtitle={t("Each lane gathers parcels for one hub, a group of communes, or the stop desk. The hub scan shows the lane of every parcel scanned in.")} />
      {s.role === "admin" && (
        <nav className="-mx-1 mb-5 flex gap-2 overflow-x-auto px-1 pb-1" aria-label={t("Hub")}>
          {hubs.map((h) => <Link key={h.id} href={`/admin/sorting?hub=${h.id}`} className={chip(h.id === hubId)}>{t(h.name)}</Link>)}
        </nav>
      )}

      {zones.length === 0 ? (
        <Card className="p-6">
          <h2 className="font-semibold">{t("No lanes at {hub} yet", { hub: hub ? t(hub.name) : "" })}</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">{t("Start with a suggestion: one lane per other hub, one for the stop desk, and the hub's communes in up to six lanes by direction. Then change what your floor needs.")}</p>
          <ActionForm action={suggestZonesAction} className="mt-4">
            <input type="hidden" name="hubId" value={hubId} />
            <Submit>{t("Suggest lanes")}</Submit>
          </ActionForm>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {zones.map((z) => (
            <Card key={z.id} className="flex flex-col p-5">
              <div className="flex items-start gap-3">
                <span className="grid h-12 min-w-12 place-items-center rounded-xl bg-navy px-2 font-mono text-xl font-bold text-white">{z.code}</span>
                <div className="min-w-0">
                  <h2 className="truncate font-semibold">{t(z.name)}</h2>
                  <p className="text-xs text-muted">
                    {z.desk ? t("Stop desk parcels") : z.destHubIds.length ? t("Leaving for: {x}", { x: z.destHubIds.map((id) => t(hubs.find((h) => h.id === id)?.name ?? id)).join(", ") }) : t("{n} communes", { n: z.communeIds.length })}
                  </p>
                </div>
              </div>
              {z.communeIds.length > 0 && <p className="mt-3 line-clamp-3 text-[13px] text-ink-2">{z.communeIds.map(name).join(" · ")}</p>}
              <ActionForm action={deleteZoneAction} className="mt-auto pt-3">
                <input type="hidden" name="hubId" value={hubId} />
                <input type="hidden" name="id" value={z.id} />
                <Submit size="sm" variant="ghost">{t("Remove lane")}</Submit>
              </ActionForm>
            </Card>
          ))}
        </div>
      )}

      {zones.length > 0 && free.length > 0 && (
        <p className="mt-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-ink-2">{t("{n} communes served by this hub are in no lane. Parcels for them show no lane when scanned.", { n: free.length })}</p>
      )}

      <Card className="mt-5">
        <CardHeader title={t("Add a lane")} />
        <ActionForm action={createZoneAction} className="grid gap-4 p-5 lg:grid-cols-[160px_minmax(0,1fr)]">
          <input type="hidden" name="hubId" value={hubId} />
          <Field label={t("Code")}><Input name="code" required maxLength={6} placeholder="A1" dir="ltr" className="font-mono uppercase" /></Field>
          <Field label={t("Name")}><Input name="name" maxLength={60} placeholder={t("e.g. East: Bab Ezzouar, Dar El Beida")} /></Field>
          <fieldset className="lg:col-span-2">
            <legend className="mb-1.5 text-[13px] font-medium text-ink-2">{t("Communes for local delivery")}</legend>
            {free.length === 0 ? (
              <p className="text-sm text-muted">{t("Every commune of this hub is already in a lane.")}</p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-xl p-3 ring-1 ring-inset ring-line">
                <div className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2 lg:grid-cols-4">
                  {free.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-sm">
                      <input type="checkbox" name="communeIds" value={c.id} className="size-4 accent-[#ff5b24]" /> {place(c.name, c.nameAr)}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </fieldset>
          <fieldset className="lg:col-span-2">
            <legend className="mb-1.5 text-[13px] font-medium text-ink-2">{t("Or parcels leaving for")}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-2">
              {hubs.filter((h) => h.id !== hubId && !usedHubs.has(h.id)).map((h) => (
                <label key={h.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="destHubIds" value={h.id} className="size-4 accent-[#ff5b24]" /> {t(h.name)}
                </label>
              ))}
              {!zones.some((z) => z.desk) && (
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="desk" className="size-4 accent-[#ff5b24]" /> {t("Stop desk parcels")}
                </label>
              )}
            </div>
          </fieldset>
          <div className="lg:col-span-2"><Submit>{t("Add lane")}</Submit></div>
        </ActionForm>
      </Card>
    </>
  );
}
