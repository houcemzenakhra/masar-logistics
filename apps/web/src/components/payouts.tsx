import { dateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import type { listPayoutRequests } from "@/server/services/money";
import { Badge, Money, Mono, Table, Td } from "./ui";

export type PayoutRow = Awaited<ReturnType<typeof listPayoutRequests>>[number];
export const PAYOUT_STATUS = {
  requested: ["Waiting", "warn"],
  in_batch: ["In a transfer list", "info"],
  paid: ["Paid", "success"],
  rejected: ["Refused", "danger"],
  cancelled: ["Cancelled", "neutral"],
} as const;

export function PayoutTable({ rows, merchant, actions }: { rows: PayoutRow[]; merchant?: boolean; actions?: (r: PayoutRow) => React.ReactNode }) {
  return (
    <Table head={["Request", ...(merchant ? ["Merchant"] : []), "Amount", "To", "Status", "Requested", ...(actions ? [""] : [])]} empty={rows.length === 0}>
      {rows.map((r) => (
        <tr key={r.id}>
          <Td><Mono>{r.code}</Mono></Td>
          {merchant && <Td>{r.merchant}</Td>}
          <Td><Money value={r.amount} /></Td>
          <Td className="text-[13px]">
            <span className="font-medium">{r.method === "ccp" ? "CCP" : t("Bank")}</span> <bdi dir="ltr" className="tnum">{r.account}</bdi>
            <span className="block text-muted">{r.holder}</span>
          </Td>
          <Td>
            <Badge tone={PAYOUT_STATUS[r.status][1]}>{t(PAYOUT_STATUS[r.status][0])}</Badge>
            {r.note && <span className="mt-1 block max-w-56 text-[12px] text-muted">{r.note}</span>}
          </Td>
          <Td className="whitespace-nowrap text-[13px] text-muted">{dateTime(r.paidAt ?? r.createdAt)}</Td>
          {actions && <Td className="text-end">{actions(r)}</Td>}
        </tr>
      ))}
    </Table>
  );
}
