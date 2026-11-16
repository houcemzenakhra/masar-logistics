import Link from "next/link";
import { bagAction, manifestAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { BagStatus, ManifestStatus, RouteLabel } from "@/components/linehaul-bits";
import { Card, CardHeader, Field, Input, Mono, PageHeader, Select, Table, Td } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listHubs } from "@/server/services/directory";
import { listBags, listManifests } from "@/server/services/linehaul";

export default async function Linehaul() {
  const s = await requireRole("admin", "hub");
  const db = await getDb();
  const [bags, manifests, hubs] = await Promise.all([listBags(db), listManifests(db), listHubs(db)]);
  const mine = (hubId: string) => s.role === "admin" || s.hubId === hubId;
  const hubPickers = (
    <>
      {s.role === "admin" && (
        <Field label={t("From hub")}>
          <Select name="originHubId" required defaultValue="">
            <option value="" disabled>{t("Choose hub")}</option>
            {hubs.map((h) => <option key={h.id} value={h.id}>{t(h.name)}</option>)}
          </Select>
        </Field>
      )}
      <Field label={t("To hub")}>
        <Select name="destHubId" required defaultValue="">
          <option value="" disabled>{t("Choose hub")}</option>
          {hubs.filter((h) => h.id !== s.hubId).map((h) => <option key={h.id} value={h.id}>{t(h.name)}</option>)}
        </Select>
      </Field>
    </>
  );
  return (
    <>
      <PageHeader title={t("Linehaul")} subtitle={t("Pack parcels for the same hub into a bag, seal it, load bags on a manifest and send the truck. At the other end the bag is scanned once.")} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("New bag")} hint={t("One bag per destination hub")} />
          <ActionForm action={bagAction} className="grid gap-4 p-5 sm:grid-cols-2">
            <input type="hidden" name="op" value="create" />
            {hubPickers}
            <div className="sm:col-span-2"><Submit>{t("Open bag")}</Submit></div>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title={t("New manifest")} hint={t("One truck run between two hubs")} />
          <ActionForm action={manifestAction} className="grid gap-4 p-5 sm:grid-cols-2">
            <input type="hidden" name="op" value="create" />
            {hubPickers}
            <Field label={t("Vehicle plate")}><Input name="vehicle" dir="ltr" autoComplete="off" /></Field>
            <Field label={t("Driver")}><Input name="driver" autoComplete="off" /></Field>
            <div className="sm:col-span-2"><Submit variant="dark">{t("Create manifest")}</Submit></div>
          </ActionForm>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title={t("Manifests")} />
        <Table head={["Manifest", "Route", "Bags", "Parcels", "Vehicle", "Status", "Departed"]} empty={manifests.length === 0}>
          {manifests.map((m) => (
            <tr key={m.id} className="hover:bg-paper/60">
              <Td><Link href={`/admin/linehaul/manifests/${m.id}`} className="hover:text-accent-deep hover:underline"><Mono>{m.code}</Mono></Link></Td>
              <Td><RouteLabel origin={m.origin} dest={m.dest} /></Td>
              <Td className="tnum">{m.bags}</Td>
              <Td className="tnum">{m.parcels}</Td>
              <Td className="whitespace-nowrap"><span className="ltr">{m.vehicle || "—"}</span></Td>
              <Td><ManifestStatus status={m.status} /></Td>
              <Td className="whitespace-nowrap text-[13px] text-muted">{m.departedAt ? dateTime(m.departedAt) : "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card className="mt-5">
        <CardHeader title={t("Bags")} />
        <Table head={["Bag", "Route", "Parcels", "Manifest", "Status", ""]} empty={bags.length === 0}>
          {bags.map((b) => (
            <tr key={b.id} className="hover:bg-paper/60">
              <Td><Link href={`/admin/linehaul/bags/${b.id}`} className="hover:text-accent-deep hover:underline"><Mono>{b.code}</Mono></Link></Td>
              <Td><RouteLabel origin={b.origin} dest={b.dest} /></Td>
              <Td className="tnum">{b.parcels}</Td>
              <Td>{b.manifestId ? <Link href={`/admin/linehaul/manifests/${b.manifestId}`} className="hover:underline"><Mono>{b.manifestCode}</Mono></Link> : <span className="text-muted">—</span>}</Td>
              <Td><BagStatus status={b.status} /></Td>
              <Td>
                {b.status === "in_transit" && mine(b.destHubId) && (
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
