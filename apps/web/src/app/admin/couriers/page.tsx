import { Route } from "lucide-react";
import { handoverAction, optimiseRouteAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, Input, Money, PageHeader, Table, Td } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { listCouriers } from "@/server/services/directory";
import { balancesByPrefix } from "@/server/services/ledger";

export default async function Couriers() {
  await requireStaff("dispatch");
  const db = await getDb();
  const [couriers, cash] = await Promise.all([listCouriers(db), balancesByPrefix(db, "courier")]);
  return (
    <>
      <PageHeader title={t("Couriers")} subtitle={t("Who is carrying what, and how much cash each courier still has to hand over.")} />
      <Card>
        <Table head={["Courier", "Hub", "Active parcels", "Route", "Cash held", "Record handover"]} empty={couriers.length === 0}>
          {couriers.map((c) => {
            const held = cash[c.id] ?? 0;
            return (
              <tr key={c.id} className={c.isActive ? "" : "opacity-60"}>
                <Td className="whitespace-nowrap">
                  <p className="font-medium">{c.name}</p>
                  <p className="ltr text-[13px] text-muted">{c.phone || c.email}</p>
                </Td>
                <Td className="whitespace-nowrap">{c.hub ? t(c.hub) : "—"}</Td>
                <Td><span className="tnum">{c.active}</span></Td>
                <Td>
                  {c.deliveries > 1 ? (
                    <ActionForm action={optimiseRouteAction}>
                      <input type="hidden" name="courierId" value={c.id} />
                      <Submit size="sm" variant="ghost"><Route size={14} /> {t("Re-plan")}</Submit>
                    </ActionForm>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </Td>
                <Td>{held > 0 ? <Money value={held} className="font-semibold" /> : <Badge tone="success">{t("Settled")}</Badge>}</Td>
                <Td>
                  {held > 0 && (
                    <ActionForm action={handoverAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="courierId" value={c.id} />
                      <Input name="amount" inputMode="numeric" defaultValue={held} aria-label={t("Amount")} dir="ltr" className="tnum !h-8 !w-28" />
                      <Submit size="sm" variant="dark">{t("Received")}</Submit>
                    </ActionForm>
                  )}
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
