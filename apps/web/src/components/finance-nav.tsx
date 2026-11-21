import Link from "next/link";
import { t } from "@/lib/i18n";

const TABS = [
  ["/admin/finance", "Ledger"],
  ["/admin/finance/payouts", "Payouts"],
  ["/admin/finance/cash", "Cash checks"],
  ["/admin/finance/pay", "Courier pay"],
] as const;

export function FinanceNav({ here }: { here: (typeof TABS)[number][0] }) {
  return (
    <nav className="mb-5 flex flex-wrap gap-1" aria-label={t("Finance")}>
      {TABS.map(([href, label]) => (
        <Link key={href} href={href} aria-current={href === here ? "page" : undefined} className={`rounded-full px-3.5 py-1.5 text-sm ${href === here ? "bg-navy text-white" : "text-ink-2 hover:bg-surface"}`}>
          {t(label)}
        </Link>
      ))}
    </nav>
  );
}
