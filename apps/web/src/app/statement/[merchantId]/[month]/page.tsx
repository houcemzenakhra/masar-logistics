import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Logo } from "@/components/ui";
import { money } from "@/lib/format";
import { initLocale, t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";
import { getDb } from "@/server/db";
import { monthlyStatement } from "@/server/services/money";

export const metadata = { title: "Monthly statement" };

/** A merchant's month on one printable page: services invoiced, cash collected, payouts, balance. */
export default async function Statement({ params }: { params: Promise<{ merchantId: string; month: string }> }) {
  await initLocale();
  const s = await requireStaff("finance", "merchant");
  const { merchantId, month } = await params;
  if (s.role === "merchant" && s.merchantId !== merchantId) notFound();
  if (!/^\d{4}-\d{2}$/.test(month)) notFound();
  const st = await monthlyStatement(await getDb(), merchantId, month);
  if (!st) notFound();
  const c = st.company;
  const m = st.merchant;
  const line = (label: string, qty: string, amount: number, strong = false) => (
    <tr className="border-b border-line">
      <td className={`py-2.5 ${strong ? "font-semibold" : ""}`}>{label}</td>
      <td className="tnum py-2.5 text-end text-ink-2">{qty}</td>
      <td className={`tnum py-2.5 text-end ${strong ? "font-semibold" : ""}`}><span className="ltr">{money(amount)}</span> {t("DZD")}</td>
    </tr>
  );
  return (
    <main className="mx-auto max-w-3xl p-4 sm:p-8">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <article className="rounded-2xl bg-white p-6 text-[14px] ring-1 ring-line sm:p-10 print:ring-0">
        <header className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <Logo />
            <p className="mt-3 font-medium">{c.legalName}</p>
            {c.address && <p className="text-ink-2">{c.address}</p>}
            <p className="mt-1 text-[12px] text-muted">{[c.nif && `NIF ${c.nif}`, c.rc && `RC ${c.rc}`, c.nis && `NIS ${c.nis}`, c.ai && `AI ${c.ai}`].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="text-end">
            <h1 className="text-xl font-semibold">{t("Monthly statement")}</h1>
            <p className="font-mono text-muted">{st.number}</p>
            <p className="mt-1 text-ink-2">{t("Month: {m}", { m: month })}</p>
          </div>
        </header>
        <section className="mt-8 rounded-xl bg-paper p-4">
          <p className="text-[12px] text-muted">{t("For")}</p>
          <p className="font-medium">{m.legalName || m.name}</p>
          <p className="text-ink-2">{m.address}</p>
          {(m.nif || m.rc) && <p className="mt-1 text-[12px] text-muted">{[m.nif && `NIF ${m.nif}`, m.rc && `RC ${m.rc}`].filter(Boolean).join(" · ")}</p>}
        </section>
        <h2 className="mt-8 font-semibold">{t("Services")}</h2>
        <table className="mt-2 w-full">
          <tbody>
            {line(t("Deliveries"), String(st.delivered), st.deliveryFees)}
            {line(t("Returns"), String(st.returns), st.returnFees)}
            {line(t("Total fees"), "", st.feesTotal, true)}
          </tbody>
        </table>
        <h2 className="mt-8 font-semibold">{t("Your account")}</h2>
        <table className="mt-2 w-full">
          <tbody>
            {line(t("Balance at the start of the month"), "", st.opening)}
            {line(t("Cash collected for you"), "", st.codCollected)}
            {line(t("Fees"), "", -st.feesTotal)}
            {st.claims !== 0 && line(t("Claims paid to you"), "", st.claims)}
            {line(t("Paid out to you"), "", -st.payouts)}
            {line(t("Balance at the end of the month"), "", st.closing, true)}
          </tbody>
        </table>
        <p className="mt-8 text-[12px] text-muted">{t("Amounts in Algerian dinars. Fees are taken from the cash collected; nothing is due separately unless the closing balance is negative.")}</p>
      </article>
    </main>
  );
}
