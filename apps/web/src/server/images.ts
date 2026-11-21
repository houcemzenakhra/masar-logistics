import { DomainError } from "./services/parcels";

/** Largest picture accepted from a phone. The apps shrink photos to about 1280 px before sending. */
export const MAX_IMAGE_BYTES = 450 * 1024;

const MAGIC: Record<string, (b: Buffer) => boolean> = {
  jpeg: (b) => b[0] === 0xff && b[1] === 0xd8,
  png: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  webp: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP",
};

/**
 * Checks a picture sent as a data URL (or bare base64 JPEG) and returns it as a data URL.
 * The bytes must really be the type they claim, so nothing else can be stored and served back.
 */
export function checkImage(input: string, what = "Photo"): string {
  const m = input.trim().match(/^(?:data:image\/(jpeg|jpg|png|webp);base64,)?([A-Za-z0-9+/=\s]+)$/);
  if (!m) throw new DomainError(`${what} must be a JPEG, PNG or WebP image`);
  const bytes = Buffer.from(m[2].replace(/\s/g, ""), "base64");
  if (bytes.length === 0) throw new DomainError(`${what} is empty`);
  if (bytes.length > MAX_IMAGE_BYTES) throw new DomainError(`${what} is too large: keep it under ${Math.round(MAX_IMAGE_BYTES / 1024)} KB`);
  const fits = Object.entries(MAGIC).find(([, test]) => test(bytes));
  if (!fits) throw new DomainError(`${what} must be a JPEG, PNG or WebP image`);
  return `data:image/${fits[0]};base64,${bytes.toString("base64")}`;
}

/** Turns a stored data URL back into a response with the right content type. */
export function imageResponse(dataUrl: string | null) {
  const m = dataUrl?.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!m) return new Response("Not found", { status: 404 });
  return new Response(Buffer.from(m[2], "base64"), {
    headers: { "content-type": m[1], "cache-control": "private, max-age=86400, immutable", "x-content-type-options": "nosniff" },
  });
}
