/**
 * White-label branding: a company running this platform under its own name shows that name,
 * its colour and its support contacts to merchants and recipients.
 */
import { eq } from "drizzle-orm";
import { cache } from "react";
import type { Q } from "../db";
import { getDb } from "../db";
import { settings } from "../schema";

export type Brand = {
  name: string;
  /** Main colour, #rrggbb. Buttons, links and highlights. */
  accent: string;
  supportPhone: string;
  supportEmail: string;
};

export const DEFAULT_BRAND: Brand = { name: "Masar", accent: "#ff5b24", supportPhone: "", supportEmail: "" };

export class BrandError extends Error {}

export async function getBrand(q: Q): Promise<Brand> {
  const [r] = await q.select().from(settings).where(eq(settings.key, "brand"));
  return { ...DEFAULT_BRAND, ...((r?.value ?? {}) as Partial<Brand>) };
}

/** Once per request, for layouts and metadata. */
export const currentBrand = cache(async () => getBrand(await getDb()));

/** Relative luminance (WCAG), for checking white text on the colour stays readable. */
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const contrastWithWhite = (hex: string) => 1.05 / (luminance(hex) + 0.05);

/** The colour 20 % darker, for hover and pressed states. */
export function darker(hex: string, by = 0.2) {
  return `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * (1 - by)).toString(16).padStart(2, "0")).join("")}`;
}

export async function setBrand(q: Q, b: Brand) {
  const name = b.name.trim();
  if (name.length < 2 || name.length > 30) throw new BrandError("The name must be 2 to 30 characters");
  const accent = b.accent.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(accent)) throw new BrandError("Give the colour as #rrggbb, e.g. #ff5b24");
  // Buttons carry white text: a pale colour would make them unreadable.
  if (contrastWithWhite(accent) < 2.8) throw new BrandError("This colour is too light for white text on buttons. Choose a darker one.");
  const email = b.supportEmail.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BrandError("Enter a valid support email, or leave it empty");
  const v: Brand = { name, accent, supportPhone: b.supportPhone.trim().slice(0, 30), supportEmail: email };
  await q.insert(settings).values({ key: "brand", value: v }).onConflictDoUpdate({ target: settings.key, set: { value: v, updatedAt: new Date() } });
  return v;
}

/** Text messages start with the company's name. */
export function brandSms(body: string, b: Brand) {
  if (b.name === DEFAULT_BRAND.name) return body;
  return body.replace(/^Masar:/, `${b.name}:`).replace(/^مسار:/, `${b.name}:`);
}
