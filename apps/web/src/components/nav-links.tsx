"use client";

import { Banknote, Building2, LayoutDashboard, Network, Package, PlusCircle, ScanLine, Send, Store, Tags, Users, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const ICONS = { dashboard: LayoutDashboard, package: Package, send: Send, users: Users, store: Store, network: Network, tags: Tags, banknote: Banknote, scan: ScanLine, plus: PlusCircle, wallet: Wallet, building: Building2 };

export type NavItem = { href: string; label: string; icon: keyof typeof ICONS; exact?: boolean };

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  // Only the most specific matching item is active, so "Orders" is not lit on "New order".
  const best = items
    .filter((it) => path === it.href || (!it.exact && path.startsWith(`${it.href}/`)))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return (
    <ul className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
      {items.map((it) => {
        const Icon = ICONS[it.icon];
        const active = it === best;
        return (
          <li key={it.href} className="shrink-0">
            <Link
              href={it.href}
              aria-current={active ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
                active ? "bg-white/10 font-medium text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon size={17} className={active ? "text-accent" : ""} />
              {it.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
