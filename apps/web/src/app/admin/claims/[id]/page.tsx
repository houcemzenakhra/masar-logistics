import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { decideClaimAction } from "@/app/actions";
import { ClaimSummary } from "@/components/claims";
import { ActionForm, Submit } from "@/components/forms";
import { Card, CardHeader, Field, Input } from "@/components/ui";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { getClaim } from "@/server/services/claims";

export default async function AdminClaim({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("claims");
  const c = await getClaim(await getDb(), (await params).id);
  if (!c) notFound();
  return (
    <>
      <Link href="/admin/claims" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} className="rtl:-scale-x-100" /> {t("Claims")}</Link>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <ClaimSummary c={c} parcelHref={`/admin/parcels/${c.parcelId}`} />
        {c.status === "open" && (
          <Card>
            <CardHeader title={t("Decision")} hint={t("{m}. At most {x} DZD can be paid for this parcel.", { m: c.merchant, x: money(c.cap) })} />
            <ActionForm action={decideClaimAction} className="space-y-4 p-5">
              <input type="hidden" name="claimId" value={c.id} />
              <Field label={t("Amount to pay (DZD)")}><Input name="amount" type="number" min={1} max={c.cap} defaultValue={Math.min(c.amountRequested, c.cap)} /></Field>
              <Field label={t("Note to the merchant")} hint={t("Required when declining.")}><Input name="note" maxLength={500} /></Field>
              <div className="flex flex-wrap gap-2">
                <Submit name="decision" value="approve">{t("Approve and pay")}</Submit>
                <Submit name="decision" value="reject" variant="danger">{t("Decline")}</Submit>
              </div>
            </ActionForm>
          </Card>
        )}
      </div>
    </>
  );
}
