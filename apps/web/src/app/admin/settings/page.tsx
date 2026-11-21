import { deliverySettingsAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { getDeliverySettings } from "@/server/services/delivery";
import { pushStats } from "@/server/services/notify";

export const metadata = { title: "Settings" };

export default async function Settings() {
  await requireRole("admin");
  const db = await getDb();
  const [cfg, push] = await Promise.all([getDeliverySettings(db), pushStats(db)]);
  const options = [
    ["optional", "Optional", "Couriers can record the recipient's code, a photo or a signature, and can deliver without."],
    ["required", "Required", "Couriers must record at least one proof to mark a parcel delivered. Operations can still deliver without."],
  ] as const;
  return (
    <>
      <PageHeader title={t("Settings")} />
      <div className="grid max-w-4xl gap-5">
        <Card>
          <CardHeader title={t("Proof of delivery")} hint={t("Every recipient gets a 4-digit code in the out-for-delivery text message.")} />
          <ActionForm action={deliverySettingsAction} className="space-y-3 p-5">
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map(([k, label, hint]) => (
                <label key={k} className="cursor-pointer rounded-xl border border-line p-4 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft">
                  <input type="radio" name="proof" value={k} defaultChecked={cfg.proof === k} className="sr-only" />
                  <span className="font-medium">{t(label)}</span>
                  <span className="mt-1 block text-[13px] text-ink-2">{t(hint)}</span>
                </label>
              ))}
            </div>
            <Submit>{t("Save")}</Submit>
          </ActionForm>
        </Card>
        <Card>
          <CardHeader
            title={t("Push notifications")}
            action={push.configured ? <Badge tone="success">{t("Firebase connected")}</Badge> : <Badge tone="warn">{t("Not connected")}</Badge>}
            hint={push.configured ? t("Notifications are pushed to phones as they happen.") : t("Notifications go to each person's inbox in the app, but are not pushed to phones. Set FCM_SERVICE_ACCOUNT to connect Firebase.")}
          />
          <div className="grid gap-3 p-5 sm:grid-cols-4">
            <Stat label={t("Phones registered")} value={push.phones} />
            <Stat label={t("Pushed, 7 days")} value={push.byStatus.sent ?? 0} />
            <Stat label={t("Inbox only, 7 days")} value={(push.byStatus.simulated ?? 0) + (push.byStatus.none ?? 0)} />
            <Stat label={t("Failed, 7 days")} value={push.byStatus.failed ?? 0} />
          </div>
        </Card>
      </div>
    </>
  );
}
