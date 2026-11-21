import { and, desc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import Papa from "papaparse";
import { readSheet } from "read-excel-file/node";
import type { Q } from "../db";
import { quote, tierFor } from "../domain/pricing";
import { normalizeMobile } from "../phone";
import { communes, importBatches, merchants, parcels, rateTiers, wilayas } from "../schema";
import { DomainError, createParcel, type Actor } from "./parcels";

/**
 * Bulk orders from a spreadsheet. A file is read and every row checked first; the merchant sees
 * the result and confirms, and only then are the valid rows created, in one transaction.
 */

export const MAX_ROWS = 1000;
export const MAX_BYTES = 2 * 1024 * 1024;

/** A message with its variables, translated when shown. */
export type Msg = { m: string; v?: Record<string, string | number> };

export type RowValues = {
  recipientName: string;
  recipientPhone: string;
  destWilayaId: number;
  communeId: number;
  address: string;
  codAmount: number;
  weightKg: number;
  description?: string;
  recipientLang: "fr" | "ar";
  /** The shop's order number, from a "ref" or "order" column. */
  externalRef?: string;
};

export type CheckedRow = {
  /** Line number in the file, counting the header as line 1. */
  line: number;
  /** What the file said, to show next to the problems. */
  raw: { name: string; phone: string; wilaya: string; commune: string; cod: string };
  values: RowValues | null;
  /** For the preview: resolved names and the delivery fee. */
  shown?: { wilaya: string; commune: string; fee: number };
  errors: Msg[];
  warnings: Msg[];
};

// ---------- reading files ----------

export const FIELDS = ["name", "phone", "wilaya", "commune", "address", "cod", "weight", "contents", "lang", "ref", "paid"] as const;
type Field = (typeof FIELDS)[number];
export const REQUIRED: Field[] = ["name", "phone", "wilaya", "commune", "address", "cod"];

/** Column titles we recognise, in English, French and Arabic, after `norm()`. */
const ALIASES: Record<Field, string[]> = {
  name: ["name", "recipient", "recipient name", "recipient_name", "customer", "client", "nom", "nom client", "nom du client", "destinataire", "nom du destinataire", "nom et prenom", "الاسم", "المستلم", "اسم المستلم", "الزبون", "اسم الزبون"],
  phone: ["phone", "recipient phone", "recipient_phone", "mobile", "tel", "telephone", "numero", "numero de telephone", "gsm", "الهاتف", "رقم الهاتف", "الجوال"],
  wilaya: ["wilaya", "wilaya code", "code wilaya", "state", "province", "الولاية", "ولاية"],
  commune: ["commune", "city", "ville", "baladia", "البلدية", "بلدية"],
  address: ["address", "adresse", "street", "rue", "العنوان"],
  cod: ["cod", "cod amount", "cod_amount", "amount", "price", "total", "montant", "prix", "a encaisser", "montant a encaisser", "المبلغ", "السعر", "المبلغ المطلوب"],
  weight: ["weight", "weight kg", "weight_kg", "kg", "poids", "poids kg", "الوزن"],
  contents: ["contents", "description", "product", "products", "item", "produit", "produits", "article", "contenu", "المحتوى", "المنتج"],
  lang: ["lang", "language", "langue", "sms", "sms language", "langue sms", "اللغة"],
  ref: ["ref", "reference", "order", "order id", "order number", "order ref", "order reference", "order reference number", "commande", "n commande", "no commande", "numero de commande", "reference commande", "id commande", "رقم الطلب", "مرجع الطلب", "المرجع"],
  /** A payment status column: an order marked paid is not collected again. */
  paid: ["payment status", "financial status", "statut de paiement", "statut paiement", "paiement", "حاله الدفع"],
};
// Shop exports (YouCan and the like) name these differently.
ALIASES.name.push("customer name", "full name", "nom complet", "client name", "shipping name");
ALIASES.phone.push("customer phone", "phone number", "telephone client", "telephone du client", "shipping phone", "هاتف الزبون");
ALIASES.address.push("shipping address", "adresse de livraison", "adresse livraison", "عنوان التوصيل");
ALIASES.cod.push("order total", "total commande", "montant total", "total price", "المجموع");
ALIASES.contents.push("product names and skus", "product name", "products names", "nom du produit", "produits commandes");
ALIASES.wilaya.push("region", "region name", "shipping province name", "shipping province");
ALIASES.commune.push("shipping city", "localite");

const PAID = ["paid", "payee", "paye", "refunded", "rembourse", "مدفوع", "مدفوعه"];

/** Lower case, accents and Arabic diacritics removed, punctuation turned into spaces. */
export function norm(s: unknown): string {
  return String(s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .toLowerCase()
    .replace(/['’`´\-_.,/()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function readRows(file: { name: string; bytes: Buffer }): Promise<string[][]> {
  if (file.bytes.length > MAX_BYTES) throw new DomainError("The file is larger than 2 MB. Split it into smaller files.");
  const lower = file.name.toLowerCase();
  let rows: unknown[][];
  if (lower.endsWith(".xlsx")) {
    try {
      rows = (await readSheet(file.bytes)) as unknown[][];
    } catch {
      throw new DomainError("This Excel file could not be read. Save it again as .xlsx or .csv and retry.");
    }
  } else if (lower.endsWith(".csv") || lower.endsWith(".txt")) {
    const text = file.bytes.toString("utf8").replace(/^﻿/, "");
    rows = Papa.parse<string[]>(text, { skipEmptyLines: "greedy", delimitersToGuess: [",", ";", "\t", "|"] }).data;
  } else {
    throw new DomainError("Upload a .csv or .xlsx file.");
  }
  return rows.map((r) => r.map((c) => (c == null ? "" : c instanceof Date ? c.toISOString().slice(0, 10) : String(c).trim())));
}

/** Finds which column holds which field. Unknown columns are ignored. */
export function mapHeader(header: string[]): { map: Partial<Record<Field, number>>; missing: Field[] } {
  const map: Partial<Record<Field, number>> = {};
  header.forEach((h, i) => {
    const n = norm(h);
    const f = FIELDS.find((k) => ALIASES[k].some((a) => norm(a) === n));
    if (f && map[f] === undefined) map[f] = i;
  });
  // Without wilaya and commune columns, both are read from the address (shop exports keep the
  // whole address in one column). Rows where that fails are shown to fix.
  const fromAddress: Field[] = map.address !== undefined ? ["wilaya", "commune"] : [];
  return { map, missing: REQUIRED.filter((f) => map[f] === undefined && !fromAddress.includes(f)) };
}

/**
 * Shopify's order export: "Name" is the order number, the recipient is "Shipping Name", and an
 * order with several products takes several rows, the later ones mostly empty.
 */
export function shopifyRecords(table: string[][]): Partial<Record<Field, string>>[] | null {
  const head = table[0].map(norm);
  const col = (...names: string[]) => names.map((n) => head.indexOf(norm(n))).find((i) => i >= 0) ?? -1;
  if (col("lineitem name") < 0 || col("shipping name") < 0 || col("name") < 0) return null;
  const at = (r: string[], ...names: string[]) => {
    for (const n of names) {
      const i = col(n);
      if (i >= 0 && (r[i] ?? "").trim()) return r[i].trim();
    }
    return "";
  };
  const orders = new Map<string, { rec: Partial<Record<Field, string>>; items: string[] }>();
  for (const r of table.slice(1)) {
    const ref = at(r, "name");
    if (!ref) continue;
    const item = at(r, "lineitem name");
    const qty = at(r, "lineitem quantity");
    const line = item ? (qty && qty !== "1" ? `${qty} × ${item}` : item) : "";
    const o = orders.get(ref);
    if (o) {
      if (line) o.items.push(line);
      continue;
    }
    const paidStatus = norm(at(r, "financial status"));
    const outstanding = at(r, "outstanding balance");
    const cod = ["paid", "refunded", "partially refunded"].includes(paidStatus) ? "0" : outstanding || at(r, "total");
    orders.set(ref, {
      rec: {
        ref,
        name: at(r, "shipping name", "billing name"),
        phone: at(r, "shipping phone", "phone", "billing phone"),
        wilaya: at(r, "shipping province name", "shipping province").replace(/^dz[-\s]?/i, ""),
        commune: at(r, "shipping city"),
        address: [at(r, "shipping address1"), at(r, "shipping address2")].filter(Boolean).join(", ") || at(r, "shipping street"),
        cod,
      },
      items: line ? [line] : [],
    });
  }
  return [...orders.values()].map(({ rec, items }) => ({ ...rec, contents: items.join("; ") }));
}

/**
 * Finds the wilaya and commune named in a free-text address, longest name first. A commune name
 * found alone settles the wilaya too when only one wilaya has a commune of that name.
 */
export function guessPlace(address: string, ref: Pick<Ref, "wilayas" | "communes">): { wilaya?: W; commune?: C } {
  const text = ` ${norm(address)} `;
  const has = (name: string) => {
    const n = norm(name);
    return n.length >= 3 && text.includes(` ${n} `);
  };
  const wilayaHits = ref.wilayas
    .flatMap((w) => [w.name, w.nameAr, ...Object.entries(WILAYA_ALT).filter(([, id]) => id === w.id).map(([k]) => k)].filter(has).map((n) => ({ w, len: norm(n).length })))
    .sort((a, b) => b.len - a.len);
  let wilaya: W | undefined = wilayaHits[0]?.w;
  const pool = wilaya ? ref.communes.filter((c) => c.wilayaId === wilaya!.id) : ref.communes;
  const communeHits = pool
    .flatMap((c) => [c.name, c.nameAr].filter(has).map((n) => ({ c, len: norm(n).length })))
    .sort((a, b) => b.len - a.len);
  let commune: C | undefined = communeHits[0]?.c;
  if (!wilaya && commune) {
    const sameName = communeHits.filter((h) => h.len === communeHits[0].len && h.c.wilayaId !== commune!.wilayaId);
    if (sameName.length) commune = undefined;
    else wilaya = ref.wilayas.find((w) => w.id === commune!.wilayaId);
  }
  // Only the wilaya named: its commune of the same name (the wilaya's seat), when there is one.
  if (wilaya && !commune) commune = ref.communes.find((c) => c.wilayaId === wilaya!.id && norm(c.name) === norm(wilaya!.name));
  return { wilaya, commune };
}

// ---------- matching places ----------

type W = { id: number; name: string; nameAr: string; zone: number; hubId: string };
type C = { id: number; wilayaId: number; name: string; nameAr: string };

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

/** Common spellings that differ from the directory's names. */
const WILAYA_ALT: Record<string, number> = { algiers: 16, alger: 16, algeria: 16, dzair: 16, wahran: 31, bejaia: 6, bougie: 6, "tizi ouzou": 15, annaba: 23, bone: 23, constantine: 25, qacentina: 25, blida: 9 };

export function matchWilaya(input: string, list: W[]): W | null {
  const n = norm(input).replace(/^(wilaya|ولايه|الولايه)\s+/, "");
  const num = Number(n.replace(/^0+/, ""));
  if (/^\d{1,2}$/.test(n) && num >= 1) return list.find((w) => w.id === num) ?? null;
  const code = /^(\d{1,2})\s/.exec(n);
  if (code) return list.find((w) => w.id === Number(code[1])) ?? null;
  const byName = list.find((w) => norm(w.name) === n || norm(w.nameAr) === n);
  if (byName) return byName;
  if (WILAYA_ALT[n]) return list.find((w) => w.id === WILAYA_ALT[n]) ?? null;
  return null;
}

/** Exact name first, then a close spelling (at most two letters off) if only one commune is that close. */
export function matchCommune(input: string, list: C[]): { commune: C | null; corrected: boolean; suggestion?: C } {
  const n = norm(input);
  const squash = (s: string) => norm(s).replace(/\s/g, "");
  const exact = list.find((c) => norm(c.name) === n || norm(c.nameAr) === n || squash(c.name) === n.replace(/\s/g, ""));
  if (exact) return { commune: exact, corrected: false };
  const scored = list
    .map((c) => ({ c, d: Math.min(distance(n, norm(c.name)), distance(n, norm(c.nameAr))) }))
    .sort((a, b) => a.d - b.d);
  const best = scored[0];
  if (best && best.d <= 2 && n.length >= 4 && (scored[1]?.d ?? 99) > best.d) return { commune: best.c, corrected: true };
  return { commune: null, corrected: false, suggestion: best && best.d <= 4 ? best.c : undefined };
}

// ---------- checking rows ----------

function money(s: string): number | null {
  const v = s.replace(/\s|da|dzd|دج|,(?=\d{3}\b)/gi, "").replace(",", ".");
  if (v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type Ref = { wilayas: W[]; communes: C[]; tiers: (typeof rateTiers.$inferSelect)[]; origin: W };

export async function loadRef(q: Q, merchantId: string): Promise<Ref> {
  const [m] = await q.select().from(merchants).where(eq(merchants.id, merchantId));
  if (!m) throw new DomainError("Unknown merchant");
  const [ws, cs, tiers] = await Promise.all([
    q.select({ id: wilayas.id, name: wilayas.name, nameAr: wilayas.nameAr, zone: wilayas.zone, hubId: wilayas.hubId }).from(wilayas),
    q.select({ id: communes.id, wilayaId: communes.wilayaId, name: communes.name, nameAr: communes.nameAr }).from(communes),
    q.select().from(rateTiers),
  ]);
  return { wilayas: ws, communes: cs, tiers, origin: ws.find((w) => w.id === m.wilayaId)! };
}

/** Checks one record keyed by field name. Used for spreadsheet rows and for the bulk API. */
export function checkRecord(rec: Partial<Record<Field, string>>, line: number, ref: Ref): CheckedRow {
  const errors: Msg[] = [];
  const warnings: Msg[] = [];
  const get = (f: Field) => (rec[f] ?? "").trim();
  const raw = { name: get("name"), phone: get("phone"), wilaya: get("wilaya"), commune: get("commune"), cod: get("cod") };

  const name = get("name");
  if (name.length < 2) errors.push({ m: "Recipient name is missing" });
  const phone = normalizeMobile(get("phone"));
  if (!phone) errors.push({ m: get("phone") ? "“{x}” is not an Algerian mobile number" : "Phone number is missing", v: { x: get("phone") } });

  const w = get("wilaya") ? matchWilaya(get("wilaya"), ref.wilayas) : null;
  if (!get("wilaya")) errors.push({ m: "Wilaya is missing" });
  else if (!w) errors.push({ m: "Unknown wilaya “{x}”. Use its code (1 to 69) or its name.", v: { x: get("wilaya") } });

  let commune: C | null = null;
  if (!get("commune")) errors.push({ m: "Commune is missing" });
  else if (w) {
    const r = matchCommune(get("commune"), ref.communes.filter((c) => c.wilayaId === w.id));
    commune = r.commune;
    if (r.corrected && commune) warnings.push({ m: "Commune “{x}” read as {y}", v: { x: get("commune"), y: commune.name } });
    if (!commune) {
      errors.push(
        r.suggestion
          ? { m: "No commune “{x}” in {w}. Did you mean {y}?", v: { x: get("commune"), w: w.name, y: r.suggestion.name } }
          : { m: "No commune “{x}” in {w}.", v: { x: get("commune"), w: w.name } },
      );
    }
  }

  const address = get("address");
  if (address.length < 4) errors.push({ m: "Address is missing or too short" });

  const cod = PAID.includes(norm(get("paid"))) ? 0 : money(get("cod"));
  if (cod === null) errors.push({ m: get("cod") ? "“{x}” is not an amount" : "Amount to collect is missing (write 0 if already paid)", v: { x: get("cod") } });
  else if (cod < 0 || cod > 2_000_000) errors.push({ m: "Amount must be between 0 and 2,000,000 DZD" });
  else if (!Number.isInteger(cod)) errors.push({ m: "Amount must be whole dinars" });

  let weight = 1;
  if (get("weight")) {
    const wv = money(get("weight"));
    if (wv === null || wv <= 0 || wv > 70) errors.push({ m: "Weight must be between 0.1 and 70 kg" });
    else weight = Math.ceil(wv);
  }

  const l = norm(get("lang"));
  const lang: "fr" | "ar" = ["ar", "arabic", "arabe", "عربي", "العربية"].map(norm).includes(l) ? "ar" : "fr";
  const contents = get("contents").slice(0, 120);

  if (errors.length || !phone || !w || !commune || cod === null) return { line, raw, values: null, errors, warnings };
  const tier = ref.tiers.find((t) => t.key === tierFor(ref.origin, w))!;
  return {
    line,
    raw,
    values: { recipientName: name, recipientPhone: phone, destWilayaId: w.id, communeId: commune.id, address, codAmount: cod, weightKg: weight, description: contents || undefined, recipientLang: lang, externalRef: get("ref").slice(0, 80) || undefined },
    shown: { wilaya: w.name, commune: commune.name, fee: quote(tier, weight).deliveryFee },
    errors,
    warnings,
  };
}

/** Flags the same phone and amount twice in the file, or already ordered in the last 7 days. */
async function flagDuplicates(q: Q, merchantId: string, rows: CheckedRow[]) {
  // An order number already sent, or twice in the file, is refused: it would ship twice.
  const refs = new Map<string, number>();
  for (const r of rows) {
    const x = r.values?.externalRef;
    if (!x) continue;
    if (refs.has(x)) {
      r.errors.push({ m: "Order {x} is also on line {n}", v: { x, n: refs.get(x)! } });
      r.values = null;
    } else refs.set(x, r.line);
  }
  if (refs.size) {
    const used = await q.select({ ref: parcels.externalRef, tracking: parcels.tracking }).from(parcels).where(and(eq(parcels.merchantId, merchantId), inArray(parcels.externalRef, [...refs.keys()])));
    for (const r of rows) {
      const hit = r.values?.externalRef && used.find((u) => u.ref === r.values!.externalRef);
      if (hit) {
        r.errors.push({ m: "Order {x} was already sent as {t}", v: { x: hit.ref!, t: hit.tracking } });
        r.values = null;
      }
    }
  }
  const seen = new Map<string, number>();
  for (const r of rows) {
    if (!r.values) continue;
    const k = `${r.values.recipientPhone}|${r.values.codAmount}`;
    if (seen.has(k)) r.warnings.push({ m: "Same phone and amount as line {n}", v: { n: seen.get(k)! } });
    else seen.set(k, r.line);
  }
  const phones = [...new Set(rows.filter((r) => r.values).map((r) => r.values!.recipientPhone))];
  if (phones.length === 0) return;
  const recent = await q
    .select({ phone: parcels.recipientPhone, cod: parcels.codAmount, tracking: parcels.tracking })
    .from(parcels)
    .where(and(eq(parcels.merchantId, merchantId), inArray(parcels.recipientPhone, phones), gt(parcels.createdAt, sql`now() - interval '7 days'`), ne(parcels.status, "cancelled")));
  for (const r of rows) {
    const hit = r.values && recent.find((p) => p.phone === r.values!.recipientPhone && p.cod === r.values!.codAmount);
    if (hit) r.warnings.push({ m: "Possible duplicate of {t}, ordered in the last 7 days", v: { t: hit.tracking } });
  }
}

export async function checkRecords(q: Q, merchantId: string, records: Partial<Record<Field, string>>[], firstLine = 2) {
  if (records.length === 0) throw new DomainError("The file has no orders under the header row.");
  if (records.length > MAX_ROWS) throw new DomainError("At most 1000 orders per file. Split it into smaller files.");
  const ref = await loadRef(q, merchantId);
  for (const r of records) {
    if ((r.wilaya?.trim() && r.commune?.trim()) || !r.address?.trim()) continue;
    const g = guessPlace([r.commune, r.wilaya, r.address].filter(Boolean).join(" "), ref);
    if (!r.wilaya?.trim() && g.wilaya) r.wilaya = String(g.wilaya.id);
    if (!r.commune?.trim() && g.commune) r.commune = g.commune.name;
  }
  const rows = records.map((r, i) => checkRecord(r, firstLine + i, ref));
  await flagDuplicates(q, merchantId, rows);
  return rows;
}

// ---------- batches ----------

/** Reads and checks a file, and saves the result as a draft for the merchant to review. */
export async function stageImport(q: Q, a: { merchantId: string; userId: string; file: { name: string; bytes: Buffer } }) {
  const [m] = await q.select().from(merchants).where(eq(merchants.id, a.merchantId));
  if (m?.status === "pending") throw new DomainError("Your account is waiting for approval. You can create orders once it is approved.");
  if (m?.status === "suspended") throw new DomainError("This merchant account is suspended");
  const table = (await readRows(a.file)).filter((r) => r.some((c) => c !== ""));
  if (table.length === 0) throw new DomainError("The file is empty.");
  let records = shopifyRecords(table);
  if (!records) {
    const { map, missing } = mapHeader(table[0]);
    if (missing.length) throw new ImportHeaderError(missing);
    records = table.slice(1).map((r) => Object.fromEntries(Object.entries(map).map(([f, i]) => [f, r[i!] ?? ""])) as Partial<Record<Field, string>>);
  }
  const rows = await checkRecords(q, a.merchantId, records);
  const valid = rows.filter((r) => r.values).length;
  const [b] = await q
    .insert(importBatches)
    .values({ merchantId: a.merchantId, createdBy: a.userId, fileName: a.file.name.slice(0, 200), rows, validCount: valid, invalidCount: rows.length - valid })
    .returning();
  return b;
}

/** The first row did not name the required columns. */
export class ImportHeaderError extends DomainError {
  constructor(public missing: Field[]) {
    super("Missing columns");
  }
}

export async function getBatch(q: Q, id: string, merchantId: string) {
  const [b] = await q.select().from(importBatches).where(and(eq(importBatches.id, id), eq(importBatches.merchantId, merchantId)));
  return b ? { ...b, rows: b.rows as CheckedRow[] } : null;
}

export const listBatches = (q: Q, merchantId: string) =>
  q
    .select({ id: importBatches.id, fileName: importBatches.fileName, status: importBatches.status, validCount: importBatches.validCount, invalidCount: importBatches.invalidCount, createdCount: importBatches.createdCount, createdAt: importBatches.createdAt })
    .from(importBatches)
    .where(eq(importBatches.merchantId, merchantId))
    .orderBy(desc(importBatches.createdAt))
    .limit(20);

/** Creates every valid row of a draft, all or nothing. Rows with errors are left out. */
export async function commitBatch(q: Q, id: string, actor: Actor) {
  if (!actor.merchantId) throw new DomainError("Only merchants can import orders");
  return q.transaction(async (tx) => {
    const [b] = await tx.select().from(importBatches).where(and(eq(importBatches.id, id), eq(importBatches.merchantId, actor.merchantId!))).for("update");
    if (!b) throw new DomainError("Import not found");
    if (b.status !== "draft") throw new DomainError("These orders were already created.");
    const rows = (b.rows as CheckedRow[]).filter((r) => r.values);
    if (rows.length === 0) throw new DomainError("No row is ready to create. Fix the file and upload it again.");
    for (const r of rows) await createParcel(tx, { ...r.values!, merchantId: actor.merchantId!, importId: b.id }, actor);
    await tx.update(importBatches).set({ status: "committed", createdCount: rows.length, committedAt: new Date() }).where(eq(importBatches.id, b.id));
    return rows.length;
  });
}

export async function discardBatch(q: Q, id: string, merchantId: string) {
  await q.update(importBatches).set({ status: "discarded" }).where(and(eq(importBatches.id, id), eq(importBatches.merchantId, merchantId), eq(importBatches.status, "draft")));
}

/** The template merchants download: column titles in the chosen language, with two example rows. */
export function templateCsv(lang: "en" | "fr" | "ar") {
  const head = {
    en: ["Name", "Phone", "Wilaya", "Commune", "Address", "COD", "Weight", "Contents", "SMS language"],
    fr: ["Nom", "Téléphone", "Wilaya", "Commune", "Adresse", "Montant", "Poids", "Produit", "Langue SMS"],
    ar: ["الاسم", "الهاتف", "الولاية", "البلدية", "العنوان", "المبلغ", "الوزن", "المنتج", "اللغة"],
  }[lang];
  const rows = [head, ["Amine Benali", "0550 12 34 56", "16", "Bab Ezzouar", "Cité 5 Juillet, bât 12", "4500", "1", "Sneakers 42", "fr"], ["Yasmine Cherif", "0661 98 76 54", "Oran", "Bir El Djir", "Près de la mosquée El Feth", "3200", "2", "Parfum", "ar"]];
  // The byte order mark makes Excel open the file as UTF-8, so accents and Arabic display correctly.
  return "﻿" + Papa.unparse(rows);
}
