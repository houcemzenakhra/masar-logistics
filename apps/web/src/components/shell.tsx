import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";
import { t } from "@/lib/i18n";
import type { Session } from "@/server/auth";
import { LocaleSwitcher } from "./locale-switcher";
import { NavLinks, type NavItem } from "./nav-links";
import { Logo } from "./ui";

const ROLE = { admin: "Operations", hub: "Hub staff", merchant: "Merchant", courier: "Courier" };

export function Shell({ session, items, children }: { session: Session; items: NavItem[]; children: ReactNode }) {
  const signOut = (
    <form action={logoutAction}>
      <button className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label={t("Sign out")} title={t("Sign out")}>
        <LogOut size={17} className="rtl:-scale-x-100" />
      </button>
    </form>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[256px_1fr]">
      <aside className="sticky top-0 z-20 bg-navy text-white lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-14 items-center justify-between gap-3 px-4 lg:h-16 lg:px-5">
          <Link href="/"><Logo light /></Link>
          <div className="flex items-center gap-1 lg:hidden">
            <LocaleSwitcher dark />
            {signOut}
          </div>
        </div>
        <nav className="lg:mt-2 lg:flex-1 lg:overflow-y-auto" aria-label={t("Main")}><NavLinks items={items} /></nav>
        <div className="hidden border-t border-white/10 p-4 lg:block">
          <LocaleSwitcher dark />
          <div className="mt-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{session.name}</p>
              <p className="text-xs text-white/50">{t(ROLE[session.role])}</p>
            </div>
            {signOut}
          </div>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
