"use client";

import { Camera, X } from "lucide-react";
import { useId, useState } from "react";
import { useT } from "./i18n-client";

/** Shrinks a photo to at most `max` pixels on its long side, as a JPEG data URL. */
async function shrink(file: File, max = 1280, quality = 0.72): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * k);
  canvas.height = Math.round(bitmap.height * k);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Photos for a form: taken with the camera or picked from the phone, shrunk in the browser so a
 * 4 MB phone photo uploads as about 200 KB, and sent as hidden `name` fields.
 */
export function PhotoInput({ name = "photos", max = 6, label }: { name?: string; max?: number; label?: string }) {
  const t = useT();
  const id = useId();
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError("");
    try {
      const room = max - photos.length;
      const next = await Promise.all([...files].slice(0, room).map((f) => shrink(f)));
      setPhotos((p) => [...p, ...next].slice(0, max));
    } catch {
      setError(t("That file could not be read as a photo. Try a JPEG or PNG."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {label && <p className="mb-1.5 text-[13px] font-medium text-ink-2">{label}</p>}
      <div className="flex flex-wrap gap-2">
        {photos.map((src, i) => (
          <div key={i} className="relative size-20 overflow-hidden rounded-xl ring-1 ring-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt={t("Photo {n}", { n: i + 1 })} className="size-full object-cover" />
            <input type="hidden" name={name} value={src} />
            <button type="button" onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))} aria-label={t("Remove photo {n}", { n: i + 1 })} className="absolute end-1 top-1 grid size-6 place-items-center rounded-full bg-ink/70 text-white">
              <X size={13} />
            </button>
          </div>
        ))}
        {photos.length < max && (
          <label htmlFor={id} className={`grid size-20 cursor-pointer place-items-center rounded-xl border border-dashed border-line text-muted hover:border-accent hover:text-accent ${busy ? "opacity-50" : ""}`}>
            <span className="flex flex-col items-center gap-1 text-[11px]"><Camera size={20} />{busy ? t("Loading…") : t("Add photo")}</span>
            <input id={id} type="file" accept="image/*" capture="environment" multiple={max > 1} className="sr-only" onChange={(e) => { void add(e.target.files); e.target.value = ""; }} />
          </label>
        )}
      </div>
      {error && <p role="alert" className="mt-1.5 text-[13px] text-danger">{error}</p>}
    </div>
  );
}
