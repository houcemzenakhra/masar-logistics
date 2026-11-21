import { eq } from "drizzle-orm";
import { confirmOrdersSettingAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { merchants } from "@/server/schema";

export default async function MerchantSettings() {
  const s = await requireRole("merchant");
  const [m] = await (await getDb()).select().from(merchants).where(eq(merchants.id, s.merchantId!));
  return (
    <>
      <PageHeader title={t("Settings")} subtitle={t("How your orders are handled.")} />
      <Card className="max-w-2xl">
        <CardHeader title={t("Order confirmation")} hint={t("Cuts refusals at the door: an order is only picked up once the recipient has said yes.")} />
        <ActionForm action={confirmOrdersSettingAction} className="space-y-4 p-5">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="confirmOrders" defaultChecked={m.confirmOrders} className="mt-0.5 size-4 shrink-0 accent-accent" />
            <span className="text-sm">
              <span className="font-medium">{t("Ask recipients to confirm each new order")}</span>
              <span className="block text-muted">{t("They get a text message with a link to confirm or cancel. A cancelled order costs you nothing. You can also confirm an order yourself after calling them.")}</span>
            </span>
          </label>
          <Submit>{t("Save")}</Submit>
        </ActionForm>
      </Card>
    </>
  );
}
