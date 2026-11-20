import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/auth-frame";
import { ActionForm, Submit } from "@/components/forms";
import { Field, Input } from "@/components/ui";
import { t } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { HOME } from "@/server/auth";
import { loginAction } from "../actions";

export const metadata = { title: "Sign in" };

const DEMO = [
  ["Operations", "admin@masar.dz"],
  ["Merchant", "merchant@masar.dz"],
  ["Hub staff", "hub@masar.dz"],
  ["Courier", "courier@masar.dz"],
];

export default async function Login({ searchParams }: { searchParams: Promise<{ reset?: string }> }) {
  const s = await getSession();
  if (s) redirect(HOME[s.role]);
  const { reset } = await searchParams;
  // The demo accounts are listed on a local database, or on a staging deployment that asks for it.
  // The password is shown only locally: a deployed demo keeps its password in MASAR_DEMO_PASSWORD.
  const local = !process.env.DATABASE_URL;
  const demo = local || process.env.MASAR_SHOW_DEMO === "1";
  return (
    <AuthFrame headline={t("One place for orders, hubs, couriers and cash.")} sub={t("Merchants, hub staff, couriers and operations all sign in here.")}>
      <h1 className="text-2xl font-semibold tracking-tight">{t("Sign in")}</h1>
      <p className="mt-1 text-sm text-muted">{t("Use the email and password for your Masar account.")}</p>
      {reset && <p role="status" className="mt-4 rounded-lg bg-ok-soft px-3 py-2 text-[13px] text-ok">{t("Your password was changed. Sign in with the new one.")}</p>}
      <ActionForm action={loginAction} className="mt-8 space-y-4">
        <Field label={t("Email")}><Input name="email" type="email" autoComplete="username" required dir="ltr" /></Field>
        <Field label={t("Password")}><Input name="password" type="password" autoComplete="current-password" required dir="ltr" /></Field>
        <Submit className="w-full">{t("Sign in")}</Submit>
      </ActionForm>
      <p className="mt-3 text-end text-sm"><Link href="/forgot" className="text-ink-2 hover:text-ink hover:underline">{t("Forgot your password?")}</Link></p>
      <p className="mt-6 text-sm text-ink-2">
        {t("Selling online and new to Masar?")}{" "}
        <Link href="/signup" className="font-medium text-accent-deep hover:underline">{t("Create a merchant account")}</Link>
      </p>
      {demo && (
        <div className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-4 text-[13px]">
          <p className="font-medium">{t("Demo accounts")}</p>
          {local ? (
            <p className="mt-1 text-muted">{t("Password for all of them:")} <code className="font-mono text-ink">masar-demo</code></p>
          ) : (
            <p className="mt-1 text-muted">{t("Ask the person who gave you this link for the demo password.")}</p>
          )}
          <ul className="mt-3 space-y-1.5">
            {DEMO.map(([role, email]) => (
              <li key={email} className="flex justify-between gap-3">
                <span className="text-muted">{t(role)}</span>
                <code className="font-mono text-ink">{email}</code>
              </li>
            ))}
          </ul>
        </div>
      )}
    </AuthFrame>
  );
}
