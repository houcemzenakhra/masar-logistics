import { t } from "@/lib/i18n";
import { Badge } from "./ui";

const KIND = { delivery: ["Delivery", "success"], return_fee: ["Return fee", "warn"], handover: ["Handover", "info"], payout: ["Payout", "progress"] } as const;

export const KindBadge = ({ kind }: { kind: keyof typeof KIND }) => <Badge tone={KIND[kind][1]}>{t(KIND[kind][0])}</Badge>;

/** Ledger memos are written in English as "<what> <tracking>". Translate the words, keep the number. */
export function memo(text: string) {
  const m = text.match(/^(.*?)(\s+MSR\d+)?$/);
  return m ? `${t(m[1])}${m[2] ?? ""}` : text;
}
