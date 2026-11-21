import { eq, inArray, sql } from "drizzle-orm";
import COMMUNES from "./data/communes.json";
import { hashPassword } from "./auth";
import type { DB } from "./db";
import type { Status } from "./domain/state";
import { communes, hubs, merchants, rateTiers, users, wilayas } from "./schema";
import { courierCash, handover, merchantOwed, payout } from "./services/ledger";
import { createParcel, transition, type Actor, type NewParcel } from "./services/parcels";
import { createDesk } from "./services/desks";
import { setConfirmOrders } from "./services/returns";
import { optimiseCourierRoute } from "./services/routes";

/** Password of the demo accounts on a local database. Deployed demos set MASAR_DEMO_PASSWORD instead. */
export const DEMO_PASSWORD = "masar-demo";

const HUBS = [
  { code: "ALG", name: "Algiers Hub", wilayaId: 16, address: "Zone industrielle Oued Smar, Alger" },
  { code: "ORN", name: "Oran Hub", wilayaId: 31, address: "Zone industrielle Es-Sénia, Oran" },
  { code: "CST", name: "Constantine Hub", wilayaId: 25, address: "Zone industrielle Palma, Constantine" },
  { code: "SET", name: "Sétif Hub", wilayaId: 19, address: "Zone industrielle, Sétif" },
  { code: "OUA", name: "Ouargla Hub", wilayaId: 30, address: "Zone d'activité, Ouargla" },
  { code: "BEC", name: "Béchar Hub", wilayaId: 8, address: "Zone d'activité, Béchar" },
];

