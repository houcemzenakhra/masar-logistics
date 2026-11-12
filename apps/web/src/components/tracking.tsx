import { Check } from "lucide-react";
import { dateTime } from "@/lib/format";
import { MAIN_PATH, STATUS_LABEL, progressIndex, type Status } from "@/server/domain/state";

const SHORT: Record<string, string> = {
  created: "Ordered",
  picked_up: "Picked up",
  at_origin_hub: "Origin hub",
  in_transit: "In transit",
  at_destination_hub: "Local hub",
  out_for_delivery: "On its way",
  delivered: "Delivered",
};

/** Seven-step progress rail. Off-path statuses (returns, lost) show no progress. */
export function ProgressRail({ status }: { status: string }) {
  const at = progressIndex(status as Status);
  if (at < 0) return null;
  return (
    <ol className="grid grid-cols-7 gap-1">
      {MAIN_PATH.map((s, i) => {
        const done = i < at || status === "delivered";
        const now = i === at && status !== "delivered";
        return (
          <li key={s} className="min-w-0">
            <div className="flex items-center">
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                  done ? "bg-ok text-white" : now ? "bg-accent text-white ring-4 ring-accent/20" : "bg-line text-muted"
                }`}
              >
                {done ? <Check size={13} strokeWidth={3} /> : i + 1}
              </span>
              {i < MAIN_PATH.length - 1 && <span className={`mx-1 h-0.5 flex-1 rounded ${i < at ? "bg-ok" : "bg-line"}`} />}
            </div>
            <p className={`mt-2 hidden truncate text-xs sm:block ${now ? "font-semibold text-ink" : "text-muted"}`}>{SHORT[s]}</p>
          </li>
        );
      })}
    </ol>
  );
}

type Ev = { id: string; status: string; note: string; createdAt: Date; hub: string | null; actor?: string | null };

export function Timeline({ events, showActor = false }: { events: Ev[]; showActor?: boolean }) {
  return (
    <ol className="relative ml-2 border-l border-line">
      {events.map((e, i) => (
        <li key={e.id} className="relative pb-5 pl-6 last:pb-0">
          <span className={`absolute -left-[5px] top-1.5 size-2.5 rounded-full ring-4 ring-surface ${i === 0 ? "bg-accent" : "bg-line"}`} />
          <p className={`text-sm ${i === 0 ? "font-semibold" : "font-medium text-ink-2"}`}>{STATUS_LABEL[e.status as Status] ?? e.status}</p>
          <p className="mt-0.5 text-[13px] text-muted">
            {dateTime(e.createdAt)}
            {e.hub && ` · ${e.hub}`}
            {showActor && e.actor && ` · ${e.actor}`}
          </p>
          {e.note && <p className="mt-1 text-[13px] text-ink-2">{e.note}</p>}
        </li>
      ))}
    </ol>
  );
}
