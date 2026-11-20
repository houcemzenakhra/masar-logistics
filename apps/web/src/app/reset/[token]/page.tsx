import Link from "next/link";
import { AuthFrame } from "@/components/auth-frame";
import { ActionForm, Submit } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { initLocale, t } from "@/lib/i18n";
import { getDb } from "@/server/db";
import { checkResetToken } from "@/server/services/security";
import { resetAction } from "../../actions";

export const metadata = { title: "New password", referrer: "no-referrer" };

export default async function Reset({ params }: { params: Promise<{ token: string }> }) {
  await initLocale();
  const token = (await params).token;
  const r = await checkResetToken(await getDb(), token);
  return (
    <AuthFrame headline={t("One place for orders, hubs, couriers and cash.")} sub={t("Merchants, hub staff, couriers and operations all sign in here.")}>
      {!r ? (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{t("This link no longer works")}</h1>
          <p className="mt-2 text-sm text-ink-2">{t("This link has expired or was already used. Ask for a new one.")}</p>
          <p className="mt-6 text-sm"><Link href="/forgot" className="font-medium text-accent-deep hover:underline">{t("Ask for a new link")}</Link></p>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Choose a new password")}</h1>
          <p className="mt-1 text-sm text-muted">{t("For {email}. You will be signed out on every other device.", { email: r.email })}</p>
          <ActionForm action={resetAction} className="mt-8 space-y-4">
            <input type="hidden" name="token" value={token} />
            <Field label={t("New password")} hint={t("At least 8 characters.")}><Input name="password" type="password" required minLength={8} autoComplete="new-password" dir="ltr" /></Field>
            <Field label={t("Repeat the new password")}><Input name="confirm" type="password" required minLength={8} autoComplete="new-password" dir="ltr" /></Field>
            <Submit className="w-full">{t("Save the new password")}</Submit>
          </ActionForm>
        </>
      )}
    </AuthFrame>
  );
}
