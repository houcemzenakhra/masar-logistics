import { ClaimTable } from "@/components/claims";
import { Card, LinkButton, PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { CLAIM_WINDOW_DAYS, listClaims } from "@/server/services/claims";

export const metadata = { title: "Claims" };

export default async function MerchantClaims() {
  const s = await requireRole("merchant");
  const rows = await listClaims(await getDb(), { merchantId: s.merchantId });
  return (
    <>
      <PageHeader
        title={t("Claims")}
        subtitle={t("Report a parcel that was lost, or damaged when it arrived. Damage must be reported within {d} days of delivery.", { d: CLAIM_WINDOW_DAYS })}
        action={<LinkButton href="/merchant/claims/new">{t("Report a problem")}</LinkButton>}
      />
      <Card><ClaimTable rows={rows} base="/merchant/claims" /></Card>
    </>
  );
}
