import { updateTierAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Card, Field, Input, PageHeader } from "@/components/ui";
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
      <PageHeader title="Pricing" subtitle={`Flat rate per zone in DZD. The first ${INCLUDED_KG} kg are included. Changes apply to new orders only.`} />
      <div className="grid gap-5 md:grid-cols-2">
        {tiers.map((t) => (
          <Card key={t.key} className="p-5">
            <h2 className="text-[15px] font-semibold">{t.label}</h2>
            <p className="mt-0.5 text-sm text-muted">{WHEN[t.key]}</p>
            <ActionForm action={updateTierAction} className="mt-5 flex flex-wrap items-end gap-3">
              <input type="hidden" name="key" value={t.key} />
              <div className="w-28"><Field label="Base"><Input name="base" inputMode="numeric" defaultValue={t.base} className="tnum" /></Field></div>
              <div className="w-28"><Field label="Per extra kg"><Input name="perExtraKg" inputMode="numeric" defaultValue={t.perExtraKg} className="tnum" /></Field></div>
              <div className="w-28"><Field label="Return fee"><Input name="returnFee" inputMode="numeric" defaultValue={t.returnFee} className="tnum" /></Field></div>
              <Submit variant="dark">Save</Submit>
            </ActionForm>
          </Card>
        ))}
      </div>
    </>
  );
}
