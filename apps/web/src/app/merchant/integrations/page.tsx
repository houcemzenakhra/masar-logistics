import { Download, KeyRound, Plug, Webhook } from "lucide-react";
import Link from "next/link";
import { createApiKeyAction, createWebhookAction, removeWebhookAction, revokeApiKeyAction, testWebhookAction } from "@/app/actions";
import { ActionForm, Submit } from "@/components/forms";
import { Badge, Card, CardHeader, Field, Input, PageHeader, Table, Td } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { getDb } from "@/server/db";
import { listApiKeys, listEndpoints, recentDeliveries } from "@/server/services/integrations";

const DELIVERY = { pending: ["Retrying", "warn"], sent: ["Delivered", "success"], failed: ["Gave up", "danger"] } as const;

/** Connecting a shop: the WooCommerce plugin, shop exports, API keys and webhooks. */
export default async function Integrations() {
  const s = await requireRole("merchant");
  const db = await getDb();
  const [keys, endpoints, deliveries] = await Promise.all([listApiKeys(db, s.merchantId!), listEndpoints(db, s.merchantId!), recentDeliveries(db, s.merchantId!, 20)]);
  const live = keys.filter((k) => !k.revokedAt);

  return (
    <>
      <PageHeader title={t("Integrations")} subtitle={t("Send orders from your shop and hear back when parcels move.")} action={<Link href="/developers" className="text-sm font-medium text-accent-deep hover:underline">{t("API guide")}</Link>} />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#7f54b3] text-white"><Plug size={18} /></span>
            <div className="min-w-0">
              <h2 className="font-semibold">WooCommerce</h2>
              <p className="mt-1 text-sm text-ink-2">{t("Orders go to Masar from the order page, in bulk, or on their own when they become Processing. Delivered orders are marked completed.")}</p>
              <ol className="mt-3 list-decimal space-y-1 ps-5 text-sm text-ink-2">
                <li>{t("Install the plugin in WordPress (Plugins, Add new, Upload).")}</li>
                <li>{t("Create an API key below and paste it in WooCommerce, Masar.")}</li>
                <li>{t("Add the webhook address the plugin shows, below, and paste the signing secret back in the plugin.")}</li>
              </ol>
              <a href="/downloads/masar-woocommerce.zip" download className="mt-4 inline-flex items-center gap-2 rounded-xl bg-navy px-3.5 py-2 text-sm font-medium text-white hover:bg-navy/90"><Download size={15} /> {t("Download the plugin")}</a>
            </div>
          </div>
        </Card>
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#95bf47] text-white"><Download size={18} /></span>
            <div className="min-w-0">
              <h2 className="font-semibold">Shopify · YouCan</h2>
              <p className="mt-1 text-sm text-ink-2">{t("Export your orders as CSV from your shop and import the file as it is. Masar reads the shop's columns, groups an order's products, finds the wilaya and commune in the address, and does not collect orders already paid.")}</p>
              <Link href="/merchant/import" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-surface px-3.5 py-2 text-sm font-medium ring-1 ring-inset ring-line hover:bg-paper">{t("Import a file")}</Link>
            </div>
          </div>
        </Card>
      </div>

      <Card className="mt-5 min-w-0">
        <CardHeader title={<span className="flex items-center gap-2"><KeyRound size={17} className="text-muted" /> {t("API keys")}</span>} hint={t("A key acts for your merchant account. Keep it on your server, never in a web page. Revoke a key the moment you stop using it.")} />
        <ActionForm action={createApiKeyAction} className="flex flex-wrap items-end gap-3 border-b border-line p-5">
          <div className="min-w-56 flex-1"><Field label={t("Where it is used")}><Input name="name" required maxLength={60} placeholder={t("e.g. WooCommerce shop")} /></Field></div>
          <Submit>{t("Create key")}</Submit>
        </ActionForm>
        <Table head={["Name", "Key", "Last used", "Created", ""]} empty={keys.length === 0}>
          {keys.map((k) => (
            <tr key={k.id} className={k.revokedAt ? "opacity-55" : ""}>
              <Td className="font-medium">{k.name}</Td>
              <Td><code dir="ltr" className="font-mono text-[13px]">{k.prefix}…</code></Td>
              <Td className="text-[13px] text-muted">{k.lastUsedAt ? dateTime(k.lastUsedAt) : t("Never")}</Td>
              <Td className="text-[13px] text-muted">{dateTime(k.createdAt)} · {k.createdBy}</Td>
              <Td className="text-end">
                {k.revokedAt ? (
                  <Badge tone="neutral">{t("Revoked")}</Badge>
                ) : (
                  <ActionForm action={revokeApiKeyAction}>
                    <input type="hidden" name="id" value={k.id} />
                    <Submit size="sm" variant="ghost">{t("Revoke")}</Submit>
                  </ActionForm>
                )}
              </Td>
            </tr>
          ))}
        </Table>
        {live.length > 0 && <p className="border-t border-line px-5 py-3 text-xs text-muted">{t("{n} active", { n: live.length })}</p>}
      </Card>

      <Card className="mt-5 min-w-0">
        <CardHeader title={<span className="flex items-center gap-2"><Webhook size={17} className="text-muted" /> {t("Webhooks")}</span>} hint={t("Masar posts parcel.created and parcel.status_changed to these addresses, signed with the address's secret. Unanswered events are tried again for a day.")} />
        <ActionForm action={createWebhookAction} className="flex flex-wrap items-end gap-3 border-b border-line p-5">
          <div className="min-w-64 flex-1"><Field label={t("Address (https)")}><Input name="url" type="url" required dir="ltr" placeholder="https://your-shop.dz/wp-json/masar/v1/webhook" /></Field></div>
          <Submit>{t("Add webhook")}</Submit>
        </ActionForm>
        {endpoints.length === 0 ? (
          <p className="p-5 text-sm text-muted">{t("No webhook yet.")}</p>
        ) : (
          <ul className="divide-y divide-line">
            {endpoints.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <p dir="ltr" className="truncate font-mono text-[13px]">{e.url}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {e.lastSuccessAt ? t("Last delivered {at}", { at: dateTime(e.lastSuccessAt) }) : t("Nothing delivered yet")}
                    {e.failures > 0 && <span className="text-danger"> · {t("{n} failures in a row", { n: e.failures })}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap items-start gap-2">
                  <ActionForm action={testWebhookAction} className="flex flex-col items-end">
                    <input type="hidden" name="id" value={e.id} />
                    <Submit size="sm" variant="ghost">{t("Send a test")}</Submit>
                  </ActionForm>
                  <ActionForm action={removeWebhookAction}>
                    <input type="hidden" name="id" value={e.id} />
                    <Submit size="sm" variant="ghost">{t("Remove")}</Submit>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {deliveries.length > 0 && (
        <Card className="mt-5 min-w-0">
          <CardHeader title={t("Recent events")} />
          <Table head={["Event", "Parcel", "Result", "Tries", "When"]}>
            {deliveries.map((d) => {
              const parcel = (d.payload as { data?: { parcel?: { tracking?: string; status?: string } } }).data?.parcel;
              return (
                <tr key={d.id}>
                  <Td><code dir="ltr" className="font-mono text-[13px]">{d.event}</code></Td>
                  <Td className="text-[13px]"><span className="font-mono">{parcel?.tracking}</span> <span className="text-muted">{parcel?.status}</span></Td>
                  <Td>
                    <Badge tone={DELIVERY[d.status][1]}>{t(DELIVERY[d.status][0])}</Badge>
                    {d.lastError && d.status !== "sent" && <span className="ms-2 text-xs text-muted">{d.lastError}</span>}
                  </Td>
                  <Td className="tnum">{d.attempts}</Td>
                  <Td className="text-[13px] text-muted">{dateTime(d.createdAt)}</Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}
    </>
  );
}
