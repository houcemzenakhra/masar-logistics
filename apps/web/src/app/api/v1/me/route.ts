import { auth, json, route } from "@/lib/api";

export const GET = route(async (req) => json({ user: await auth(req) }));
