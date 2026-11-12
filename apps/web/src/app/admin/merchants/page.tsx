import { payoutAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, Input, Money, PageHeader, Table, Td } from "@/components/ui";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listMerchants } from "@/server/services/directory";
import { acct, balance, balancesByPrefix } from "@/server/services/ledger";

export default async function Merchants() {
  await requireRole("admin");
  const db = await getDb();
  const [merchants, bal, cash] = await Promise.all([listMerchants(db), balancesByPrefix(db, "merchant"), balance(db, acct.companyCash)]);
  return (
    <>
      <PageHeader title="Merchants" subtitle={`Balances owed and payouts. ${new Intl.NumberFormat("en-US").format(cash)} DZD of collected cash is available to pay out.`} />
      <Card>
        <Table head={["Merchant", "Wilaya", "Parcels", "Owed", "Pay out"]} empty={merchants.length === 0}>
          {merchants.map((m) => {
            const owed = -(bal[m.id] ?? 0);
            return (
              <tr key={m.id}>
                <Td>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-[13px] text-muted">{m.phone}</p>
                </Td>
                <Td>{m.wilaya}</Td>
                <Td><span className="tnum">{m.parcels}</span></Td>
                <Td>{owed > 0 ? <Money value={owed} className="font-semibold" /> : owed < 0 ? <Badge tone="warn">Owes {-owed} DZD</Badge> : <Badge tone="success">Settled</Badge>}</Td>
                <Td>
                  {owed > 0 && (
                    <ActionForm action={payoutAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="merchantId" value={m.id} />
                      <Input name="amount" inputMode="numeric" defaultValue={Math.min(owed, Math.max(cash, 0))} aria-label={`Payout amount for ${m.name}`} className="!h-8 !w-28 tnum" />
                      <Submit size="sm" variant="dark">Pay out</Submit>
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
