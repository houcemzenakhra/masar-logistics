import Link from "next/link";
import type { ReactNode } from "react";
import { t } from "@/lib/i18n";
import { LocaleSwitcher } from "./locale-switcher";
import { Logo } from "./ui";

/** Two-panel frame shared by sign-in and sign-up. The dark panel is hidden on phones. */
export function AuthFrame({ headline, sub, children }: { headline: string; sub: string; children: ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[5fr_6fr]">
      <div className="route-grid relative hidden flex-col justify-between bg-navy p-12 text-white lg:flex">
        <Link href="/"><Logo light /></Link>
        <div>
          <p className="max-w-md text-4xl font-semibold leading-tight tracking-tight">{headline}</p>
          <p className="mt-4 max-w-sm text-white/60">{sub}</p>
        </div>
        <p className="text-sm text-white/40">Masar Logistics</p>
      </div>
      <div className="flex flex-col p-5 sm:p-8">
        <div className="flex items-center justify-between">
          <Link href="/" className="lg:invisible"><Logo /></Link>
          <LocaleSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center py-8">
          <div className="w-full max-w-md">{children}</div>
        </div>
        <p className="text-center text-xs text-muted">{t("Pickup, hubs and cash on delivery across Algeria.")}</p>
      </div>
    </main>
  );
}
