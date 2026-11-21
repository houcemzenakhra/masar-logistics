import { fileClaimAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { PhotoInput } from "@/components/photo-input";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { NO_COD_CAP } from "@/server/services/claims";

export const metadata = { title: "Report a problem" };

export default async function NewClaim({ searchParams }: { searchParams: Promise<{ tracking?: string }> }) {
  await requireRole("merchant");
  const tracking = (await searchParams).tracking ?? "";
  const kinds = [
    ["damaged", "Damaged", "The parcel arrived broken or crushed."],
    ["missing_items", "Items missing", "The parcel arrived but something inside is missing."],
    ["lost", "Lost", "The parcel never arrived and has had no scan for 14 days, or Masar marked it lost."],
  ] as const;
  return (
    <>
      <PageHeader title={t("Report a problem")} subtitle={t("We answer every claim within two working days. Approved amounts go straight into your wallet.")} />
      <Card className="max-w-2xl p-5 sm:p-6">
        <ActionForm action={fileClaimAction} className="space-y-5">
          <Field label={t("Tracking number")}><Input name="tracking" required defaultValue={tracking} placeholder="MSR004512907" className="font-mono uppercase" /></Field>
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-medium text-ink-2">{t("What happened?")}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {kinds.map(([k, label, hint], i) => (
                <label key={k} className="cursor-pointer rounded-xl border border-line p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <input type="radio" name="kind" value={k} defaultChecked={i === 0} className="sr-only" />
                  <span className="font-medium">{t(label)}</span>
                  <span className="mt-1 block text-[13px] text-ink-2">{t(hint)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={t("Describe what happened")}><textarea name="description" required minLength={10} maxLength={1000} rows={4} className="w-full rounded-xl border border-line bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20" /></Field>
          <Field label={t("Amount you are claiming (DZD)")} hint={t("At most the cash on delivery of the parcel, or {x} DZD when there was none.", { x: money(NO_COD_CAP) })}><Input name="amount" type="number" min={1} required className="!w-48" /></Field>
          <PhotoInput label={t("Photos of the parcel and the damage (required for damage)")} />
          <Submit>{t("Send claim")}</Submit>
        </ActionForm>
      </Card>
    </>
  );
}
