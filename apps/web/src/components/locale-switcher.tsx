import { Languages } from "lucide-react";
import { setLocaleAction } from "@/app/actions";
import { LOCALES, LOCALE_NAME } from "@/i18n/config";
import { locale, t } from "@/lib/i18n";

/** Three small buttons. Works without JavaScript: each is a form submit. */
export function LocaleSwitcher({ dark = false }: { dark?: boolean }) {
  const now = locale();
  return (
    <form action={setLocaleAction} className="flex items-center gap-1" aria-label={t("Language")}>
      <Languages size={15} className={dark ? "text-white/50" : "text-muted"} aria-hidden />
      {LOCALES.map((l) => (
        <button
          key={l}
          name="locale"
          value={l}
          lang={l}
          aria-pressed={l === now}
          title={LOCALE_NAME[l]}
          className={`rounded-md px-1.5 py-1 text-xs font-medium uppercase transition-colors ${
            l === now ? (dark ? "bg-white/15 text-white" : "bg-navy text-white") : dark ? "text-white/60 hover:text-white" : "text-muted hover:text-ink"
          }`}
        >
          {l === "ar" ? "ع" : l}
        </button>
      ))}
    </form>
  );
}
