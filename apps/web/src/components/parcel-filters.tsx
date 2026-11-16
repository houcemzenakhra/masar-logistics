import Link from "next/link";
import { t } from "@/lib/i18n";
import { STATUSES, STATUS_LABEL, type Status } from "@/server/domain/state";
import { Button, Input } from "./ui";

/** Search box and status chips shared by the admin and merchant parcel lists. */
export function ParcelFilters({ base, status, q, counts }: { base: string; status?: Status; q?: string; counts: Partial<Record<Status, number>> }) {
  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-medium ring-1 ring-inset transition-colors ${active ? "bg-navy text-white ring-navy" : "bg-surface text-ink-2 ring-line hover:bg-paper"}`;
  const href = (s?: string) => `${base}?${new URLSearchParams({ ...(s ? { status: s } : {}), ...(q ? { q } : {}) })}`;
  return (
    <>
      <form className="mb-4 flex max-w-md gap-2" role="search">
        {status && <input type="hidden" name="status" value={status} />}
        <Input name="q" defaultValue={q} placeholder={t("Search tracking number, name or phone")} aria-label={t("Search")} />
        <Button variant="dark">{t("Search")}</Button>
      </form>
      <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        <Link href={href()} className={chip(!status)}>{t("All")}</Link>
        {STATUSES.filter((s) => counts[s]).map((s) => (
          <Link key={s} href={href(s)} className={chip(status === s)}>
            {t(STATUS_LABEL[s])} <span className="tnum opacity-60">{counts[s]}</span>
          </Link>
        ))}
      </div>
    </>
  );
}