// id, name, Arabic name, pricing zone (1 north, 2 highlands, 3 south), serving hub
const WILAYAS: [number, string, string, number, string][] = [
  [1, "Adrar", "أدرار", 3, "BEC"], [2, "Chlef", "الشلف", 1, "ALG"], [3, "Laghouat", "الأغواط", 2, "OUA"],
  [4, "Oum El Bouaghi", "أم البواقي", 2, "CST"], [5, "Batna", "باتنة", 2, "CST"], [6, "Béjaïa", "بجاية", 1, "SET"],
  [7, "Biskra", "بسكرة", 2, "CST"], [8, "Béchar", "بشار", 3, "BEC"], [9, "Blida", "البليدة", 1, "ALG"],
  [10, "Bouira", "البويرة", 1, "ALG"], [11, "Tamanrasset", "تمنراست", 3, "OUA"], [12, "Tébessa", "تبسة", 2, "CST"],
  [13, "Tlemcen", "تلمسان", 1, "ORN"], [14, "Tiaret", "تيارت", 2, "ORN"], [15, "Tizi Ouzou", "تيزي وزو", 1, "ALG"],
  [16, "Alger", "الجزائر", 1, "ALG"], [17, "Djelfa", "الجلفة", 2, "ALG"], [18, "Jijel", "جيجل", 1, "SET"],
  [19, "Sétif", "سطيف", 2, "SET"], [20, "Saïda", "سعيدة", 2, "ORN"], [21, "Skikda", "سكيكدة", 1, "CST"],
  [22, "Sidi Bel Abbès", "سيدي بلعباس", 1, "ORN"], [23, "Annaba", "عنابة", 1, "CST"], [24, "Guelma", "قالمة", 1, "CST"],
  [25, "Constantine", "قسنطينة", 1, "CST"], [26, "Médéa", "المدية", 1, "ALG"], [27, "Mostaganem", "مستغانم", 1, "ORN"],
  [28, "M'Sila", "المسيلة", 2, "SET"], [29, "Mascara", "معسكر", 1, "ORN"], [30, "Ouargla", "ورقلة", 3, "OUA"],
  [31, "Oran", "وهران", 1, "ORN"], [32, "El Bayadh", "البيض", 2, "ORN"], [33, "Illizi", "إليزي", 3, "OUA"],
  [34, "Bordj Bou Arréridj", "برج بوعريريج", 2, "SET"], [35, "Boumerdès", "بومرداس", 1, "ALG"], [36, "El Tarf", "الطارف", 1, "CST"],
  [37, "Tindouf", "تندوف", 3, "BEC"], [38, "Tissemsilt", "تيسمسيلت", 2, "ALG"], [39, "El Oued", "الوادي", 3, "OUA"],
  [40, "Khenchela", "خنشلة", 2, "CST"], [41, "Souk Ahras", "سوق أهراس", 1, "CST"], [42, "Tipaza", "تيبازة", 1, "ALG"],
  [43, "Mila", "ميلة", 1, "CST"], [44, "Aïn Defla", "عين الدفلى", 1, "ALG"], [45, "Naâma", "النعامة", 2, "BEC"],
  [46, "Aïn Témouchent", "عين تموشنت", 1, "ORN"], [47, "Ghardaïa", "غرداية", 3, "OUA"], [48, "Relizane", "غليزان", 1, "ORN"],
  [49, "Timimoun", "تيميمون", 3, "BEC"], [50, "Bordj Badji Mokhtar", "برج باجي مختار", 3, "BEC"], [51, "Ouled Djellal", "أولاد جلال", 2, "CST"],
  [52, "Béni Abbès", "بني عباس", 3, "BEC"], [53, "In Salah", "عين صالح", 3, "OUA"], [54, "In Guezzam", "عين قزام", 3, "OUA"],
  [55, "Touggourt", "تقرت", 3, "OUA"], [56, "Djanet", "جانت", 3, "OUA"], [57, "El M'Ghair", "المغير", 3, "OUA"],
  [58, "El Meniaa", "المنيعة", 3, "OUA"],
  // Wilayas created in 2025.
  [59, "Aflou", "آفلو", 2, "OUA"], [60, "Barika", "بريكة", 2, "CST"], [61, "El Kantara", "القنطرة", 2, "CST"],
  [62, "Bir El Ater", "بئر العاتر", 2, "CST"], [63, "El Aricha", "العريشة", 2, "ORN"], [64, "Ksar Chellala", "قصر الشلالة", 2, "ORN"],
  [65, "Aïn Ouessara", "عين وسارة", 2, "ALG"], [66, "Messaad", "مسعد", 2, "ALG"], [67, "Ksar El Boukhari", "قصر البخاري", 2, "ALG"],
  [68, "Bou Saâda", "بوسعادة", 2, "SET"], [69, "El Abiodh Sidi Cheikh", "الأبيض سيدي الشيخ", 2, "ORN"],
];

export const WILAYA_COUNT = WILAYAS.length;
// Commune where each hub sits (the wilaya's capital commune).
const HUB_COMMUNE: Record<string, number> = { ALG: 1601, ORN: 3101, CST: 2501, SET: 1901, OUA: 3001, BEC: 801 };
type CommuneRow = [number, number, string, string, number, number];

const TIERS = [
  { key: "local" as const, label: "Same wilaya", base: 400, perExtraKg: 50, returnFee: 200 },
  { key: "north" as const, label: "North", base: 600, perExtraKg: 50, returnFee: 250 },
  { key: "highlands" as const, label: "Highlands", base: 750, perExtraKg: 70, returnFee: 300 },
  { key: "south" as const, label: "South", base: 1100, perExtraKg: 100, returnFee: 400 },
];

/**
 * Reference data every installation needs: hubs, wilayas, communes and rates.
 * Safe to run again: it only adds what is missing, so older databases pick up new wilayas and communes.
 */
