import type { NavItem } from "@/components/nav-links";
import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/session";

export const metadata = { title: "Operations" };

const ADMIN: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "dashboard", exact: true },
  { href: "/admin/parcels", label: "Parcels", icon: "package" },
  { href: "/admin/dispatch", label: "Dispatch", icon: "send" },
  { href: "/admin/live", label: "Live map", icon: "map" },
  { href: "/admin/scan", label: "Hub scan", icon: "scan" },
  { href: "/admin/linehaul", label: "Linehaul", icon: "truck" },
  { href: "/admin/couriers", label: "Couriers", icon: "users" },
  { href: "/admin/merchants", label: "Merchants", icon: "store" },
  { href: "/admin/finance", label: "Finance", icon: "banknote" },
  { href: "/admin/claims", label: "Claims", icon: "claims" },
  { href: "/admin/network", label: "Network", icon: "network" },
  { href: "/admin/desks", label: "Stop desks", icon: "building" },
  { href: "/admin/pricing", label: "Pricing", icon: "tags" },
  { href: "/admin/sms", label: "Text messages", icon: "sms" },
  { href: "/admin/team", label: "Team", icon: "team" },
  { href: "/admin/audit", label: "Audit log", icon: "audit" },
  { href: "/admin/settings", label: "Settings", icon: "settings" },
];
const HUB = ["/admin/scan", "/admin/desks", "/admin/linehaul", "/admin/parcels", "/admin/dispatch", "/admin/live", "/admin/finance/cash"];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("admin", "hub");
  // Hub teams count couriers' cash; operations reach the same page under Finance.
  const cash: NavItem = { href: "/admin/finance/cash", label: "Cash checks", icon: "banknote" };
  const items = s.role === "admin" ? ADMIN : HUB.map((h) => [...ADMIN, cash].find((i) => i.href === h)!);
  return <Shell session={s} items={items}>{children}</Shell>;
}
