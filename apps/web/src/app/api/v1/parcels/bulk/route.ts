import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { checkRecords } from "@/server/services/imports";
import { DomainError, createParcel } from "@/server/services/parcels";

export const maxDuration = 60;

const Order = z.object({
  name: z.string(),
  phone: z.union([z.string(), z.number()]),
  wilaya: z.union([z.string(), z.number()]),
  commune: z.string(),
  address: z.string(),
  cod: z.union([z.string(), z.number()]),
  weight: z.union([z.string(), z.number()]).optional(),
  contents: z.string().optional(),
  lang: z.enum(["fr", "ar"]).optional(),
});
const Body = z.object({ orders: z.array(Order).min(1).max(1000), dryRun: z.boolean().default(false) });

/**
 * Creates many orders in one call, all or nothing. Wilaya and commune are matched by code or name,
 * as in spreadsheet imports. With `dryRun`, or when any order has an error, nothing is created
 * and every order's check result is returned.
 */
export const POST = route(async (req) => {
  const s = await auth(req, "merchant");
  const b = Body.parse(await req.json());
  const db = await getDb();
  const records = b.orders.map((o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v == null ? "" : String(v)])));
  const rows = await checkRecords(db, s.merchantId!, records, 1);
  const results = rows.map((r) => ({ index: r.line - 1, ok: r.values !== null, errors: r.errors, warnings: r.warnings, deliveryFee: r.shown?.fee }));
  const invalid = results.filter((r) => !r.ok).length;
  if (b.dryRun || invalid > 0) return json({ created: [], invalid, results }, invalid > 0 ? 422 : 200);
  const created = await db.transaction(async (tx) => {
    const out = [];
    for (const r of rows) out.push(await createParcel(tx, { ...r.values!, merchantId: s.merchantId! }, s));
    return out;
  });
  if (created.length !== rows.length) throw new DomainError("Not every order was created");
  return json({ created: created.map((p) => ({ id: p.id, tracking: p.tracking, deliveryFee: p.deliveryFee })), invalid: 0, results }, 201);
});
