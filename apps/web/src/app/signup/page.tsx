import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { CommuneSelect } from "@/components/commune-select";
import { ActionForm, Submit } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { t } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { HOME } from "@/server/auth";
import { getDb } from "@/server/db";
import { listWilayas } from "@/server/services/directory";
import { signupAction } from "../actions";

export const metadata = { title: "Create a merchant account" };

export default async function Signup() {
  const s = await getSession();
  if (s) redirect(HOME[s.role]);
  const wilayas = await listWilayas(await getDb());
  return (
    <AuthFrame headline={t("Start shipping with Masar.")} sub={t("Tell us where to pick up. We review new accounts before the first pickup.")}>
      <h1 className="text-2xl font-semibold tracking-tight">{t("Create a merchant account")}</h1>
      <p className="mt-1 text-sm text-muted">{t("Free to open. You only pay a delivery fee per parcel.")}</p>
      <ActionForm action={signupAction} className="mt-7 grid gap-4 sm:grid-cols-2">
        <Field label={t("Shop or business name")}><Input name="businessName" required autoComplete="organization" /></Field>
        <Field label={t("Your name")}><Input name="contactName" required autoComplete="name" /></Field>
        <Field label={t("Email")}><Input name="email" type="email" required autoComplete="email" dir="ltr" /></Field>
        <Field label={t("Mobile phone")}><Input name="phone" required inputMode="tel" autoComplete="tel" placeholder="0550 12 34 56" dir="ltr" /></Field>
        <CommuneSelect wilayas={wilayas} wilayaField="wilayaId" />
        <div className="sm:col-span-2">
          <Field label={t("Pickup address")} hint={t("Where the courier collects your parcels.")}><Input name="address" required autoComplete="street-address" /></Field>
        </div>
        <div className="sm:col-span-2">
          <Field label={t("Password")} hint={t("At least 8 characters.")}><Input name="password" type="password" required minLength={8} autoComplete="new-password" dir="ltr" /></Field>
        </div>
        <div className="sm:col-span-2"><Submit className="w-full">{t("Create account")}</Submit></div>
      </ActionForm>
      <p className="mt-6 text-sm text-ink-2">
        {t("Already have an account?")} <Link href="/login" className="font-medium text-accent-deep hover:underline">{t("Sign in")}</Link>
      </p>
    </AuthFrame>
  );
}
