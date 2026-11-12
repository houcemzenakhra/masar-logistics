import type { NavItem } from "@/components/nav-links";
import { Shell } from "@/components/shell";
import { requireRole } from "@/lib/session";

export const metadata = { title: "Merchant portal" };

const ITEMS: NavItem[] = [
  { href: "/merchant", label: "Home", icon: "dashboard", exact: true },
  { href: "/merchant/parcels", label: "Orders", icon: "package" },
  { href: "/merchant/parcels/new", label: "New order", icon: "plus", exact: true },
  { href: "/merchant/wallet", label: "Wallet", icon: "wallet" },
];

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("merchant");
  return <Shell session={s} items={ITEMS}>{children}</Shell>;
}
