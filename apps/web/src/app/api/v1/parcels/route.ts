import { z } from "zod";
import { auth, json, route } from "@/lib/api";
import { getDb } from "@/server/db";
import { normalizeMobile } from "@/server/phone";
import { STATUSES, type Status } from "@/server/domain/state";
import { listCommunes } from "@/server/services/directory";
import { matchCommune } from "@/server/services/imports";
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
    externalRef: u.searchParams.get("externalRef") ?? undefined,
  });
  return json({ parcels });
});

const Body = z.object({
  merchantId: z.string().optional(),
  recipientName: z.string().trim().min(2),
  recipientPhone: z.string().trim().refine((p) => normalizeMobile(p) !== null, "must be an Algerian mobile number"),
  recipientLang: z.enum(["fr", "ar"]).optional(),
  destWilayaId: z.number().int().min(1),
  /** Preferred: an id from GET /wilayas/:id/communes. */
  communeId: z.number().int().optional(),
  commune: z.string().trim().min(2).optional(),
  /** Required for home delivery; ignored for a stop desk (the desk's address is used). */
  address: z.string().trim().min(4).optional(),
  description: z.string().trim().max(120).optional(),
  weightKg: z.number().min(0.1).max(70),
  codAmount: z.number().int().min(0).max(2_000_000),
  /** `desk`: the recipient collects at `stopDeskId` (GET /desks?wilaya=). Default `home`. */
  deliveryType: z.enum(["home", "desk"]).optional(),
  stopDeskId: z.string().optional(),
  allowPartial: z.boolean().optional(),
  exchange: z.boolean().optional(),
  exchangeNote: z.string().trim().max(200).optional(),
  /** Your own order number. Sending the same one again answers 409 with the tracking number. */
  externalRef: z.string().trim().min(1).max(80).optional(),
  /** Outer size in cm. A large light parcel is charged by volume (L × W × H ÷ 5000 kg). */
  lengthCm: z.number().min(1).max(300).optional(),
  widthCm: z.number().min(1).max(300).optional(),
  heightCm: z.number().min(1).max(300).optional(),
}).refine((b) => b.deliveryType === "desk" || !!b.address, { message: "address is required for home delivery", path: ["address"] });

export const POST = route(async (req) => {
  const s = await auth(req, "merchant", "admin");
  const b = Body.parse(await req.json());
  const merchantId = s.role === "merchant" ? s.merchantId! : b.merchantId;
  if (!merchantId) throw new DomainError("merchantId is required");
  const db = await getDb();
  // A commune sent as text (shop plugins) is matched to the directory, so it lands on the map.
  let communeId = b.communeId;
  if (!communeId && b.commune) communeId = matchCommune(b.commune, (await listCommunes(db, b.destWilayaId)).map((c) => ({ ...c, wilayaId: b.destWilayaId }))).commune?.id;
  const parcel = await createParcel(db, { ...b, communeId, address: b.address ?? "", recipientPhone: normalizeMobile(b.recipientPhone)!, weightKg: Math.ceil(b.weightKg), merchantId }, s);
  return json({ parcel }, 201);
});
