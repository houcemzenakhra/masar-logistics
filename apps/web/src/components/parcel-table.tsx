import Link from "next/link";
import { ago } from "@/lib/format";
import { place, t } from "@/lib/i18n";
import type { ParcelView } from "@/server/services/parcels";
import { Money, Mono, StatusBadge, Table, Td } from "./ui";

const WITH_COURIER = ["pickup_assigned", "out_for_delivery"];

/**
 * A table on wide screens and a stack of cards on phones.
 * With `select`, rows carry a checkbox named `ids`, so only the table is rendered
 * (two copies of the same checkbox would both be submitted).
 */
export function ParcelTable({ rows, base, showMerchant = false, select = false }: { rows: ParcelView[]; base: string; showMerchant?: boolean; select?: boolean }) {
  return (
    <>
      {!select && (
        <ul className="divide-y divide-line md:hidden">
          {rows.map((p) => (
            <li key={p.id}>
              <Link href={`${base}/${p.id}`} className="block px-4 py-3.5 active:bg-paper">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.recipientName}</p>
                    <Mono>{p.tracking}</Mono>
                  </div>
                  <Money value={p.codAmount} className="text-sm font-semibold" />
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge status={p.status} />
                  <span className="text-[13px] text-muted">{place(p.destWilaya, p.destWilayaAr)} · {ago(p.updatedAt)}</span>
                </div>
              </Link>
            </li>
          ))}
          {rows.length === 0 && <li className="px-5 py-10 text-center text-sm text-muted">{t("Nothing here yet.")}</li>}
        </ul>
      )}
      <div className={select ? "" : "hidden md:block"}>
        <Table
          empty={rows.length === 0}
          head={[...(select ? [""] : []), "Tracking", "Recipient", "Destination", ...(showMerchant ? ["Merchant"] : []), "COD", "Status", "Updated"]}
        >
          {rows.map((p) => (
            <tr key={p.id} className="hover:bg-paper/60">
              {select && (
                <Td className="w-8 pe-0">
                  <input type="checkbox" name="ids" value={p.id} aria-label={t("Select {x}", { x: p.tracking })} className="size-4 accent-[#ff5b24]" />
                </Td>
              )}
              <Td>
                <Link href={`${base}/${p.id}`} className="hover:text-accent-deep hover:underline"><Mono>{p.tracking}</Mono></Link>
              </Td>
              <Td className="whitespace-nowrap">
                <p className="font-medium">{p.recipientName}</p>
                <p className="ltr text-[13px] text-muted">{p.recipientPhone}</p>
              </Td>
              <Td className="whitespace-nowrap">
                <p>{place(p.destWilaya, p.destWilayaAr)}</p>
                <p className="text-[13px] text-muted">{place(p.commune, p.communeAr)}</p>
              </Td>
              {showMerchant && <Td className="whitespace-nowrap text-ink-2">{p.merchantName}</Td>}
              <Td><Money value={p.codAmount} /></Td>
              <Td>
                <StatusBadge status={p.status} />
                {p.courierName && WITH_COURIER.includes(p.status) && <p className="mt-1 text-[12px] text-muted">{p.courierName}</p>}
              </Td>
              <Td className="whitespace-nowrap text-[13px] text-muted">{ago(p.updatedAt)}</Td>
            </tr>
          ))}
        </Table>
      </div>
    </>
  );
}
