import Link from "next/link";
import { dateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { getClaim, listClaims } from "@/server/services/claims";
import { Badge, Card, CardHeader, Money, Mono, Table, Td } from "./ui";

type Row = Awaited<ReturnType<typeof listClaims>>[number];
type Full = NonNullable<Awaited<ReturnType<typeof getClaim>>>;

export const CLAIM_KIND = { lost: "Lost", damaged: "Damaged", missing_items: "Items missing" } as const;
export const CLAIM_STATUS = { open: ["Under review", "warn"], approved: ["Approved", "success"], rejected: ["Declined", "danger"] } as const;

export const ClaimBadge = ({ status }: { status: Row["status"] }) => <Badge tone={CLAIM_STATUS[status][1]}>{t(CLAIM_STATUS[status][0])}</Badge>;

export function ClaimTable({ rows, base, showMerchant }: { rows: Row[]; base: string; showMerchant?: boolean }) {
  return (
    <Table head={["Claim", "Parcel", ...(showMerchant ? ["Merchant"] : []), "What happened", "Requested", "Status", "Filed"]} empty={rows.length === 0}>
      {rows.map((c) => (
        <tr key={c.id} className="hover:bg-paper/60">
          <Td><Link href={`${base}/${c.id}`} className="font-mono text-[13px] font-medium text-accent-deep hover:underline">{c.code}</Link></Td>
          <Td><Mono>{c.tracking}</Mono></Td>
          {showMerchant && <Td>{c.merchant}</Td>}
          <Td>{t(CLAIM_KIND[c.kind])}</Td>
          <Td><Money value={c.amountRequested} /></Td>
          <Td><ClaimBadge status={c.status} /></Td>
          <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(c.createdAt)}</Td>
        </tr>
      ))}
    </Table>
  );
}

export function ClaimSummary({ c, parcelHref }: { c: Full; parcelHref: string }) {
  return (
    <Card>
      <CardHeader title={c.code} action={<ClaimBadge status={c.status} />} />
      <div className="space-y-5 p-5">
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div><dt className="text-muted">{t("Parcel")}</dt><dd className="mt-1"><Link href={parcelHref} className="font-mono text-accent-deep hover:underline">{c.tracking}</Link></dd></div>
          <div><dt className="text-muted">{t("What happened")}</dt><dd className="mt-1 font-medium">{t(CLAIM_KIND[c.kind])}</dd></div>
          <div><dt className="text-muted">{t("Requested")}</dt><dd className="mt-1 font-medium"><Money value={c.amountRequested} /></dd></div>
          {c.amountApproved != null && <div><dt className="text-muted">{t("Paid")}</dt><dd className="mt-1 font-medium text-ok"><Money value={c.amountApproved} /></dd></div>}
          <div><dt className="text-muted">{t("Filed")}</dt><dd className="mt-1">{dateTime(c.createdAt)}</dd></div>
          {c.decidedAt && <div><dt className="text-muted">{t("Decided")}</dt><dd className="mt-1">{dateTime(c.decidedAt)}</dd></div>}
        </dl>
        <p dir="auto" className="whitespace-pre-line rounded-xl bg-paper p-4 text-[15px]">{c.description}</p>
        {c.photoIds.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {c.photoIds.map((id, i) => (
              <a key={id} href={`/api/v1/claims/${c.id}/photos/${id}`} target="_blank" className="block overflow-hidden rounded-xl ring-1 ring-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/v1/claims/${c.id}/photos/${id}`} alt={t("Photo {n}", { n: i + 1 })} className="h-32 w-auto object-cover" />
              </a>
            ))}
          </div>
        )}
        {c.decisionNote && (
          <div className="rounded-xl border border-line p-4 text-sm">
            <p className="text-muted">{t("Note from Masar")}</p>
            <p dir="auto" className="mt-1">{c.decisionNote}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
