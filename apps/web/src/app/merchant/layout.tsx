import type { NavItem } from "@/components/nav-links";
import { Shell } from "@/components/shell";
import { Notice } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { merchantStatus } from "@/server/services/signup";

export const metadata = { title: "Merchant portal" };

const ITEMS: NavItem[] = [
  { href: "/merchant", label: "Home", icon: "dashboard", exact: true },
  { href: "/merchant/parcels", label: "Orders", icon: "package" },
  { href: "/merchant/parcels/new", label: "New order", icon: "plus", exact: true },
  { href: "/merchant/import", label: "Import", icon: "upload" },
  { href: "/merchant/wallet", label: "Wallet", icon: "wallet" },
];

export default async function MerchantLayout({ children }: { children: React.ReactNode }) {
  const s = await requireRole("merchant");
  const status = await merchantStatus(await getDb(), s.merchantId!);
  return (
    <Shell session={s} items={ITEMS}>
      {status === "pending" && <Notice title={t("Your account is being reviewed.")}>{t("You can look around now. Creating orders opens as soon as our team approves your account, usually within one working day.")}</Notice>}
      {status === "suspended" && <Notice title={t("Your account is suspended.")}>{t("You cannot create new orders. Contact Masar support to resolve this.")}</Notice>}
      {children}
    </Shell>
  );
}
