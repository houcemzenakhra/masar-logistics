import { createParcelAction } from "@/app/actions";
import { DestinationFields, OrderOptions } from "@/components/destination-fields";
import { ActionForm, Submit } from "@/components/forms";
import { Card, Field, Input, LinkButton, PageHeader, Select } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { eq } from "drizzle-orm";
import { merchants } from "@/server/schema";
import { getDeskSettings } from "@/server/services/desks";
import { listWilayas } from "@/server/services/directory";

export default async function NewOrder() {
  const s = await requireRole("merchant");
  const db = await getDb();
  const [wilayas, desk, [m]] = await Promise.all([listWilayas(db), getDeskSettings(db), db.select({ confirm: merchants.confirmOrders }).from(merchants).where(eq(merchants.id, s.merchantId!))]);
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
          <DestinationFields wilayas={wilayas} deskDiscount={desk.discount} />
          <Field label={t("Cash to collect (DZD)")} hint={t("Enter 0 if the order is already paid.")}><Input name="codAmount" required inputMode="numeric" defaultValue={0} dir="ltr" className="tnum" /></Field>
          <Field label={t("Weight (kg)")}><Input name="weightKg" required type="number" min={0.1} max={70} step={0.1} defaultValue={1} dir="ltr" className="tnum" /></Field>
          <Field label={t("Size in cm (optional)")} hint={t("Length × width × height. Large light parcels are charged by volume.")}><Input name="size" placeholder="30x20x10" dir="ltr" className="tnum" /></Field>
          <Field label={t("Contents (optional)")}><Input name="description" maxLength={120} /></Field>
          <Field label={t("Text messages to the recipient in")} hint={t("Arabic messages cost about twice as much.")}>
            <Select name="recipientLang" defaultValue="fr">
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
            </Select>
          </Field>
          <OrderOptions />
          {m?.confirm && <p className="text-sm text-muted sm:col-span-2">{t("The recipient gets a text message to confirm the order. It is picked up once they confirm.")}</p>}
          <div className="sm:col-span-2"><Submit>{t("Create order")}</Submit></div>
        </ActionForm>
      </Card>
    </>
  );
}
