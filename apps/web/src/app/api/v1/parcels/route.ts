import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { STATUSES, type Status } from "@/server/domain/state";
import { DomainError, createParcel, listParcels } from "@/server/services/parcels";

export const GET = route(async (req) => {
  const s = await auth(req);
  const u = new URL(req.url);
  const status = u.searchParams.get("status")?.split(",").filter((x): x is Status => STATUSES.includes(x as Status));
  const parcels = await listParcels(await getDb(), {
    merchantId: s.role === "merchant" ? s.merchantId : u.searchParams.get("merchantId"),
    courierId: s.role === "courier" ? s.userId : undefined,
    status: status?.length ? status : undefined,
    search: u.searchParams.get("q") ?? undefined,
  });
  return json({ parcels });
});

const Body = z.object({
  merchantId: z.string().optional(),
  recipientName: z.string().trim().min(2),
  recipientPhone: z.string().trim().regex(/^0[5-7][\d ]{8,12}$/),
  destWilayaId: z.number().int().min(1).max(58),
  commune: z.string().trim().min(2),
  address: z.string().trim().min(4),
  description: z.string().trim().max(120).optional(),
  weightKg: z.number().min(0.1).max(70),
  codAmount: z.number().int().min(0).max(2_000_000),
});

export const POST = route(async (req) => {
  const s = await auth(req, "merchant", "admin");
  const b = Body.parse(await req.json());
  const merchantId = s.role === "merchant" ? s.merchantId! : b.merchantId;
  if (!merchantId) throw new DomainError("merchantId is required");
  const parcel = await createParcel(await getDb(), { ...b, weightKg: Math.ceil(b.weightKg), merchantId }, s);
  return json({ parcel }, 201);
});
