import Link from "next/link";
import { t } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { HOME } from "@/server/auth";
import { LocaleSwitcher } from "./locale-switcher";
import { LinkButton, Logo } from "./ui";

export async function SiteNav({ dark = false }: { dark?: boolean }) {
  const s = await getSession();
  const link = dark ? "text-white/70 hover:text-white" : "text-ink-2 hover:text-ink";
  return (
    <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6" aria-label={t("Main")}>
      <Link href="/" aria-label="Masar"><Logo light={dark} /></Link>
      <div className="flex items-center gap-3 text-sm sm:gap-6">
        <Link href="/track" className={`hidden md:block ${link}`}>{t("Track")}</Link>
        <Link href="/#rates" className={`hidden md:block ${link}`}>{t("Rates")}</Link>
        <Link href="/#coverage" className={`hidden md:block ${link}`}>{t("Coverage")}</Link>
        <LocaleSwitcher dark={dark} />
        {s ? (
          <LinkButton href={HOME[s.role]} size="sm">{t("Open dashboard")}</LinkButton>
        ) : (
          <LinkButton href="/login" size="sm" variant={dark ? "primary" : "dark"}>{t("Sign in")}</LinkButton>
        )}
      </div>
    </nav>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted sm:px-6">
        <Logo />
        <p>{t("Pickup, hubs and cash on delivery across Algeria.")}</p>
      </div>
    </footer>
  );
}

export function TrackForm({ large = false, defaultValue = "" }: { large?: boolean; defaultValue?: string }) {
  return (
    <form action="/track" className={`flex w-full gap-2 rounded-2xl bg-white p-2 shadow-card ring-1 ring-line ${large ? "max-w-xl" : "max-w-lg"}`}>
      <input
        name="n"
        required
        defaultValue={defaultValue}
        placeholder={t("Tracking number, e.g. MSR004512907")}
        aria-label={t("Tracking number")}
        autoCapitalize="characters"
        className={`min-w-0 flex-1 rounded-xl px-3 text-ink placeholder:text-muted/80 focus:outline-none ${large ? "h-12 text-base" : "h-10 text-sm"}`}
      />
      <button className={`shrink-0 rounded-xl bg-accent px-5 font-medium text-white transition-colors hover:bg-accent-deep ${large ? "h-12 text-base" : "h-10 text-sm"}`}>
        {t("Track")}
      </button>
    </form>
  );
}
