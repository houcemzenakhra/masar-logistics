import Link from "next/link";
import { cancelPayoutAction, payoutDetailsAction, requestPayoutAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { KindBadge, memo } from "@/components/ledger-kind";
import { PayoutTable } from "@/components/payouts";
import { Card, CardHeader, Field, Input, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { acct, merchantOwed, recentTxns } from "@/server/services/ledger";
import { MIN_PAYOUT, listPayoutRequests, payoutAvailable, statementMonths } from "@/server/services/money";
import { merchants } from "@/server/schema";
import { eq } from "drizzle-orm";

export default async function Wallet() {
  const s = await requireRole("merchant");
  const db = await getDb();
  const [owed, lines, avail, requests, months, [m]] = await Promise.all([
    merchantOwed(db, s.merchantId!),
    recentTxns(db, { account: acct.merchant(s.merchantId!), limit: 100 }),
    payoutAvailable(db, s.merchantId!),
    listPayoutRequests(db, { merchantId: s.merchantId }),
    statementMonths(db, s.merchantId!),
    db.select().from(merchants).where(eq(merchants.id, s.merchantId!)),
  ]);
  // On the merchant's account a credit (negative) is money earned, a debit is money paid out or charged.
  const earned = lines.filter((l) => l.kind === "delivery").reduce((a, l) => a - l.amount, 0);
  const paid = lines.filter((l) => l.kind === "payout").reduce((a, l) => a + l.amount, 0);
  return (
    <>
      <PageHeader title={t("Wallet")} subtitle={t("Cash collected on your deliveries, minus fees, and what has been paid out to you.")} />
      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        <Stat tone="accent" label={t("Balance owed to you")} value={money(owed)} unit={t("DZD")} />
        <Stat label={t("Earned from deliveries")} value={money(earned)} unit={t("DZD")} hint={t("In the entries below")} />
        <Stat label={t("Paid out")} value={money(paid)} unit={t("DZD")} hint={t("In the entries below")} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title={t("Get paid")} hint={t("{x} DZD can be requested now.", { x: money(avail.available) })} />
          {m.payoutMethod ? (
            <ActionForm action={requestPayoutAction} className="flex flex-wrap items-end gap-3 p-5">
              <Field label={t("Amount (DZD)")}><Input name="amount" type="number" min={MIN_PAYOUT} max={avail.available} defaultValue={avail.available >= MIN_PAYOUT ? avail.available : undefined} required className="!w-44" /></Field>
              <Submit>{t("Request payout")}</Submit>
              <p className="w-full text-[13px] text-muted">
                {t("To {method} {account}, {holder}. At least {min} DZD.", { method: m.payoutMethod === "ccp" ? "CCP" : t("bank account"), account: `\u2066${m.payoutAccount}\u2069`, holder: m.payoutHolder, min: money(MIN_PAYOUT) })}
              </p>
            </ActionForm>
          ) : (
            <p className="p-5 text-sm text-ink-2">{t("Add the account we should pay you on. Requests open once it is saved.")}</p>
          )}
        </Card>
        <Card>
          <CardHeader title={t("Payout account")} />
          <ActionForm action={payoutDetailsAction} className="grid gap-3 p-5 sm:grid-cols-2">
            <Field label={t("Type")}>
              <Select name="method" defaultValue={m.payoutMethod ?? "ccp"}>
                <option value="ccp">{t("CCP (Algérie Poste)")}</option>
                <option value="bank">{t("Bank account (RIB)")}</option>
              </Select>
            </Field>
            <Field label={t("Account number")} hint={t("CCP: number and key. RIB: 20 digits.")}><Input name="account" required dir="ltr" defaultValue={m.payoutAccount} className="tnum text-end" /></Field>
            <Field label={t("Account holder")}><Input name="holder" required defaultValue={m.payoutHolder} /></Field>
            <Field label={t("Legal name (for statements)")}><Input name="legalName" defaultValue={m.legalName} /></Field>
            <Field label="NIF"><Input name="nif" defaultValue={m.nif} /></Field>
            <Field label="RC"><Input name="rc" defaultValue={m.rc} /></Field>
            <div className="sm:col-span-2"><Submit variant="dark">{t("Save")}</Submit></div>
          </ActionForm>
        </Card>
      </div>
      {requests.length > 0 && (
        <Card className="mt-5">
          <CardHeader title={t("Payout requests")} />
          <PayoutTable
            rows={requests}
            actions={(r) =>
              r.status === "requested" ? (
                <ActionForm action={cancelPayoutAction}>
                  <input type="hidden" name="id" value={r.id} />
                  <Submit size="sm" variant="ghost">{t("Cancel")}</Submit>
                </ActionForm>
              ) : null
            }
          />
        </Card>
      )}
      {months.length > 0 && (
        <Card className="mt-5">
          <CardHeader title={t("Monthly statements")} />
          <div className="flex flex-wrap gap-2 p-5">
            {months.map((mo) => (
              <Link key={mo} href={`/statement/${s.merchantId}/${mo}`} className="tnum rounded-lg border border-line px-3 py-1.5 text-sm hover:border-accent hover:text-accent">{mo}</Link>
            ))}
          </div>
        </Card>
      )}
      <Card className="mt-5">
        <CardHeader title={t("Statement")} hint={t("Latest 100 entries")} />
        <Table head={["When", "Type", "Details", "Amount"]} empty={lines.length === 0}>
          {lines.map((l) => (
            <tr key={l.id}>
              <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(l.createdAt)}</Td>
              <Td><KindBadge kind={l.kind} /></Td>
              <Td className="whitespace-nowrap text-ink-2">{memo(l.memo)}</Td>
              <Td className={`tnum whitespace-nowrap text-end font-medium ${l.amount < 0 ? "text-ok" : "text-ink"}`}>
                <span className="ltr">{l.amount < 0 ? "+" : "−"}{money(Math.abs(l.amount))}</span> <span className="text-xs font-normal text-muted">{t("DZD")}</span>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
