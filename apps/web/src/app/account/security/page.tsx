import bwipjs from "bwip-js/node";
import { eq } from "drizzle-orm";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { confirmTwoStepAction, disableTwoStepAction, recoveryCodesAction, startTwoStepAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Card, Field, Input, Logo } from "@/components/ui";
import { dateOnly } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireSignedIn } from "@/lib/session";
import { HOME } from "@/server/auth";
import { getDb } from "@/server/db";
import { users } from "@/server/schema";
import { currentBrand } from "@/server/services/brand";
import { getSecurityPolicy } from "@/server/services/twostep";
import { decryptSecret, otpauthUrl } from "@/server/totp";

export const metadata = { title: "Security" };

/** Two-step sign-in for one's own account: set up, recovery codes, turn off. */
export default async function Security({ searchParams }: { searchParams: Promise<{ required?: string }> }) {
  const s = await requireSignedIn();
  const db = await getDb();
  const [[u], policy, brand] = await Promise.all([db.select().from(users).where(eq(users.id, s.userId)), getSecurityPolicy(db), currentBrand()]);
  const staff = s.role === "admin" || s.role === "hub";
  const required = staff && policy.requireStaff2fa;
  const on = !!u.totpEnabledAt;
  // While setting up: the secret waiting for its first code, shown as a QR code and as text.
  const pending = !on && u.totpSecret ? decryptSecret(u.totpSecret) : null;
  const qr = pending ? bwipjs.toSVG({ bcid: "qrcode", text: otpauthUrl(pending, u.email, brand.name), scale: 4, paddingwidth: 2, paddingheight: 2 }) : null;
  const { required: asked } = await searchParams;

  return (
    <main className="mx-auto min-h-screen max-w-xl px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <Logo />
        {(!required || on) && (
          <Link href={HOME[s.role]} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft size={15} className="rtl:-scale-x-100" /> {t("Back")}</Link>
        )}
      </div>
      <h1 className="display text-3xl">{t("Security")}</h1>
      <p className="mt-1 text-sm text-muted">{u.email}</p>

      {asked && !on && (
        <p role="alert" className="mt-5 rounded-xl bg-warn-soft px-4 py-3 text-sm text-ink">{t("Operations require two-step sign-in for staff. Set it up to continue.")}</p>
      )}

      <Card className="mt-6 p-6">
        <div className="flex items-start gap-3">
          <ShieldCheck size={22} className={on ? "text-ok" : "text-muted"} />
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">{t("Two-step sign-in")}</h2>
            <p className="mt-1 text-sm text-ink-2">
              {on
                ? t("On since {d}. Signing in asks for a code from your authenticator app after your password.", { d: dateOnly(u.totpEnabledAt!) })
                : t("After your password, sign-in asks for a code from an app on your phone (Google Authenticator, Microsoft Authenticator, 2FAS…). A stolen password alone is then not enough.")}
            </p>
          </div>
        </div>

        {!on && !pending && (
          <ActionForm action={startTwoStepAction} className="mt-5">
            <Submit>{t("Set up two-step sign-in")}</Submit>
          </ActionForm>
        )}

        {pending && qr && (
          <div className="mt-6 space-y-5">
            <ol className="list-decimal space-y-1 ps-5 text-sm text-ink-2">
              <li>{t("Open your authenticator app and add an account.")}</li>
              <li>{t("Scan this code, or type the key below.")}</li>
              <li>{t("Enter the 6-digit code the app shows.")}</li>
            </ol>
            <div className="flex flex-wrap items-center gap-5">
              <div className="size-44 shrink-0 rounded-xl bg-white p-2 ring-1 ring-line [&_svg]:size-full" dangerouslySetInnerHTML={{ __html: qr }} role="img" aria-label={t("QR code for your authenticator app")} />
              <code dir="ltr" className="min-w-0 break-all rounded-lg bg-paper px-3 py-2 font-mono text-[13px] tracking-wide">{pending.match(/.{1,4}/g)!.join(" ")}</code>
            </div>
          </div>
        )}

        {/* One form in one place before and after turning on, so the recovery codes it returns
            stay on screen when the page refreshes. */}
        {(pending || on) && (
          <ActionForm action={confirmTwoStepAction} className={pending ? "mt-5 flex flex-wrap items-end gap-3" : ""}>
            {pending && (
              <>
                <div className="w-44"><Field label={t("Code from the app")}><Input name="code" required inputMode="numeric" autoComplete="one-time-code" maxLength={7} dir="ltr" className="text-center font-mono text-lg tracking-[0.3em]" /></Field></div>
                <Submit>{t("Turn on")}</Submit>
              </>
            )}
          </ActionForm>
        )}

        {on && (
          <div className="mt-6 grid gap-5 border-t border-line pt-5 sm:grid-cols-2">
            <ActionForm action={recoveryCodesAction} className="space-y-3">
              <p className="text-sm text-ink-2">{t("Recovery codes left: {n}. Make new ones if you used or lost them.", { n: u.recoveryCodes.length })}</p>
              <Field label={t("Code from the app")}><Input name="code" required inputMode="numeric" maxLength={7} dir="ltr" className="font-mono" /></Field>
              <Submit variant="ghost">{t("New recovery codes")}</Submit>
            </ActionForm>
            {!required && (
              <ActionForm action={disableTwoStepAction} className="space-y-3">
                <p className="text-sm text-ink-2">{t("Turning it off makes your account easier to take over.")}</p>
                <Field label={t("Code from the app")}><Input name="code" required inputMode="numeric" maxLength={12} dir="ltr" className="font-mono" /></Field>
                <Submit variant="danger">{t("Turn off")}</Submit>
              </ActionForm>
            )}
          </div>
        )}
      </Card>
      {required && on && <p className="mt-4 text-xs text-muted">{t("Operations require two-step sign-in for staff, so it cannot be turned off here.")}</p>}
    </main>
  );
}
