import Link from "next/link";
import { receiveCashAction, resolveShortfallAction } from "@/app/actions";
import { FinanceNav } from "@/components/finance-nav";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, CardHeader, Input, Money, Mono, PageHeader, Table, Td } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { couriersWithCash, listHandovers } from "@/server/services/money";

export const metadata = { title: "Cash checks" };

const RESOLUTION = { none: null, repaid: ["Repaid", "success"], written_off: ["Written off", "neutral"], deducted: ["To deduct from pay", "info"], settled_by_pay: ["Deducted from pay", "success"] } as const;

export default async function Cash() {
  const s = await requireStaff("finance", "hub");
  const db = await getDb();
  const hubId = s.role === "hub" ? s.hubId : null;
  const [couriers, recent, open] = await Promise.all([couriersWithCash(db, hubId), listHandovers(db, { hubId }), s.role === "admin" ? listHandovers(db, { shortOnly: true }) : Promise.resolve([])]);
  const holding = couriers.filter((c) => c.cash !== 0);
  return (
    <>
      <PageHeader title={s.role === "admin" ? t("Finance") : t("Cash checks")} subtitle={t("Count the cash each courier hands in. The difference with what they collected is recorded and they get a receipt.")} />
      {s.role === "admin" && <FinanceNav here="/admin/finance/cash" />}
      <Card>
        <CardHeader title={t("Couriers holding cash")} />
        <Table head={["Courier", "Should hand in", "Counted", ""]} empty={holding.length === 0}>
          {holding.map((c) => (
            <tr key={c.id}>
              <Td>
                <span className="font-medium">{c.name}</span>
                <span className="ltr block text-[13px] text-muted">{c.phone}</span>
              </Td>
              <Td><Money value={c.cash} /></Td>
              <Td colSpan={2}>
                <ActionForm action={receiveCashAction} className="flex flex-wrap items-center gap-2">
                  <input type="hidden" name="courierId" value={c.id} />
                  <Input name="amount" inputMode="numeric" required placeholder={String(c.cash)} aria-label={t("Amount counted")} className="!w-32 tnum" />
                  <Input name="note" placeholder={t("Note (optional)")} aria-label={t("Note")} className="!w-48" />
                  <Submit size="sm">{t("Receive and print receipt")}</Submit>
                </ActionForm>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
      {open.length > 0 && (
        <Card className="mt-5">
          <CardHeader title={t("Shortfalls to settle")} hint={t("Money a courier did not hand in. It stays on their account until it is repaid, written off or taken from their pay.")} />
          <Table head={["Receipt", "Courier", "Missing", "When", ""]}>
            {open.map((h) => (
              <tr key={h.id}>
                <Td><Link href={`/receipt/${h.id}`} className="font-mono text-[13px] text-accent-deep hover:underline">{h.code}</Link></Td>
                <Td>{h.courier}</Td>
                <Td className="font-medium text-danger"><Money value={h.difference} /></Td>
                <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(h.createdAt)}</Td>
                <Td>
                  <div className="flex flex-wrap justify-end gap-1">
                    {(["repaid", "deducted", "written_off"] as const).map((how) => (
                      <ActionForm key={how} action={resolveShortfallAction}>
                        <input type="hidden" name="id" value={h.id} />
                        <input type="hidden" name="how" value={how} />
                        <Submit size="sm" variant="ghost">{t({ repaid: "Repaid now", deducted: "Take from pay", written_off: "Write off" }[how])}</Submit>
                      </ActionForm>
                    ))}
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        </Card>
      )}
      <Card className="mt-5">
        <CardHeader title={t("Recent cash checks")} />
        <Table head={["Receipt", "Courier", "Expected", "Counted", "Difference", "When"]} empty={recent.length === 0}>
          {recent.map((h) => (
            <tr key={h.id}>
              <Td><Link href={`/receipt/${h.id}`} className="font-mono text-[13px] text-accent-deep hover:underline">{h.code}</Link></Td>
              <Td>{h.courier}</Td>
              <Td><Money value={h.expected} /></Td>
              <Td><Money value={h.counted} /></Td>
              <Td>
                {h.difference === 0 ? (
                  <Badge tone="success">{t("Exact")}</Badge>
                ) : (
                  <span className="flex flex-wrap items-center gap-2">
                    <Badge tone={h.difference > 0 ? "danger" : "warn"}>{h.difference > 0 ? t("{x} missing", { x: h.difference }) : t("{x} extra", { x: -h.difference })}</Badge>
                    {RESOLUTION[h.resolution] && <Badge tone={RESOLUTION[h.resolution]![1]}>{t(RESOLUTION[h.resolution]![0])}</Badge>}
                  </span>
                )}
              </Td>
              <Td className="whitespace-nowrap text-[13px] text-muted"><Mono>{dateTime(h.createdAt)}</Mono></Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
