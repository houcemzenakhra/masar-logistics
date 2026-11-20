import { createParcelAction } from "@/app/actions";
import { CommuneSelect } from "@/components/commune-select";
import { ActionForm, Submit } from "@/components/forms";
import { Card, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listWilayas } from "@/server/services/directory";

export default async function NewOrder() {
  await requireRole("merchant");
  const wilayas = await listWilayas(await getDb());
  return (
    <>
      <PageHeader
        title={t("New order")}
        subtitle={t("The delivery fee is calculated from the destination and weight, and taken from the cash collected.")}
        action={<LinkButton href="/merchant/import" variant="ghost">{t("Import a spreadsheet")}</LinkButton>}
      />
      <Card className="max-w-2xl p-5 sm:p-6">
        <ActionForm action={createParcelAction} className="grid gap-4 sm:grid-cols-2">
          <Field label={t("Recipient name")}><Input name="recipientName" required autoComplete="off" /></Field>
          <Field label={t("Recipient phone")}><Input name="recipientPhone" required inputMode="tel" placeholder="0550 12 34 56" dir="ltr" /></Field>
          <CommuneSelect wilayas={wilayas} />
          <div className="sm:col-span-2">
            <Field label={t("Address")} hint={t("Street, building, or a landmark the courier can find.")}><Input name="address" required /></Field>
          </div>
          <Field label={t("Cash to collect (DZD)")} hint={t("Enter 0 if the order is already paid.")}><Input name="codAmount" required inputMode="numeric" defaultValue={0} dir="ltr" className="tnum" /></Field>
          <Field label={t("Weight (kg)")}><Input name="weightKg" required type="number" min={0.1} max={70} step={0.1} defaultValue={1} dir="ltr" className="tnum" /></Field>
          <Field label={t("Contents (optional)")}><Input name="description" maxLength={120} /></Field>
          <Field label={t("Text messages to the recipient in")} hint={t("Arabic messages cost about twice as much.")}>
            <Select name="recipientLang" defaultValue="fr">
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
            </Select>
          </Field>
          <div className="sm:col-span-2"><Submit>{t("Create order")}</Submit></div>
        </ActionForm>
      </Card>
    </>
  );
}
