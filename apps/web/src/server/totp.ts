/**
 * Codes from an authenticator app (RFC 6238: HMAC-SHA1, 30-second steps, 6 digits), and the
 * encryption of the shared secret at rest (AES-256-GCM, key derived from AUTH_SECRET).
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;

export function base32Encode(buf: Buffer) {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string) {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 20 random bytes, as authenticator apps expect. */
export const newSecret = () => base32Encode(randomBytes(20));

export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP_SECONDS);

export function codeAt(secret: string, step: number) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", base32Decode(secret)).update(counter).digest();
  const off = h[h.length - 1] & 15;
  const n = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

/**
 * The step a code belongs to, accepting the previous and next step for clock drift, or null.
 * Steps at or before `lastStep` are refused, so a code seen over someone's shoulder is spent.
 */
export function matchCode(secret: string, code: string, lastStep: number | null, ms = Date.now()) {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const now = stepAt(ms);
  for (const step of [now - 1, now, now + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(codeAt(secret, step)), Buffer.from(c))) return step;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string, issuer: string) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

function key() {
  const s = process.env.AUTH_SECRET;
  // Same rule as sessions: a deployment with a real database must have its own secret.
  if (!s && process.env.DATABASE_URL && process.env.NODE_ENV === "production") throw new Error("AUTH_SECRET must be set");
  return createHash("sha256").update(`${s ?? "masar-dev-only-secret"}:totp`).digest();
}

export function encryptSecret(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${body.toString("base64url")}.${c.getAuthTag().toString("base64url")}`;
}

export function decryptSecret(stored: string) {
  const [v, iv, body, tag] = stored.split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(body, "base64url")), d.final()]).toString("utf8");
}

/** Ten recovery codes like "k3f9-2mqp", each usable once. */
export function newRecoveryCodes(n = 10) {
  const chars = "abcdefghjkmnpqrstuvwxyz23456789";
  return Array.from({ length: n }, () => {
    const b = randomBytes(8);
    const s = [...b].map((x) => chars[x % chars.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4)}`;
  });
}

export const hashRecovery = (code: string) => createHash("sha256").update(code.trim().toLowerCase()).digest("hex");
