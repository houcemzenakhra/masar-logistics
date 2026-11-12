import type { NavItem } from "@/components/nav-links";
import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/session";

export const metadata = { title: "Operations" };

const ADMIN: NavItem[] = [
  { href: "/admin", label: "Overview", icon: "dashboard", exact: true },
  { href: "/admin/parcels", label: "Parcels", icon: "package" },
  { href: "/admin/dispatch", label: "Dispatch", icon: "send" },
  { href: "/admin/scan", label: "Hub scan", icon: "scan" },
  { href: "/admin/couriers", label: "Couriers", icon: "users" },
  { href: "/admin/merchants", label: "Merchants", icon: "store" },
  { href: "/admin/finance", label: "Finance", icon: "banknote" },
  { href: "/admin/network", label: "Network", icon: "network" },
  { href: "/admin/pricing", label: "Pricing", icon: "tags" },
];
const HUB = ["/admin/scan", "/admin/parcels", "/admin/dispatch"];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("admin", "hub");
  const items = s.role === "admin" ? ADMIN : HUB.map((h) => ADMIN.find((i) => i.href === h)!);
  return <Shell session={s} items={items}>{children}</Shell>;
}
