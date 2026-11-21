import Link from "next/link";
import { ClaimTable } from "@/components/claims";
import { Card, PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { listClaims } from "@/server/services/claims";

export const metadata = { title: "Claims" };

const TABS = [["open", "Under review"], ["approved", "Approved"], ["rejected", "Declined"]] as const;

export default async function Claims({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireStaff("claims");
  const asked = (await searchParams).status;
  const status = TABS.find(([k]) => k === asked)?.[0] ?? "open";
  const rows = await listClaims(await getDb(), { status });
  return (
    <>
      <PageHeader title={t("Claims")} subtitle={t("Merchants report lost or damaged parcels here. An approved amount is paid into the merchant's wallet straight away.")} />
      <nav className="mb-4 flex gap-1" aria-label={t("Claims")}>
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/admin/claims?status=${k}`} aria-current={k === status ? "page" : undefined} className={`rounded-full px-3.5 py-1.5 text-sm ${k === status ? "bg-navy text-white" : "text-ink-2 hover:bg-surface"}`}>{t(label)}</Link>
        ))}
      </nav>
      <Card><ClaimTable rows={rows} base="/admin/claims" showMerchant /></Card>
    </>
  );
}