export async function seedReference(db: DB) {
  await db.insert(hubs).values(HUBS).onConflictDoNothing({ target: hubs.code });
  const hubRows = await db.select().from(hubs).where(inArray(hubs.code, HUBS.map((h) => h.code)));
  const hubId = Object.fromEntries(hubRows.map((h) => [h.code, h.id]));
  await db
    .insert(wilayas)
    .values(WILAYAS.map(([id, name, nameAr, zone, hub]) => ({ id, name, nameAr, zone, hubId: hubId[hub] })))
    .onConflictDoNothing({ target: wilayas.id });
  await db.insert(rateTiers).values(TIERS).onConflictDoNothing({ target: rateTiers.key });

  const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(communes);
  const rows = COMMUNES as CommuneRow[];
  if (n < rows.length) {
    for (let i = 0; i < rows.length; i += 500) {
      await db
        .insert(communes)
        .values(rows.slice(i, i + 500).map(([id, wilayaId, name, nameAr, lat, lng]) => ({ id, wilayaId, name, nameAr, lat, lng })))
        .onConflictDoNothing({ target: communes.id });
    }
  }
  for (const h of hubRows) {
    const c = rows.find((r) => r[0] === HUB_COMMUNE[h.code]);
    if (c && h.lat === null) await db.update(hubs).set({ lat: c[4], lng: c[5] }).where(eq(hubs.id, h.id));
  }
  return hubId;
}

const NAMES = ["Amine Benali", "Yasmine Cherif", "Karim Mansouri", "Lina Haddad", "Sofiane Brahimi", "Nour Belkacem", "Rania Saadi", "Walid Ziani", "Imane Khelifi", "Mehdi Bouzid", "Sara Ferhat", "Anis Meziane"];
const GOODS = ["Phone case", "Sneakers", "Perfume", "Kitchen set", "Handbag", "Headphones", "Books", "Kids clothing", "Watch", "Cosmetics"];
const DESTS = [16, 16, 16, 9, 35, 15, 31, 25, 19, 6, 23, 30, 47, 13, 5, 8];

/**
 * Reference data plus demo accounts and parcels, pushed through the real services.
 * Runs in one transaction, so a failure leaves no half-seeded database behind.
 */
export async function seed(root: DB, password = DEMO_PASSWORD) {
  const [{ n }] = await root.select({ n: sql<number>`count(*)::int` }).from(users);
  const hubId = await seedReference(root);
  if (n > 0) return;
  await root.transaction((tx) => seedDemo(tx as unknown as DB, hubId, password));
}

/** Reference data plus one operations account, for a real installation with no demo data. */
export async function seedProduction(root: DB, admin: { email: string; password: string; name?: string }) {
  await seedReference(root);
  const [{ n }] = await root.select({ n: sql<number>`count(*)::int` }).from(users);
  if (n > 0) return false;
  await root.insert(users).values({ name: admin.name ?? "Operations", email: admin.email.trim().toLowerCase(), role: "admin", passwordHash: await hashPassword(admin.password) });
  return true;
}

