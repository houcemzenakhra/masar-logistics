import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { ActionForm, Submit } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { t } from "@/lib/i18n";
import { TWO_STEP_COOKIE, verifyGrant } from "@/server/auth";
import { verifyTwoStepAction } from "../../actions";

export const metadata = { title: "Sign in" };

/** The second step: a code from the authenticator app, or a recovery code. */
export default async function VerifyTwoStep() {
  if (!(await verifyGrant((await cookies()).get(TWO_STEP_COOKIE)?.value, "2step"))) redirect("/login");
  return (
    <AuthFrame headline={t("One place for orders, hubs, couriers and cash.")} sub={t("Merchants, hub staff, couriers and operations all sign in here.")}>
      <h1 className="text-2xl font-semibold tracking-tight">{t("Enter your code")}</h1>
      <p className="mt-1 text-sm text-muted">{t("Open your authenticator app and enter the 6-digit code for this account.")}</p>
      <ActionForm action={verifyTwoStepAction} className="mt-8 space-y-4">
        <Field label={t("Code")} hint={t("Lost your phone? Enter one of your recovery codes instead.")}>
          <Input name="code" required autoFocus autoComplete="one-time-code" inputMode="text" maxLength={12} dir="ltr" className="text-center font-mono text-xl tracking-[0.3em]" />
        </Field>
        <Submit className="w-full">{t("Sign in")}</Submit>
      </ActionForm>
      <p className="mt-4 text-sm"><Link href="/login" className="text-ink-2 hover:text-ink hover:underline">{t("Use another account")}</Link></p>
    </AuthFrame>
  );
}
