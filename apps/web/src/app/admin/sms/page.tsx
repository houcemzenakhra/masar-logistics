import { RotateCw } from "lucide-react";
import Link from "next/link";
import { smsRetryAction, smsSettingsAction, smsTestAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, CardHeader, Field, Input, Notice, PageHeader, Select, Stat, Table, Td } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { MAX_SEND_ATTEMPTS, PARCEL_KINDS, displayTo, getSmsSettings, listSms, provider, renderParcelSms, segments, smsStats } from "@/server/services/sms";

export const metadata = { title: "Text messages" };

const KIND: Record<string, string> = {
  out_for_delivery: "Out for delivery",
  attempt_failed: "Delivery failed",
  delivered: "Delivered",
  password_reset: "Password reset",
  test: "Test",
};
const WHEN: Record<(typeof PARCEL_KINDS)[number], string> = {
  out_for_delivery: "When a courier takes the parcel out for delivery",
  attempt_failed: "When a delivery attempt fails and another one will be made",
  delivered: "When the parcel is delivered",
};
const STATUS = { queued: ["Queued", "neutral"], sending: ["Sending", "info"], sent: ["Sent", "success"], failed: ["Failed", "danger"], simulated: ["Test mode", "warn"] } as const;
const SAMPLE = { tracking: "MSR004512907", merchant: "Dar El Moda", merchantPhone: "0550 12 34 56", cod: 4500, courier: "Riad", courierPhone: "0770 11 22 33" };

export default async function Sms({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireRole("admin");
  const { status } = await searchParams;
  const db = await getDb();
  const [cfg, stats, list] = await Promise.all([getSmsSettings(db), smsStats(db, 7), listSms(db, { status, limit: 100 })]);
  const live = provider();
  const failed = list.filter((m) => m.status === "failed" && m.attempts < MAX_SEND_ATTEMPTS);
  const chip = (on: boolean) => `whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset ${on ? "bg-navy text-white ring-navy" : "bg-surface text-ink-2 ring-line hover:bg-paper"}`;

  return (
    <>
      <PageHeader title={t("Text messages")} subtitle={t("Recipients get a text message when their parcel is on its way, so they are home with the cash. Fewer refusals, fewer returns.")} />
      {!live && (
        <Notice title={t("Test mode: no SMS provider is configured.")}>
          {t("Messages are written and recorded here, but not sent. Set SMS_PROVIDER and the gateway settings described in the README to send them.")}
        </Notice>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat tone="accent" label={t("Sent, last 7 days")} value={(stats.sent ?? 0) + (stats.simulated ?? 0)} hint={stats.simulated ? t("{n} in test mode", { n: stats.simulated }) : undefined} />
        <Stat label={t("Failed")} value={stats.failed ?? 0} />
        <Stat label={t("Waiting")} value={(stats.queued ?? 0) + (stats.sending ?? 0)} />
        <Stat label={t("Provider")} value={live ? live.name.toUpperCase() : "—"} />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="min-w-0">
          <CardHeader title={t("Messages to recipients")} hint={t("Previews use sample values. French messages avoid accents so they fit in one SMS part.")} />
          <ActionForm action={smsSettingsAction}>
            <ul className="divide-y divide-line">
              {PARCEL_KINDS.map((k) => {
                const fr = renderParcelSms(k, "fr", SAMPLE);
                const ar = renderParcelSms(k, "ar", SAMPLE);
                return (
                  <li key={k} className="p-5">
                    <label className="flex items-start gap-3">
                      <input type="checkbox" name={k} defaultChecked={cfg.enabled[k]} className="mt-1 size-4 accent-[#ff5b24]" />
                      <span>
                        <span className="font-medium">{t(KIND[k])}</span>
                        <span className="block text-sm text-muted">{t(WHEN[k])}</span>
                      </span>
                    </label>
                    <div className="mt-3 grid gap-2 md:grid-cols-2">
                      {[["fr", fr], ["ar", ar]].map(([l, text]) => {
                        const seg = segments(text);
                        return (
                          <div key={l} className="rounded-xl bg-paper p-3 text-[13px]">
                            <p dir={l === "ar" ? "rtl" : "ltr"} lang={l} className="leading-relaxed text-ink-2">{text}</p>
                            <p className="mt-2 text-[11px] text-muted">{t("{n} characters, {p} SMS parts ({e})", { n: seg.length, p: seg.parts, e: seg.encoding })}</p>
                          </div>
                        );
                      })}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-line p-4"><Submit variant="dark">{t("Save")}</Submit></div>
          </ActionForm>
        </Card>

        <Card className="h-fit">
          <CardHeader title={t("Send a test message")} />
          <ActionForm action={smsTestAction} className="space-y-4 p-5">
            <Field label={t("Mobile phone")}><Input name="to" required inputMode="tel" placeholder="0550 12 34 56" dir="ltr" /></Field>
            <Field label={t("Language")}>
              <Select name="lang" defaultValue="fr">
                <option value="fr">Français</option>
                <option value="ar">العربية</option>
              </Select>
            </Field>
            <Submit className="w-full">{t("Send test")}</Submit>
          </ActionForm>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader
          title={t("Outbox")}
          hint={t("Latest 100 messages. Recipients' numbers are partly hidden.")}
          action={
            failed.length > 0 ? (
              <ActionForm action={smsRetryAction}>
                <Submit variant="ghost" size="sm"><RotateCw size={14} /> {t("Retry failed ({n})", { n: failed.length })}</Submit>
              </ActionForm>
            ) : undefined
          }
        />
        <div className="flex gap-2 overflow-x-auto px-5 pt-4 [scrollbar-width:none]">
          <Link href="/admin/sms" className={chip(!status)}>{t("All")}</Link>
          {(["sent", "simulated", "failed", "queued"] as const).map((k) => (
            <Link key={k} href={`/admin/sms?status=${k}`} className={chip(status === k)}>{t(STATUS[k][0])}</Link>
          ))}
        </div>
        <Table head={["When", "To", "Type", "Parcel", "Message", "Status"]} empty={list.length === 0}>
          {list.map((m) => (
            <tr key={m.id}>
              <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(m.createdAt)}</Td>
              <Td className="whitespace-nowrap"><span className="ltr font-mono text-[13px]">{displayTo(m.to)}</span></Td>
              <Td className="whitespace-nowrap">{t(KIND[m.kind] ?? m.kind)}</Td>
              <Td>{m.parcelId ? <Link href={`/admin/parcels/${m.parcelId}`} className="font-mono text-[13px] hover:underline">{m.tracking}</Link> : "—"}</Td>
              <Td className="min-w-72 text-[13px] text-ink-2">
                <p dir="auto" className="line-clamp-2">{m.kind === "password_reset" ? t("(contains a sign-in link, hidden)") : m.body}</p>
                {m.error && <p className="mt-1 text-danger">{m.error}</p>}
              </Td>
              <Td className="whitespace-nowrap">
                <Badge tone={STATUS[m.status][1]}>{t(STATUS[m.status][0])}</Badge>
                {m.attempts > 1 && <p className="mt-1 text-[11px] text-muted">{t("Attempts: {n}", { n: m.attempts })}</p>}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