async function seedDemo(db: DB, hubId: Record<string, string>, password: string) {
  const byWilaya = new Map<number, number[]>();
  for (const [id, w] of COMMUNES as CommuneRow[]) byWilaya.set(w, [...(byWilaya.get(w) ?? []), id]);
  const pw = await hashPassword(password);

  const [m1, m2] = await db
    .insert(merchants)
    .values([
      { name: "Dar El Moda", phone: "0550 12 34 56", wilayaId: 16, address: "12 rue Didouche Mourad, Alger" },
      { name: "TechZone DZ", phone: "0661 98 76 54", wilayaId: 16, address: "Cité 5 Juillet, Bab Ezzouar" },
    ])
    .returning();

  const [admin, hubUser, c1, c2] = await db
    .insert(users)
    .values([
      { name: "Sem Admin", email: "admin@masar.dz", role: "admin", passwordHash: pw },
      { name: "Farid Hub", email: "hub@masar.dz", role: "hub", hubId: hubId.ALG, passwordHash: pw },
      { name: "Riad Courier", email: "courier@masar.dz", phone: "0770 11 22 33", role: "courier", hubId: hubId.ALG, passwordHash: pw },
      { name: "Hakim Courier", email: "courier2@masar.dz", phone: "0771 44 55 66", role: "courier", hubId: hubId.ALG, passwordHash: pw },
      { name: "Dar El Moda", email: "merchant@masar.dz", role: "merchant", merchantId: m1.id, passwordHash: pw },
      { name: "TechZone DZ", email: "merchant2@masar.dz", role: "merchant", merchantId: m2.id, passwordHash: pw },
    ])
    .returning();
  // One courier at each of the other hubs, so parcels are delivered by someone local.
  const regional = await db
    .insert(users)
    .values(
      [["ORN", "Samir Oran"], ["CST", "Walid Constantine"], ["SET", "Nabil Sétif"], ["OUA", "Tarek Ouargla"], ["BEC", "Omar Béchar"]].map(([code, name], i) => ({
        name,
        email: `courier.${code.toLowerCase()}@masar.dz`,
        phone: `077${i} 20 30 4${i}`,
        role: "courier" as const,
        hubId: hubId[code],
        passwordHash: pw,
      })),
    )
    .returning();
  const localCourier = Object.fromEntries(regional.map((u) => [u.hubId!, u.id]));

  const A: Actor = { userId: admin.id, role: "admin", merchantId: null, hubId: null };
  const H: Actor = { userId: hubUser.id, role: "hub", merchantId: null, hubId: hubId.ALG };
  const courier = (id: string): Actor => ({ userId: id, role: "courier", merchantId: null, hubId: null });

  // How far along each demo parcel gets.
  const STAGES: Status[] = ["created", "pickup_assigned", "picked_up", "at_origin_hub", "in_transit", "at_destination_hub", "out_for_delivery", "delivered", "delivered", "delivered", "delivered", "attempt_failed", "returned"];
  const HOUR = 3600_000;

  for (let i = 0; i < 46; i++) {
    const merchant = i % 3 === 0 ? m2 : m1;
    const dest = DESTS[i % DESTS.length];
    const stage = STAGES[i % STAGES.length];
    const daysAgo = stage === "created" ? i % 2 : 1 + (i % 13);
    let t = Date.now() - daysAgo * 24 * HOUR - (i % 7) * HOUR;
    const step = () => new Date((t = Math.min(t + (2 + (i % 5)) * HOUR, Date.now() - 60_000)));
    const cid = i % 2 ? c1.id : c2.id;

    const p = await createParcel(
      db,
      {
        merchantId: merchant.id,
        recipientName: NAMES[i % NAMES.length],
        recipientPhone: `05${String(50 + (i % 40))} ${String(10 + i).padStart(2, "0")} ${String(20 + ((i * 7) % 70)).padStart(2, "0")} ${String(11 + ((i * 3) % 80)).padStart(2, "0")}`,
        destWilayaId: dest,
        communeId: byWilaya.get(dest)![(i * 3) % byWilaya.get(dest)!.length],
        address: `${3 + i} cité ${["des Roses", "El Amel", "du 1er Novembre", "En-Nasr"][i % 4]}`,
        description: GOODS[i % GOODS.length],
        weightKg: 1 + (i % 8),
        codAmount: i % 9 === 4 ? 0 : 1800 + ((i * 650) % 9000),
      },
      A,
      new Date(t),
    );
    const go = (to: Status, actor: Actor, extra: { courierId?: string; note?: string } = {}) =>
      transition(db, { parcelId: p.id, to, actor, at: step(), ...extra });
    const sameHub = p.originHubId === p.destHubId;
    // Picked up by an Algiers courier, delivered by the courier of the destination hub.
    const did = sameHub ? cid : localCourier[p.destHubId];

    const path: (() => Promise<unknown>)[] = [
      () => go("pickup_assigned", A, { courierId: cid }),
      () => go("picked_up", courier(cid)),
      () => go("at_origin_hub", H),
      ...(sameHub ? [] : [() => go("in_transit", H), () => go("at_destination_hub", H)]),
      () => go("out_for_delivery", A, { courierId: did }),
    ];
    const reach: Partial<Record<Status, number>> = { created: 0, pickup_assigned: 1, picked_up: 2, at_origin_hub: 3, in_transit: sameHub ? 3 : 4, at_destination_hub: sameHub ? 3 : 5 };
    const upTo = reach[stage] ?? path.length;
    for (const f of path.slice(0, upTo)) await f();
    if (upTo < path.length) continue;

    if (stage === "delivered") await go("delivered", courier(did));
    if (stage === "attempt_failed") await go("attempt_failed", courier(did), { note: "Recipient not answering" });
    if (stage === "returned") {
      await go("attempt_failed", courier(did), { note: "Refused: changed their mind" });
      await go("return_initiated", A);
      await go("returned", H);
    }
  }

  // Stop desks with a parcel on the shelf and one just arrived; TechZone asks recipients to
  // confirm orders (one is waiting); an exchange and an order open to partial delivery are out.
  const desks = [];
  for (const d of [
    { name: "Masar Bab Ezzouar", wilayaId: 16, address: "Centre commercial Bab Ezzouar, niveau 0", hours: "Sam-Jeu 9:00-19:00", phone: "0550 40 50 60" },
    { name: "Masar Oran Centre", wilayaId: 31, address: "Boulevard de la Soummam, Oran", hours: "Sam-Jeu 9:00-18:00" },
    { name: "Masar Constantine", wilayaId: 25, address: "Rue Abane Ramdane, Constantine", hours: "Sam-Jeu 8:30-17:30" },
  ])
    desks.push(await createDesk(db, { ...d, communeId: byWilaya.get(d.wilayaId)![0] }));
  const extra = async (x: Partial<NewParcel> & { merchantId: string }, i: number) =>
    createParcel(db, { recipientName: NAMES[i % NAMES.length], recipientPhone: `0661 ${String(30 + i)} 45 ${String(10 + i)}`, destWilayaId: 16, communeId: byWilaya.get(16)![i % 20], address: `${10 + i} rue Hassiba Ben Bouali`, description: GOODS[i % GOODS.length], weightKg: 1, codAmount: 3200 + i * 450, ...x }, A);
  const run = async (id: string, to: Status[], cid = c1.id) => {
    for (const s of to) await transition(db, { parcelId: id, to: s, actor: s === "picked_up" ? courier(cid) : s === "at_origin_hub" || s === "ready_for_pickup" ? H : A, courierId: s === "pickup_assigned" || s === "out_for_delivery" ? cid : undefined });
  };
  const shelf = await extra({ merchantId: m1.id, deliveryType: "desk", stopDeskId: desks[0].id }, 1);
  await run(shelf.id, ["pickup_assigned", "picked_up", "at_origin_hub", "ready_for_pickup"]);
  const arrived = await extra({ merchantId: m2.id, deliveryType: "desk", stopDeskId: desks[0].id }, 2);
  await run(arrived.id, ["pickup_assigned", "picked_up", "at_origin_hub"]);
  const swap = await extra({ merchantId: m1.id, exchange: true, exchangeNote: "Robe bleue taille M (mauvaise taille)" }, 3);
  await run(swap.id, ["pickup_assigned", "picked_up", "at_origin_hub", "out_for_delivery"]);
  const part = await extra({ merchantId: m1.id, allowPartial: true, description: "3 articles: robe, foulard, sac" }, 4);
  await run(part.id, ["pickup_assigned", "picked_up", "at_origin_hub", "out_for_delivery"], c2.id);
  await setConfirmOrders(db, m2.id, true);
  await extra({ merchantId: m2.id, description: "Casque Bluetooth" }, 5);

  // Half of the cash each Algiers courier collected has been handed over, and one merchant paid once.
  let banked = 0;
  for (const c of [c1, c2]) {
    const half = Math.floor((await courierCash(db, c.id)) / 2000) * 1000;
    if (half > 0) {
      await handover(db, { courierId: c.id, amount: half, by: admin.id });
      banked += half;
    }
  }
  const pay = Math.min(banked, Math.floor((await merchantOwed(db, m1.id)) / 2000) * 1000);
  if (pay > 0) await payout(db, { merchantId: m1.id, amount: pay, by: admin.id });
  await optimiseCourierRoute(db, c1.id);
  await optimiseCourierRoute(db, c2.id);
}
