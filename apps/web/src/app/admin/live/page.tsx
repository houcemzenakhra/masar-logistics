import { LiveMap } from "@/components/live-map";
import { PageHeader } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireStaff } from "@/lib/session";

export const metadata = { title: "Live map" };

export default async function Live() {
  await requireStaff("dispatch", "hub");
  return (
    <>
      <PageHeader title={t("Live map")} subtitle={t("Couriers who shared their position in the last 12 hours. Orange: seen in the last 15 minutes.")} />
      <LiveMap />
    </>
  );
}
