import Link from "next/link";
import { ago } from "@/lib/format";
import type { ParcelView } from "@/server/services/parcels";
import { Money, Mono, StatusBadge, Table, Td } from "./ui";

export function ParcelTable({ rows, base, showMerchant = false, select = false }: { rows: ParcelView[]; base: string; showMerchant?: boolean; select?: boolean }) {
  return (
    <Table
      empty={rows.length === 0}
      head={[...(select ? [""] : []), "Tracking", "Recipient", "Destination", ...(showMerchant ? ["Merchant"] : []), "COD", "Status", "Updated"]}
    >
      {rows.map((p) => (
        <tr key={p.id} className="hover:bg-paper/60">
          {select && (
            <Td className="w-8 pr-0">
              <input type="checkbox" name="ids" value={p.id} aria-label={`Select ${p.tracking}`} className="size-4 accent-[#ff5b24]" />
            </Td>
          )}
          <Td>
            <Link href={`${base}/${p.id}`} className="hover:text-accent-deep hover:underline"><Mono>{p.tracking}</Mono></Link>
          </Td>
          <Td className="whitespace-nowrap">
            <p className="font-medium">{p.recipientName}</p>
            <p className="text-[13px] text-muted">{p.recipientPhone}</p>
          </Td>
          <Td className="whitespace-nowrap">
            <p>{p.destWilaya}</p>
            <p className="text-[13px] text-muted">{p.commune}</p>
          </Td>
          {showMerchant && <Td className="text-ink-2">{p.merchantName}</Td>}
          <Td><Money value={p.codAmount} /></Td>
          <Td>
            <StatusBadge status={p.status} />
            {p.courierName && ["pickup_assigned", "out_for_delivery"].includes(p.status) && <p className="mt-1 text-[12px] text-muted">{p.courierName}</p>}
          </Td>
          <Td className="whitespace-nowrap text-[13px] text-muted">{ago(p.updatedAt)}</Td>
        </tr>
      ))}
    </Table>
  );
}
