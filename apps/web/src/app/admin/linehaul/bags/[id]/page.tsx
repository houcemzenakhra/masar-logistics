import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { bagAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { BagStatus, RouteLabel } from "@/components/linehaul-bits";
import { ParcelTable } from "@/components/parcel-table";
import { Card, CardHeader, Input, Money, Mono, Stat, StatusBadge, Table, Td } from "@/components/ui";
import { money } from "@/lib/format";
import { place, t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { getBag } from "@/server/services/linehaul";
import { listParcels } from "@/server/services/parcels";

export default async function Bag({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("admin", "hub");
  const db = await getDb();
  const bag = await getBag(db, (await params).id);
  if (!bag) notFound();
  const open = bag.status === "open" && (s.role === "admin" || s.hubId === bag.originHubId);
  const [inside, eligible] = await Promise.all([
    listParcels(db, { bagId: bag.id }),
    open ? listParcels(db, { baggable: { originHubId: bag.originHubId, destHubId: bag.destHubId } }) : [],
  ]);
  return (
    <>
      <Link href="/admin/linehaul" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} className="rtl:-scale-x-100" /> {t("Linehaul")}</Link>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{t("Bag")}</p>
            <h1 className="mt-1 inline-block font-mono text-2xl font-semibold tracking-tight">{bag.code}</h1>
            <p className="mt-2 text-sm font-medium"><RouteLabel origin={bag.origin} dest={bag.dest} /></p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <BagStatus status={bag.status} />
            {open && inside.length > 0 && (
              <ActionForm action={bagAction}>
                <input type="hidden" name="op" value="seal" />
                <input type="hidden" name="bagId" value={bag.id} />
                <Submit variant="dark"><Lock size={15} /> {t("Seal bag")}</Submit>
              </ActionForm>
            )}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:max-w-md">
          <Stat label={t("Parcels")} value={bag.parcels} />
          <Stat label={t("Cash to collect")} value={money(bag.cod)} unit={t("DZD")} />
        </div>
        {bag.status === "sealed" && !bag.manifestId && <p className="mt-4 text-sm text-ink-2">{t("Sealed. Add it to a manifest to send it.")}</p>}
      </Card>

      {open && (
        <Card className="mt-5">
          <CardHeader title={t("Add parcels")} hint={t("Scan a label, or tick parcels from the floor that are bound for this hub.")} />
          <ActionForm action={bagAction} className="flex flex-wrap gap-2 border-b border-line p-5">
            <input type="hidden" name="op" value="add" />
            <input type="hidden" name="bagId" value={bag.id} />
            <Input name="tracking" required placeholder="MSR…" aria-label={t("Tracking number")} autoComplete="off" dir="ltr" className="min-w-0 flex-1 font-mono sm:max-w-xs" />
            <Submit>{t("Add to bag")}</Submit>
          </ActionForm>
          <ActionForm action={bagAction}>
            <input type="hidden" name="op" value="add" />
            <input type="hidden" name="bagId" value={bag.id} />
            <ParcelTable rows={eligible} base="/admin/parcels" select />
            {eligible.length > 0 && <div className="border-t border-line p-4"><Submit variant="dark">{t("Add selected")}</Submit></div>}
          </ActionForm>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader title={`${t("In this bag")} (${inside.length})`} />
        <Table head={["Tracking", "Recipient", "Destination", "COD", "Status", ""]} empty={inside.length === 0}>
          {inside.map((p) => (
            <tr key={p.id}>
              <Td><Link href={`/admin/parcels/${p.id}`} className="hover:underline"><Mono>{p.tracking}</Mono></Link></Td>
              <Td className="whitespace-nowrap">{p.recipientName}</Td>
              <Td className="whitespace-nowrap">{place(p.commune, p.communeAr)}, {place(p.destWilaya, p.destWilayaAr)}</Td>
              <Td><Money value={p.codAmount} /></Td>
              <Td><StatusBadge status={p.status} /></Td>
              <Td>
                {open && (
                  <ActionForm action={bagAction}>
                    <input type="hidden" name="op" value="remove" />
                    <input type="hidden" name="bagId" value={bag.id} />
                    <input type="hidden" name="parcelId" value={p.id} />
                    <Submit size="sm" variant="ghost">{t("Take out")}</Submit>
                  </ActionForm>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
