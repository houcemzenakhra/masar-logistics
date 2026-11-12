import { handoverAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, Input, Money, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listCouriers } from "@/server/services/directory";
import { balancesByPrefix } from "@/server/services/ledger";

export default async function Couriers() {
  await requireRole("admin");
  const db = await getDb();
  const [couriers, cash] = await Promise.all([listCouriers(db), balancesByPrefix(db, "courier")]);
  return (
    <>
      <PageHeader title="Couriers" subtitle="Who is carrying what, and how much cash each courier still has to hand over." />
      <Card>
        <Table head={["Courier", "Hub", "Active parcels", "Cash held", "Record handover"]} empty={couriers.length === 0}>
          {couriers.map((c) => {
            const held = cash[c.id] ?? 0;
            return (
              <tr key={c.id}>
                <Td>
                  <p className="font-medium">{c.name}</p>
                  <p className="text-[13px] text-muted">{c.phone || c.email}</p>
                </Td>
                <Td>{c.hub ?? "—"}</Td>
                <Td><span className="tnum">{c.active}</span></Td>
                <Td>{held > 0 ? <Money value={held} className="font-semibold" /> : <Badge tone="success">Settled</Badge>}</Td>
                <Td>
                  {held > 0 && (
                    <ActionForm action={handoverAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="courierId" value={c.id} />
                      <Input name="amount" inputMode="numeric" defaultValue={held} aria-label={`Amount handed over by ${c.name}`} className="!h-8 !w-28 tnum" />
                      <Submit size="sm" variant="dark">Received</Submit>
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
