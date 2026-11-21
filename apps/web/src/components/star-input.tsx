"use client";

import { Star } from "lucide-react";
import { useState } from "react";
import { useT } from "./i18n-client";

/** Five stars as radio buttons; the chosen star and those before it light up. */
export function StarInput({ name = "stars" }: { name?: string }) {
  const t = useT();
  const [value, setValue] = useState(0);
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div role="radiogroup" aria-label={t("Rating")} className="flex gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <label key={n} className={`cursor-pointer rounded-md p-0.5 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent ${n <= shown ? "text-warn" : "text-line"}`} onMouseEnter={() => setHover(n)}>
          <input type="radio" name={name} value={n} required checked={value === n} onChange={() => setValue(n)} className="sr-only" />
          <Star size={30} fill="currentColor" aria-hidden />
          <span className="sr-only">{t("{n} out of 5", { n })}</span>
        </label>
      ))}
    </div>
  );
}
