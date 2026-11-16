import { Warehouse } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, Table, Td } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listHubs, listWilayas } from "@/server/services/directory";

const ZONE = { 1: ["North", "info"], 2: ["Highlands", "progress"], 3: ["South", "warn"] } as const;

export default async function Network() {
  await requireRole("admin");
  const db = await getDb();
  const [hubs, wilayas] = await Promise.all([listHubs(db), listWilayas(db)]);
  return (
    <>
      <PageHeader title={t("Network")} subtitle={t("Hubs and the wilayas each one serves. The zone of a wilaya sets its price tier.")} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hubs.map((h) => (
          <Card key={h.id} className="p-5">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-navy text-white"><Warehouse size={18} /></span>
              <div>
                <h2 className="font-semibold">{t(h.name)}</h2>
                <p className="font-mono text-xs text-muted">{h.code}</p>
              </div>
            </div>
            <p className="mt-3 text-[13px] text-muted">{h.address}</p>
            <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4 text-sm">
              <div><dt className="text-muted">{t("Wilayas")}</dt><dd className="tnum text-lg font-semibold">{h.wilayas}</dd></div>
              <div><dt className="text-muted">{t("Parcels on floor")}</dt><dd className="tnum text-lg font-semibold">{h.onFloor}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
      <Card className="mt-5">
        <CardHeader title={t("Wilayas")} hint={t("{n} wilayas, {c} communes in the directory", { n: wilayas.length, c: wilayas.reduce((a, w) => a + w.communes, 0) })} />
        <Table head={["Code", "Wilaya", "", "Communes", "Zone", "Served by"]}>
          {wilayas.map((w) => (
            <tr key={w.id}>
              <Td className="font-mono text-[13px]">{String(w.id).padStart(2, "0")}</Td>
              <Td className="whitespace-nowrap font-medium">{w.name}</Td>
              <Td className="whitespace-nowrap text-ink-2" dir="rtl" lang="ar">{w.nameAr}</Td>
              <Td className="tnum">{w.communes}</Td>
              <Td><Badge tone={ZONE[w.zone as 1 | 2 | 3][1]}>{t(ZONE[w.zone as 1 | 2 | 3][0])}</Badge></Td>
              <Td className="whitespace-nowrap">{t(w.hub)}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
