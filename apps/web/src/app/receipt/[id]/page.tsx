import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Logo } from "@/components/ui";
import { dateTime, money } from "@/lib/format";
import { initLocale, t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { getHandover } from "@/server/services/money";

export const metadata = { title: "Cash receipt" };

/** Receipt for cash a courier handed in, signed on paper by both sides. */
export default async function Receipt({ params }: { params: Promise<{ id: string }> }) {
  await initLocale();
  const s = await requireRole("admin", "hub", "courier");
  const h = await getHandover(await getDb(), (await params).id);
  if (!h || (s.role === "courier" && h.courierId !== s.userId) || (s.role === "hub" && h.hubId !== s.hubId)) notFound();
  const row = (k: string, v: string, strong = false) => (
    <div className="flex justify-between gap-6 border-b border-dashed border-line py-2.5 text-[15px]">
      <span className="text-ink-2">{k}</span>
      <span className={`tnum text-end ${strong ? "font-semibold" : ""}`}>{v}</span>
    </div>
  );
  return (
    <main className="mx-auto max-w-md p-4 sm:p-8">
      <div className="no-print mb-4 flex justify-end"><PrintButton /></div>
      <article className="rounded-2xl bg-white p-6 ring-1 ring-line print:ring-0">
        <div className="flex items-start justify-between">
          <Logo />
          <div className="text-end">
            <p className="text-sm font-semibold">{t("Cash receipt")}</p>
            <p className="font-mono text-[13px] text-muted">{h.code}</p>
          </div>
        </div>
        <div className="mt-6">
          {row(t("Date"), dateTime(h.createdAt))}
          {row(t("Courier"), h.courier)}
          {h.hub && row(t("Hub"), t(h.hub))}
          {row(t("Should hand in"), `${money(h.expected)} ${t("DZD")}`)}
          {row(t("Counted"), `${money(h.counted)} ${t("DZD")}`, true)}
          {h.difference !== 0 && row(h.difference > 0 ? t("Missing") : t("Extra"), `${money(Math.abs(h.difference))} ${t("DZD")}`, true)}
          {h.note && row(t("Note"), h.note)}
          {row(t("Received by"), h.receivedByName)}
        </div>
        {h.difference > 0 && <p className="mt-4 rounded-xl bg-danger-soft p-3 text-sm text-danger">{t("The missing amount stays on the courier's account until it is repaid or settled.")}</p>}
        <div className="mt-10 grid grid-cols-2 gap-6 text-center text-[13px] text-muted">
          <div className="border-t border-ink/40 pt-2">{t("Courier's signature")}</div>
          <div className="border-t border-ink/40 pt-2">{t("Hub's signature")}</div>
        </div>
      </article>
    </main>
  );
}
