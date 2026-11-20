import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { ActionForm, Submit } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { initLocale, t } from "@/lib/i18n";
import { forgotAction } from "../actions";

export const metadata = { title: "Forgot password" };

export default async function Forgot() {
  await initLocale();
  return (
    <AuthFrame headline={t("One place for orders, hubs, couriers and cash.")} sub={t("Merchants, hub staff, couriers and operations all sign in here.")}>
      <h1 className="text-2xl font-semibold tracking-tight">{t("Forgot your password?")}</h1>
      <p className="mt-1 text-sm text-muted">{t("Enter the email of your account. We will send a link to choose a new password by text message to the phone number on the account.")}</p>
      <ActionForm action={forgotAction} className="mt-8 space-y-4">
        <Field label={t("Email")}><Input name="email" type="email" autoComplete="username" required dir="ltr" /></Field>
        <Submit className="w-full">{t("Send the link")}</Submit>
      </ActionForm>
      <p className="mt-6 text-sm text-ink-2">{t("No phone number on your account, or no message after a few minutes? Ask your Masar contact for a reset link.")}</p>
      <p className="mt-4 text-sm"><Link href="/login" className="font-medium text-accent-deep hover:underline">{t("Back to sign in")}</Link></p>
    </AuthFrame>
  );
}
