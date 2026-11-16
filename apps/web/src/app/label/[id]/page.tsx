import bwipjs from "bwip-js/node";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Logo } from "@/components/ui";
import { money } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { getParcel } from "@/server/services/parcels";

export const metadata = { title: "Label" };

export default async function Label({ params }: { params: Promise<{ id: string }> }) {
  const s = await requireRole("merchant", "admin", "hub");
  const p = await getParcel(await getDb(), { id: (await params).id });
  if (!p || (s.role === "merchant" && p.merchantId !== s.merchantId)) notFound();
  const barcode = bwipjs.toSVG({ bcid: "code128", text: p.tracking, height: 16, scale: 3, includetext: false });
  return (
    <main className="mx-auto max-w-md p-4">
      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-sm text-muted">{t("Shipping label, 100 × 150 mm")}</p>
        <PrintButton />
      </div>
      {/* The label itself stays in French: it is read by couriers and hub staff across the network. */}
      <article dir="ltr" lang="fr" className="overflow-hidden rounded-xl border-2 border-ink bg-white text-ink">
        <header className="flex items-center justify-between border-b-2 border-ink px-4 py-3">
          <Logo />
          <span className="rounded-md bg-ink px-2.5 py-1 font-mono text-lg font-bold text-white">{String(p.destWilayaId).padStart(2, "0")}</span>
        </header>
        <section className="border-b-2 border-ink px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-muted">Destinataire</p>
          <p className="mt-1 text-xl font-bold leading-tight">{p.recipientName}</p>
          <p className="font-mono text-base font-semibold">{p.recipientPhone}</p>
          <p className="mt-1 text-sm">{p.address}</p>
          <p className="text-sm font-semibold">{p.commune}, {p.destWilaya}</p>
        </section>
        <section className="grid grid-cols-2 border-b-2 border-ink">
          <div className="border-r-2 border-ink px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">À encaisser</p>
            <p className="tnum mt-1 text-2xl font-bold">{money(p.codAmount)} <span className="text-sm">DZD</span></p>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] uppercase tracking-wide text-muted">Hub</p>
            <p className="mt-1 text-sm font-semibold">{p.destHub}</p>
            <p className="text-sm">{p.weightKg} kg · {p.description || "Colis"}</p>
          </div>
        </section>
        <section className="px-4 py-4 text-center">
          <div className="mx-auto max-w-[300px] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: barcode }} />
          <p className="mt-2 font-mono text-lg font-bold tracking-widest">{p.tracking}</p>
          <p className="mt-1 text-[11px] text-muted">Expéditeur : {p.merchantName}</p>
        </section>
      </article>
    </main>
  );
}
