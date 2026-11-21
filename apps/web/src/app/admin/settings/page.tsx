import Link from "next/link";
import { brandAction, companyAction, deliverySettingsAction, returnsSettingsAction, securityPolicyAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Stat } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { getDeliverySettings } from "@/server/services/delivery";
import { getCompany } from "@/server/services/money";
import { pushStats } from "@/server/services/notify";
import { getHistorySettings } from "@/server/services/returns";
import { getBrand } from "@/server/services/brand";
import { runChecks } from "@/server/services/health";
import { getSecurityPolicy } from "@/server/services/twostep";
import { users } from "@/server/schema";
import { and, eq, inArray } from "drizzle-orm";

export const metadata = { title: "Settings" };

export default async function Settings() {
  await requireStaff("settings");
  const db = await getDb();
  const [cfg, push, company, history, policy, brand, health, staffRows] = await Promise.all([
    getDeliverySettings(db),
    pushStats(db),
    getCompany(db),
    getHistorySettings(db),
    getSecurityPolicy(db),
    getBrand(db),
    runChecks(db),
    db.select({ on: users.totpEnabledAt }).from(users).where(and(inArray(users.role, ["admin", "hub"]), eq(users.active, true))),
  ]);
  const staff = staffRows.map((r) => ({ on: !!r.on }));
  const options = [
    ["optional", "Optional", "Couriers can record the recipient's code, a photo or a signature, and can deliver without."],
    ["required", "Required", "Couriers must record at least one proof to mark a parcel delivered. Operations can still deliver without."],
  ] as const;
  return (
    <>
      <PageHeader title={t("Settings")} />
      <div className="grid max-w-4xl gap-5">
        <Card>
          <CardHeader title={t("Proof of delivery")} hint={t("Every recipient gets a 4-digit code in the out-for-delivery text message.")} />
          <ActionForm action={deliverySettingsAction} className="space-y-3 p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map(([k, label, hint]) => (
                <label key={k} className="cursor-pointer rounded-xl border border-line p-4 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <input type="radio" name="proof" value={k} defaultChecked={cfg.proof === k} className="sr-only" />
                  <span className="font-medium">{t(label)}</span>
                  <span className="mt-1 block text-[13px] text-ink-2">{t(hint)}</span>
                </label>
              ))}
            </div>
            <Submit>{t("Save")}</Submit>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title={t("Recipient history")} hint={t("Before shipping, merchants see how a recipient's past orders went: how many were delivered, refused or returned.")} />
          <ActionForm action={returnsSettingsAction} className="space-y-3 p-5">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="history" defaultChecked={history.enabled} className="mt-0.5 size-4 shrink-0 accent-accent" />
              <span className="text-sm">
                <span className="font-medium">{t("Show recipient history to merchants")}</span>
                <span className="block text-muted">{t("Counts only, from the last 12 months, and only on the merchant's own orders. No names, shops or addresses are shared.")}</span>
              </span>
            </label>
            <Submit>{t("Save")}</Submit>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title={t("Company details")} hint={t("Printed on merchants' monthly statements.")} />
          <ActionForm action={companyAction} className="grid gap-3 p-5 sm:grid-cols-2">
            <Field label={t("Legal name")}><Input name="legalName" required defaultValue={company.legalName} /></Field>
            <Field label={t("Address")}><Input name="address" defaultValue={company.address} /></Field>
            <Field label="NIF"><Input name="nif" defaultValue={company.nif} /></Field>
            <Field label="RC"><Input name="rc" defaultValue={company.rc} /></Field>
            <Field label="NIS"><Input name="nis" defaultValue={company.nis} /></Field>
            <Field label={t("Article d'imposition (AI)")}><Input name="ai" defaultValue={company.ai} /></Field>
            <Field label={t("Phone")}><Input name="phone" defaultValue={company.phone} /></Field>
            <Field label={t("Email")}><Input name="email" type="email" defaultValue={company.email} /></Field>
            <div className="sm:col-span-2"><Submit>{t("Save")}</Submit></div>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader
            title={t("Push notifications")}
            action={push.configured ? <Badge tone="success">{t("Firebase connected")}</Badge> : <Badge tone="warn">{t("Not connected")}</Badge>}
            hint={push.configured ? t("Notifications are pushed to phones as they happen.") : t("Notifications go to each person's inbox in the app, but are not pushed to phones. Set FCM_SERVICE_ACCOUNT to connect Firebase.")}
          />
          <div className="grid gap-3 p-5 sm:grid-cols-4">
            <Stat label={t("Phones registered")} value={push.phones} />
            <Stat label={t("Pushed, 7 days")} value={push.byStatus.sent ?? 0} />
            <Stat label={t("Inbox only, 7 days")} value={(push.byStatus.simulated ?? 0) + (push.byStatus.none ?? 0)} />
            <Stat label={t("Failed, 7 days")} value={push.byStatus.failed ?? 0} />
          </div>
        </Card>
        <Card>
          <CardHeader title={t("Staff sign-in")} hint={t("With this on, operations and hub staff must set up two-step sign-in before they can work.")} />
          <ActionForm action={securityPolicyAction} className="space-y-3 p-5">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="requireStaff2fa" defaultChecked={policy.requireStaff2fa} className="mt-0.5 size-4 shrink-0 accent-accent" />
              <span className="text-sm">
                <span className="font-medium">{t("Require two-step sign-in for staff")}</span>
                <span className="block text-muted">{t("Staff without it are taken to set it up after signing in. Your own account must have it first.")}</span>
              </span>
            </label>
            <p className="text-xs text-muted">{t("Staff with two-step sign-in: {a} of {b}.", { a: staff.filter((x) => x.on).length, b: staff.length })} <Link href="/account/security" className="text-accent-deep hover:underline">{t("Your security")}</Link></p>
            <Submit>{t("Save")}</Submit>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader title={t("Brand")} hint={t("Running the platform under your company's name: merchants and recipients see this name, colour and contacts.")} />
          <ActionForm action={brandAction} className="grid gap-4 p-5 sm:grid-cols-2">
            <Field label={t("Name")}><Input name="name" required maxLength={30} defaultValue={brand.name} /></Field>
            <Field label={t("Colour")} hint={t("Dark enough for white text on buttons.")}>
              <input type="color" name="accent" required defaultValue={brand.accent} className="h-10 w-full cursor-pointer rounded-xl border border-line bg-surface p-1" />
            </Field>
            <Field label={t("Support phone")}><Input name="supportPhone" defaultValue={brand.supportPhone} inputMode="tel" dir="ltr" /></Field>
            <Field label={t("Support email")}><Input name="supportEmail" type="email" defaultValue={brand.supportEmail} dir="ltr" /></Field>
            <div className="sm:col-span-2"><Submit>{t("Save")}</Submit></div>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader
            title={t("System health")}
            action={health.status === "ok" ? <Badge tone="success">{t("All good")}</Badge> : <Badge tone="warn">{t("Needs attention")}</Badge>}
            hint={t("Checked daily with alerts to operations, and live at /api/health for an uptime monitor. Database answered in {ms} ms.", { ms: health.dbMs })}
          />
          <ul className="divide-y divide-line">
            {health.checks.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span className="flex items-center gap-2"><span className={`size-2 rounded-full ${c.ok ? "bg-ok" : "bg-warn"}`} aria-hidden />{t(c.label)}</span>
                <span className={`tnum ${c.ok ? "text-muted" : "font-semibold text-warn"}`}>{c.key === "ledger" ? (c.ok ? t("Yes") : c.value.toLocaleString("fr-DZ")) : c.value}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
