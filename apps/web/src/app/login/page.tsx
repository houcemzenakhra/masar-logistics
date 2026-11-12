import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Submit } from "@/components/forms";
import { Field, Input, Logo } from "@/components/ui";
import { getSession } from "@/lib/session";
import { HOME } from "@/server/auth";
import { loginAction } from "../actions";

export const metadata = { title: "Sign in" };

const DEMO = [
  ["Admin", "admin@masar.dz"],
  ["Merchant", "merchant@masar.dz"],
  ["Hub staff", "hub@masar.dz"],
  ["Courier", "courier@masar.dz"],
];

export default async function Login() {
  const s = await getSession();
  if (s) redirect(HOME[s.role]);
  const demo = !process.env.DATABASE_URL || process.env.MASAR_SHOW_DEMO === "1";
  return (
    <main className="grid min-h-screen lg:grid-cols-2">
      <div className="route-grid relative hidden flex-col justify-between bg-navy p-12 text-white lg:flex">
        <Link href="/"><Logo light /></Link>
        <div>
          <p className="max-w-md text-4xl font-semibold leading-tight tracking-tight">One place for orders, hubs, couriers and cash.</p>
          <p className="mt-4 max-w-sm text-white/60">Merchants, hub staff, couriers and operations all sign in here.</p>
        </div>
        <p className="text-sm text-white/40">Masar Logistics</p>
      </div>
      <div className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <Link href="/" className="lg:hidden"><Logo /></Link>
          <h1 className="mt-8 text-2xl font-semibold tracking-tight lg:mt-0">Sign in</h1>
          <p className="mt-1 text-sm text-muted">Use the email and password for your Masar account.</p>
          <ActionForm action={loginAction} className="mt-8 space-y-4">
            <Field label="Email"><Input name="email" type="email" autoComplete="username" required placeholder="you@company.dz" /></Field>
            <Field label="Password"><Input name="password" type="password" autoComplete="current-password" required /></Field>
            <Submit className="w-full">Sign in</Submit>
          </ActionForm>
          {demo && (
            <div className="mt-8 rounded-2xl border border-dashed border-line bg-surface p-4 text-[13px]">
              <p className="font-medium">Demo accounts</p>
              <p className="mt-1 text-muted">Password for all of them: <code className="font-mono text-ink">masar-demo</code></p>
              <ul className="mt-3 space-y-1.5">
                {DEMO.map(([role, email]) => (
                  <li key={email} className="flex justify-between gap-3">
                    <span className="text-muted">{role}</span>
                    <code className="font-mono text-ink">{email}</code>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
