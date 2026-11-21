import { merchantStatusAction, payoutAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { ResetLinkButton } from "@/components/reset-link";
import { Badge, Card, CardHeader, Input, Money, PageHeader, Table, Td } from "@/components/ui";
import { dateOnly, money } from "@/lib/format";
import { place, t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { listMerchants } from "@/server/services/directory";
import { acct, balance, balancesByPrefix } from "@/server/services/ledger";

function StatusForm({ id, status, label, variant }: { id: string; status: "active" | "suspended"; label: string; variant: "primary" | "ghost" | "danger" }) {
  return (
    <ActionForm action={merchantStatusAction}>
      <input type="hidden" name="merchantId" value={id} />
      <input type="hidden" name="status" value={status} />
      <Submit size="sm" variant={variant}>{label}</Submit>
    </ActionForm>
  );
}

export default async function Merchants() {
  await requireStaff("merchants");
  const db = await getDb();
  const [merchants, bal, cash] = await Promise.all([listMerchants(db), balancesByPrefix(db, "merchant"), balance(db, acct.companyCash)]);
  const pending = merchants.filter((m) => m.status === "pending");
  const rest = merchants.filter((m) => m.status !== "pending");
  return (
    <>
      <PageHeader title={t("Merchants")} subtitle={t("Approve new accounts, see balances owed and record payouts. {x} DZD of collected cash is available to pay out.", { x: money(cash) })} />
      {pending.length > 0 && (
        <Card className="mb-5 border-info/30">
          <CardHeader title={`${t("Waiting for approval")} (${pending.length})`} hint={t("These merchants signed up themselves. They cannot create orders until you approve them.")} />
          <Table head={["Merchant", "Pickup address", "Signed up", ""]}>
            {pending.map((m) => (
              <tr key={m.id}>
                <Td className="whitespace-nowrap">
                  <p className="font-medium">{m.name}</p>
                  <p className="ltr text-[13px] text-muted">{m.phone}</p>
                </Td>
                <Td>
                  <p>{m.address}</p>
                  <p className="text-[13px] text-muted">{place(m.wilaya, m.wilayaAr)}</p>
                </Td>
                <Td className="whitespace-nowrap text-muted">{dateOnly(m.createdAt)}</Td>
                <Td>
                  <div className="flex gap-2">
                    <StatusForm id={m.id} status="active" label={t("Approve")} variant="primary" />
                    <StatusForm id={m.id} status="suspended" label={t("Reject")} variant="danger" />
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <Card>
        <Table head={["Merchant", "Wilaya", "Parcels", "Owed", "Pay out", ""]} empty={rest.length === 0}>
          {rest.map((m) => {
            const owed = -(bal[m.id] ?? 0);
            return (
              <tr key={m.id}>
                <Td className="whitespace-nowrap">
                  <p className="font-medium">{m.name} {m.status === "suspended" && <Badge tone="danger">{t("Suspended")}</Badge>}</p>
                  <p className="ltr text-[13px] text-muted">{m.phone}</p>
                </Td>
                <Td className="whitespace-nowrap">{place(m.wilaya, m.wilayaAr)}</Td>
                <Td><span className="tnum">{m.parcels}</span></Td>
                <Td>{owed > 0 ? <Money value={owed} className="font-semibold" /> : owed < 0 ? <Badge tone="warn">{t("Owes {x} DZD", { x: money(-owed) })}</Badge> : <Badge tone="success">{t("Settled")}</Badge>}</Td>
                <Td>
                  {owed > 0 && (
                    <ActionForm action={payoutAction} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="merchantId" value={m.id} />
                      <Input name="amount" inputMode="numeric" defaultValue={Math.min(owed, Math.max(cash, 0))} aria-label={t("Amount")} dir="ltr" className="tnum !h-8 !w-28" />
                      <Submit size="sm" variant="dark">{t("Pay out")}</Submit>
                    </ActionForm>
                  )}
                </Td>
                <Td>
                  <div className="flex flex-wrap items-start gap-2">
                    {m.userId && m.status === "active" && <ResetLinkButton userId={m.userId} />}
                    {m.status === "active" ? <StatusForm id={m.id} status="suspended" label={t("Suspend")} variant="ghost" /> : <StatusForm id={m.id} status="active" label={t("Reactivate")} variant="ghost" />}
                  </div>
                </Td>
              </tr>
            );
          })}
        </Table>
      </Card>
    </>
  );
}
