import { ArrowLeft, Truck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { bagAction, manifestAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { BagStatus, ManifestStatus, RouteLabel } from "@/components/linehaul-bits";
import { PrintButton } from "@/components/print-button";
import { Card, CardHeader, Money, Mono, Table, Td } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { getManifest, listBags } from "@/server/services/linehaul";

export default async function Manifest({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("admin", "hub");
  const db = await getDb();
  const m = await getManifest(db, (await params).id);
  if (!m) notFound();
  const atOrigin = s.role === "admin" || s.hubId === m.originHubId;
  const atDest = s.role === "admin" || s.hubId === m.destHubId;
  const open = m.status === "open" && atOrigin;
  const [loaded, ready] = await Promise.all([
    listBags(db, { manifestId: m.id }),
    open ? listBags(db, { unassigned: { originHubId: m.originHubId, destHubId: m.destHubId } }) : [],
  ]);
  const facts: [string, React.ReactNode][] = [
    ["Vehicle plate", <span key="v" className="ltr">{m.vehicle || "—"}</span>],
    ["Driver", m.driver || "—"],
    ["Bags", m.bags],
    ["Parcels", m.parcels],
    ["Departed", m.departedAt ? dateTime(m.departedAt) : "—"],
    ["Arrived", m.arrivedAt ? dateTime(m.arrivedAt) : "—"],
  ];
  return (
    <>
      <Link href="/admin/linehaul" className="no-print mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} className="rtl:-scale-x-100" /> {t("Linehaul")}</Link>
      <Card className="p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted">{t("Manifest")}</p>
            <h1 className="mt-1 inline-block font-mono text-2xl font-semibold tracking-tight">{m.code}</h1>
            <p className="mt-2 text-sm font-medium"><RouteLabel origin={m.origin} dest={m.dest} /></p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ManifestStatus status={m.status} />
            <PrintButton />
            {open && loaded.length > 0 && (
              <ActionForm action={manifestAction}>
                <input type="hidden" name="op" value="depart" />
                <input type="hidden" name="manifestId" value={m.id} />
                <Submit><Truck size={15} /> {t("Truck has left")}</Submit>
              </ActionForm>
            )}
          </div>
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-5 text-sm sm:grid-cols-3 lg:grid-cols-6">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted">{t(k)}</dt>
              <dd className="mt-0.5 font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {open && (
        <Card className="no-print mt-5">
          <ActionForm action={manifestAction}>
            <input type="hidden" name="op" value="add" />
            <input type="hidden" name="manifestId" value={m.id} />
            <CardHeader title={`${t("Sealed bags ready for this route")} (${ready.length})`} action={ready.length > 0 ? <Submit variant="dark">{t("Load selected")}</Submit> : undefined} />
            <Table head={["", "Bag", "Parcels", "COD"]} empty={ready.length === 0}>
              {ready.map((b) => (
                <tr key={b.id}>
                  <Td className="w-8 pe-0"><input type="checkbox" name="ids" value={b.id} defaultChecked aria-label={t("Select {x}", { x: b.code })} className="size-4 accent-[#ff5b24]" /></Td>
                  <Td><Link href={`/admin/linehaul/bags/${b.id}`} className="hover:underline"><Mono>{b.code}</Mono></Link></Td>
                  <Td className="tnum">{b.parcels}</Td>
                  <Td><Money value={b.cod} /></Td>
                </tr>
              ))}
            </Table>
          </ActionForm>
        </Card>
      )}

      <Card className="mt-5">
        <CardHeader title={`${t("On this manifest")} (${loaded.length})`} />
        <Table head={["Bag", "Parcels", "COD", "Status", ""]} empty={loaded.length === 0}>
          {loaded.map((b) => (
            <tr key={b.id}>
              <Td><Link href={`/admin/linehaul/bags/${b.id}`} className="hover:underline"><Mono>{b.code}</Mono></Link></Td>
              <Td className="tnum">{b.parcels}</Td>
              <Td><Money value={b.cod} /></Td>
              <Td><BagStatus status={b.status} /></Td>
              <Td className="no-print">
                {open && (
                  <ActionForm action={manifestAction}>
                    <input type="hidden" name="op" value="remove" />
                    <input type="hidden" name="manifestId" value={m.id} />
                    <input type="hidden" name="bagId" value={b.id} />
                    <Submit size="sm" variant="ghost">{t("Unload")}</Submit>
                  </ActionForm>
                )}
                {b.status === "in_transit" && atDest && (
                  <ActionForm action={bagAction}>
                    <input type="hidden" name="op" value="receive" />
                    <input type="hidden" name="bagId" value={b.id} />
                    <Submit size="sm">{t("Receive")}</Submit>
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
