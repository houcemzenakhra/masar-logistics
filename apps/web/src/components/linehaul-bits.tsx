import { ArrowRight } from "lucide-react";
import { t } from "@/lib/i18n";
import { Badge } from "./ui";

const BAG = { open: ["Open", "neutral"], sealed: ["Sealed", "info"], in_transit: ["In transit", "progress"], received: ["Received", "success"] } as const;
const MAN = { open: ["Loading", "neutral"], departed: ["Departed", "progress"], arrived: ["Arrived", "success"] } as const;

export const BagStatus = ({ status }: { status: keyof typeof BAG }) => <Badge tone={BAG[status][1]}>{t(BAG[status][0])}</Badge>;
export const ManifestStatus = ({ status }: { status: keyof typeof MAN }) => <Badge tone={MAN[status][1]}>{t(MAN[status][0])}</Badge>;

export function RouteLabel({ origin, dest }: { origin: string; dest: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      {t(origin)} <ArrowRight size={14} className="text-muted rtl:-scale-x-100" aria-label={t("To")} /> {t(dest)}
    </span>
  );
}
