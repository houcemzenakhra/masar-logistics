import { getDb } from "@/server/db";
import { requireRole } from "@/lib/session";
import { batchCsv, getBatch } from "@/server/services/money";

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  await requireRole("admin");
  const db = await getDb();
  const b = await getBatch(db, (await ctx.params).id);
  if (!b) return new Response("Not found", { status: 404 });
  // A byte-order mark so Excel opens the accented names correctly.
  return new Response("﻿" + (await batchCsv(db, b.id)), {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename="${b.code}.csv"`, "cache-control": "no-store" },
  });
}
