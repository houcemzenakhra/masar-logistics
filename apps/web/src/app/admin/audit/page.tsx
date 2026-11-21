import Link from "next/link";
import { Card, PageHeader, Table, Td } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { auditActions, listAudit } from "@/server/services/security";

export const metadata = { title: "Audit log" };

const ACTION: Record<string, string> = {
  login: "Signed in",
  "login.failed": "Failed sign-in",
  "merchant.signup": "Merchant signed up",
  "merchant.approve": "Merchant approved",
  "merchant.suspend": "Merchant suspended",
  "staff.create": "Account created",
  "staff.deactivate": "Account deactivated",
  "staff.reactivate": "Account reactivated",
  "password.reset_requested": "Password reset requested",
  "password.reset_link": "Reset link created",
  "password.reset": "Password changed",
  "ledger.handover": "Cash handover",
  "ledger.payout": "Merchant payout",
  "pricing.update": "Rate changed",
  "import.commit": "Orders imported",
  "parcel.lost": "Parcel marked lost",
  "parcel.cancelled": "Order cancelled",
  "sms.settings": "SMS settings changed",
  "sms.retry": "SMS retried",
  "sms.test": "Test SMS",
};

function details(action: string, d: Record<string, unknown>) {
  if (typeof d.amount === "number") return `${money(d.amount)} ${t("DZD")}`;
  if (action === "pricing.update") {
    const b = d.before as Record<string, number>, a = d.after as Record<string, number>;
    return `${b.base} → ${a.base} · +${b.perExtraKg}/kg → +${a.perExtraKg}/kg · ${b.returnFee} → ${a.returnFee}`;
  }
  if (typeof d.created === "number") return t("Orders created: {n}.", { n: d.created });
  if (d.enabled) return Object.entries(d.enabled as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k).join(", ") || "—";
  return [d.email, d.name, d.business, d.tracking, d.role, d.to, d.via].filter(Boolean).join(" · ");
}

export default async function Audit({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  await requireStaff("settings");
  const { action } = await searchParams;
  const db = await getDb();
  const [rows, actions] = await Promise.all([listAudit(db, { action, limit: 300 }), auditActions(db)]);
  const chip = (on: boolean) => `whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset ${on ? "bg-navy text-white ring-navy" : "bg-surface text-ink-2 ring-line hover:bg-paper"}`;
  return (
    <>
      <PageHeader title={t("Audit log")} subtitle={t("Sign-ins, accounts, money and settings: who did what, and from where. Parcel moves are in each parcel's history.")} />
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <Link href="/admin/audit" className={chip(!action)}>{t("All")}</Link>
        {actions.map((a) => <Link key={a} href={`/admin/audit?action=${a}`} className={chip(action === a)}>{t(ACTION[a] ?? a)}</Link>)}
      </div>
      <Card>
        <Table head={["When", "Who", "What", "Details", "From"]} empty={rows.length === 0}>
          {rows.map((r) => (
            <tr key={r.id} className={r.action === "login.failed" ? "bg-warn-soft/40" : ""}>
              <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(r.createdAt)}</Td>
              <Td className="whitespace-nowrap">{r.actorName || <span className="text-muted">—</span>}</Td>
              <Td className="whitespace-nowrap font-medium">{t(ACTION[r.action] ?? r.action)}</Td>
              <Td className="text-[13px] text-ink-2">{details(r.action, r.details)}</Td>
              <Td className="whitespace-nowrap font-mono text-[12px] text-muted">{r.ip ?? "—"}</Td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}
