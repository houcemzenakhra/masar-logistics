import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { logoutAction } from "@/app/actions";
import type { Session } from "@/server/auth";
import { NavLinks, type NavItem } from "./nav-links";
import { Logo } from "./ui";

const ROLE = { admin: "Operations", hub: "Hub staff", merchant: "Merchant", courier: "Courier" };

export function Shell({ session, items, children }: { session: Session; items: NavItem[]; children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[248px_1fr]">
      <aside className="bg-navy text-white lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col">
        <div className="flex h-16 items-center justify-between px-5">
          <Link href="/"><Logo light /></Link>
          <form action={logoutAction} className="lg:hidden">
            <button className="rounded-lg p-2 text-white/60 hover:text-white" aria-label="Sign out"><LogOut size={18} /></button>
          </form>
        </div>
        <nav className="lg:mt-2 lg:flex-1" aria-label="Main"><NavLinks items={items} /></nav>
        <div className="hidden items-center justify-between gap-3 border-t border-white/10 p-4 lg:flex">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{session.name}</p>
            <p className="text-xs text-white/50">{ROLE[session.role]}</p>
          </div>
          <form action={logoutAction}>
            <button className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-8 sm:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
