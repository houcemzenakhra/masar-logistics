import { eq } from "drizzle-orm";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { users } from "@/server/schema";

export const GET = route(async (req) => {
  const s = await auth(req);
  const [u] = await (await getDb()).select({ phone: users.phone, lang: users.lang }).from(users).where(eq(users.id, s.userId));
  return json({ user: { ...s, phone: u?.phone ?? "", lang: u?.lang ?? "fr" } });
});
