import Link from "next/link";
import { t } from "@/lib/i18n";
import { getSession } from "@/lib/session";
import { HOME } from "@/server/auth";
import { LocaleSwitcher } from "./locale-switcher";
import { MobileMenu } from "./site/mobile-menu";
import { LinkButton, Logo } from "./ui";

const NAV = [
  { href: "/track", label: "Track" },
  { href: "/#how", label: "How it works" },
  { href: "/#rates", label: "Rates" },
  { href: "/coverage", label: "Coverage" },
  { href: "/developers", label: "Developers" },
];

export async function SiteNav({ dark = false }: { dark?: boolean }) {
  const s = await getSession();
  const link = dark ? "text-white/70 hover:text-white" : "text-ink-2 hover:text-ink";
  const account = s ? (
    <LinkButton href={HOME[s.role]} size="sm">{t("Open dashboard")}</LinkButton>
  ) : (
    <LinkButton href="/login" size="sm" variant={dark ? "primary" : "dark"}>{t("Sign in")}</LinkButton>
  );
  return (
    <nav className="relative z-30 mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8" aria-label={t("Main")}>
      <Link href="/" aria-label="Masar" className="relative z-50"><Logo light={dark} /></Link>
      <div className="hidden items-center gap-6 text-sm md:flex">
        {NAV.map((l) => (
          <Link key={l.href} href={l.href} className={`transition-colors ${link}`}>{t(l.label)}</Link>
        ))}
      </div>
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="hidden sm:block"><LocaleSwitcher dark={dark} /></div>
        <div className="hidden md:block">{account}</div>
        <MobileMenu
          dark={dark}
          links={[...NAV.map((l) => ({ href: l.href, label: t(l.label) })), ...(s ? [] : [{ href: "/signup", label: t("Create a merchant account") }])]}
          footer={
            <>
              <LocaleSwitcher dark />
              {account}
            </>
          }
        />
      </div>
    </nav>
  );
}

export function SiteFooter() {
  const cols: [string, [string, string][]][] = [
    ["Ship", [["/signup", "Create a merchant account"], ["/#rates", "Rates"], ["/coverage", "Coverage"], ["/track", "Track a parcel"]]],
    ["Build", [["/developers", "API guide"], ["/developers#bulk", "Bulk orders"]]],
    ["Team", [["/login", "Sign in"], ["/forgot", "Forgot password"]]],
  ];
  return (
    <footer className="bg-navy text-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)] lg:px-8">
        <div>
          <Logo light />
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-white/60">{t("Pickup, hubs and cash on delivery across Algeria.")}</p>
          <div className="mt-6"><LocaleSwitcher dark /></div>
        </div>
        {cols.map(([title, items]) => (
          <div key={title}>
            <h2 className="text-sm font-medium text-white">{t(title)}</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              {items.map(([href, label]) => (
                <li key={href}><Link href={href} className="text-white/60 transition-colors hover:text-white">{t(label)}</Link></li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-7xl px-4 py-5 text-[13px] text-white/45 sm:px-6 lg:px-8">{t("Masar delivers in all 69 wilayas of Algeria.")}</p>
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
