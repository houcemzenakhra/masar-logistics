import { updateTierAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { INCLUDED_KG } from "@/server/domain/pricing";
import { getTiers } from "@/server/services/parcels";

const WHEN = {
  local: "Origin and destination in the same wilaya",
  north: "Both ends in the northern zone",
  highlands: "Either end in the highlands",
  south: "Either end in the south",
};

export default async function Pricing() {
  await requireRole("admin");
  const tiers = await getTiers(await getDb());
  return (
    <>
      <PageHeader title={t("Pricing")} subtitle={t("Flat rate per zone in DZD. The first {kg} kg are included. Changes apply to new orders only.", { kg: INCLUDED_KG })} />
      <div className="grid gap-5 md:grid-cols-2">
        {tiers.map((tier) => (
          <Card key={tier.key} className="p-5">
            <h2 className="text-[15px] font-semibold">{t(tier.label)}</h2>
            <p className="mt-0.5 text-sm text-muted">{t(WHEN[tier.key])}</p>
            <ActionForm action={updateTierAction} className="mt-5 flex flex-wrap items-end gap-3">
              <input type="hidden" name="key" value={tier.key} />
              <div className="w-28"><Field label={t("Base")}><Input name="base" inputMode="numeric" defaultValue={tier.base} dir="ltr" className="tnum" /></Field></div>
              <div className="w-28"><Field label={t("Per extra kg")}><Input name="perExtraKg" inputMode="numeric" defaultValue={tier.perExtraKg} dir="ltr" className="tnum" /></Field></div>
              <div className="w-28"><Field label={t("Return fee")}><Input name="returnFee" inputMode="numeric" defaultValue={tier.returnFee} dir="ltr" className="tnum" /></Field></div>
              <Submit variant="dark">{t("Save")}</Submit>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
