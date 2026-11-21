import { timingSafeEqual } from "node:crypto";
import { apiSession } from "@/lib/session";
import { getDb } from "@/server/db";
import { runChecks } from "@/server/services/health";

export const dynamic = "force-dynamic";

const allowed = (got: string | null) => {
  const secret = process.env.CRON_SECRET;
  const want = `Bearer ${secret}`;
  return !!secret && !!got && got.length === want.length && timingSafeEqual(Buffer.from(got), Buffer.from(want));
};

/**
 * For uptime monitors: 200 when the database answers, 503 when it does not. The checks
 * themselves (counts of failing messages, stuck parcels…) are shown to operations and to callers
 * with `Authorization: Bearer $CRON_SECRET` only.
 */
export async function GET(req: Request) {
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev";
  try {
    const r = await runChecks(await getDb());
    const s = allowed(req.headers.get("authorization")) ? null : await apiSession(req).catch(() => null);
    const detail = allowed(req.headers.get("authorization")) || s?.role === "admin";
    return Response.json(
      { status: r.status, database: "ok", dbMs: r.dbMs, version, time: new Date().toISOString(), ...(detail ? { checks: r.checks } : {}) },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return Response.json({ status: "down", database: "unreachable", version, time: new Date().toISOString() }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
