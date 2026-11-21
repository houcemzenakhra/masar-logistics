import type { ReactNode } from "react";
import { SiteFooter, SiteNav } from "@/components/site";
import { initLocale, t } from "@/lib/i18n";

export const metadata = { title: "API guide" };

function Code({ children }: { children: ReactNode }) {
  return (
    <pre dir="ltr" className="ltr mt-4 overflow-x-auto rounded-2xl bg-navy p-5 font-mono text-[13px] leading-relaxed text-white/85">
      <code>{children}</code>
    </pre>
  );
}

type Ep = { method: "GET" | "POST"; path: string; who: string; what: string };

export default async function Developers() {
  await initLocale();
  const groups: [string, Ep[]][] = [
    [t("Orders"), [
      { method: "POST", path: "/api/v1/parcels", who: t("Merchant"), what: t("Create one order.") },
      { method: "POST", path: "/api/v1/parcels/bulk", who: t("Merchant"), what: t("Check or create up to 1,000 orders, all or nothing.") },
      { method: "GET", path: "/api/v1/parcels?externalRef=", who: t("Merchant"), what: t("Find a parcel by your own order number.") },
      { method: "POST", path: "/api/v1/parcels/:id/confirm", who: t("Merchant"), what: t("Answer for the recipient after a call: yes or no.") },
      { method: "GET", path: "/api/v1/merchant/settings", who: t("Merchant"), what: t("Order options, such as recipient confirmation. POST to change.") },
      { method: "GET", path: "/api/v1/parcels", who: t("Signed in"), what: t("Your parcels. Filter with status and q.") },
      { method: "GET", path: "/api/v1/parcels/:id", who: t("Signed in"), what: t("One parcel with its full history.") },
      { method: "GET", path: "/api/v1/merchant/wallet", who: t("Merchant"), what: t("Balance and ledger entries.") },
    ]],
    [t("Reference data"), [
      { method: "GET", path: "/api/v1/wilayas", who: t("Anyone"), what: t("Wilayas with zone and hub, and the rate table.") },
      { method: "GET", path: "/api/v1/wilayas/:id/communes", who: t("Anyone"), what: t("Communes of a wilaya, with ids to use on orders.") },
      { method: "GET", path: "/api/v1/communes?q=", who: t("Anyone"), what: t("Search communes by name in French or Arabic.") },
      { method: "GET", path: "/api/v1/desks?wilaya=", who: t("Anyone"), what: t("Open stop desks, to send orders with deliveryType desk.") },
      { method: "GET", path: "/api/v1/track/:tracking", who: t("Anyone"), what: t("Public status and scans, with no personal details.") },
    ]],
    [t("Couriers and hubs"), [
      { method: "GET", path: "/api/v1/courier/tasks", who: t("Courier"), what: t("Today's parcels for the signed-in courier.") },
      { method: "GET", path: "/api/v1/courier/route", who: t("Courier"), what: t("The same stops in driving order.") },
      { method: "POST", path: "/api/v1/parcels/:id/transition", who: t("Courier, hub"), what: t("Record delivery, a failed attempt or another move.") },
      { method: "POST", path: "/api/v1/parcels/:id/deliver", who: t("Courier, hub"), what: t("Hand over with proof; at a stop desk the recipient's code is required.") },
      { method: "GET", path: "/api/v1/hub/desk", who: t("Hub"), what: t("The stop desk counter: parcels to shelve and on the shelf.") },
      { method: "POST", path: "/api/v1/scan", who: t("Hub"), what: t("Scan a parcel or a bag in or out.") },
      { method: "GET", path: "/api/v1/bags", who: t("Hub"), what: t("Bags at the hub. POST to open one; manifests work the same way.") },
    ]],
  ];
  return (
    <div className="site">
      <header className="bg-navy text-white">
        <SiteNav dark />
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-10 sm:px-6 sm:pb-20 lg:px-8">
          <h1 className="display max-w-3xl text-5xl sm:text-6xl">{t("Connect your shop to Masar")}</h1>
          <p className="lede mt-5 max-w-2xl text-lg text-white/70">{t("A JSON API over HTTPS. The merchant dashboard, the courier app and the hub stations use the same endpoints, so everything they can do, your system can do.")}</p>
        </div>
      </header>
      <main className="mx-auto grid max-w-7xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-[220px_minmax(0,1fr)] lg:px-8">
        <nav aria-label={t("On this page")} className="hidden lg:block">
          <ul className="sticky top-8 space-y-2 text-sm text-ink-2">
            {[["#auth", t("Sign in")], ["#plugins", t("Shop plugins")], ["#orders", t("Orders")], ["#webhooks", t("Webhooks")], ["#bulk", t("Bulk orders")], ["#errors", t("Errors")], ["#endpoints", t("Endpoints")]].map(([h, l]) => (
              <li key={h}><a href={h} className="hover:text-ink">{l}</a></li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 max-w-3xl space-y-16">
          <section id="auth" className="scroll-mt-8">
            <h2 className="display text-3xl">{t("Sign in")}</h2>
            <p className="mt-3 text-ink-2">{t("For a shop or a script, create an API key in your merchant space under Integrations and send it on every call. A key acts for your merchant account and stops working the moment you revoke it.")}</p>
            <Code>{`curl https://<your-masar>/api/v1/parcels \\
  -H "authorization: Bearer msr_live_…"`}</Code>
            <p className="mt-5 text-ink-2">{t("Apps sign in with an email and password instead, and get a token that lasts a week. A password reset ends every token for that account at once.")}</p>
            <Code>{`curl -X POST https://<your-masar>/api/v1/auth/login \\
  -H "content-type: application/json" \\
  -d '{"email":"shop@example.dz","password":"…"}'

→ { "token": "eyJhbGciOi…", "user": { "role": "merchant", … } }

curl https://<your-masar>/api/v1/parcels \\
  -H "authorization: Bearer eyJhbGciOi…"`}</Code>
            <p className="mt-3 text-[14px] text-muted">{t("Repeated wrong passwords are slowed down and answered with 429 and a retry-after header.")}</p>
          </section>

          <section id="plugins" className="scroll-mt-8">
            <h2 className="display text-3xl">{t("Shop plugins")}</h2>
            <p className="mt-3 text-ink-2">{t("WooCommerce: install the Masar plugin, paste your API key, and orders go to Masar from the order page, in bulk, or on their own when they become Processing. The shop hears back through webhooks and marks orders completed when delivered.")}</p>
            <p className="mt-3"><a href="/downloads/masar-woocommerce.zip" className="font-medium text-accent-deep hover:underline">{t("Download the WooCommerce plugin")}</a></p>
            <p className="mt-3 text-ink-2">{t("Shopify and YouCan: export your orders as CSV and import the file as it is. Masar reads their columns, groups Shopify's product rows into one order, finds the wilaya and commune in YouCan's address, and does not collect orders marked paid.")}</p>
          </section>

          <section id="orders" className="scroll-mt-8">
            <h2 className="display text-3xl">{t("Orders")}</h2>
            <p className="mt-3 text-ink-2">{t("Send your own order number as externalRef. Sending the same number again creates nothing and answers 409 with the tracking number you already have, so a retry after a timeout is safe.")}</p>
            <Code>{`POST /api/v1/parcels
{ "externalRef": "WC-1042", "recipientName": "Amina Belkacem",
  "recipientPhone": "0550 12 34 56", "destWilayaId": 16,
  "commune": "Bab Ezzouar", "address": "Cité 5 juillet, bt 12",
  "weightKg": 1, "codAmount": 4500,
  "deliveryType": "home", "allowPartial": false, "exchange": false }

→ 201 { "parcel": { "id": "…", "tracking": "MSR004512907", … } }
→ 409 { "code": "duplicate_order", "tracking": "MSR004512907", … }`}</Code>
            <p className="mt-3 text-ink-2">{t("For a stop desk, send deliveryType desk and a stopDeskId from GET /api/v1/desks instead of the commune and address.")}</p>
          </section>

          <section id="webhooks" className="scroll-mt-8">
            <h2 className="display text-3xl">{t("Webhooks")}</h2>
            <p className="mt-3 text-ink-2">{t("Add your address under Integrations. Masar sends parcel.created and parcel.status_changed as JSON. Answer with any 2xx within 8 seconds; otherwise Masar tries again after 1 minute, 5 minutes, 30 minutes, 2 hours, 6 hours and 24 hours.")}</p>
            <Code>{`POST https://your-shop.dz/masar
masar-event: parcel.status_changed
masar-delivery: 3f6c…
masar-signature: t=1763740800,v1=5d41402abc4b2a76…

{ "id": "3f6c…", "event": "parcel.status_changed", "createdAt": "…",
  "data": { "parcel": { "tracking": "MSR004512907", "externalRef": "WC-1042",
    "status": "delivered", "previousStatus": "out_for_delivery",
    "codAmount": 4500, "collectedAmount": null, "deliveryFee": 400, … } } }`}</Code>
            <p className="mt-3 text-ink-2">{t("Check every request: compute HMAC-SHA256 of the t value, a dot and the raw body with your signing secret, compare it with v1, and refuse anything older than five minutes. The same event can arrive twice; use its id to skip repeats.")}</p>
            <Code>{`const [t, v1] = header.split(",").map((p) => p.split("=")[1]);
const ok = crypto.timingSafeEqual(
  Buffer.from(crypto.createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`).digest("hex")),
  Buffer.from(v1),
) && Math.abs(Date.now() / 1000 - Number(t)) < 300;`}</Code>
          </section>

          <section id="bulk" className="scroll-mt-8">
            <h2 className="display text-3xl">{t("Bulk orders")}</h2>
            <p className="mt-3 text-ink-2">{t("Send up to 1,000 orders. Wilaya and commune can be a code or a name, as in spreadsheet imports. Add dryRun to check without creating. If any order has an error, nothing is created and each order's result comes back.")}</p>
            <Code>{`POST /api/v1/parcels/bulk
{
  "dryRun": true,
  "orders": [
    { "name": "Amina Belkacem", "phone": "0550 12 34 56", "wilaya": 16,
      "commune": "Bab Ezzouar", "address": "Cité 5 juillet, bt 12",
      "cod": 4500, "weight": 1.5, "lang": "ar" },
    { "name": "Yacine Haddad", "phone": "0661 22 33 44", "wilaya": "Oran",
      "commune": "Es Senia", "address": "Rue 12", "cod": 2900 }
  ]
}

→ 200 { "created": [], "invalid": 0,
        "results": [{ "index": 0, "ok": true, "errors": [], "warnings": [], "deliveryFee": 400 }, …] }`}</Code>
            <p className="mt-3 text-ink-2">{t("Send the same body without dryRun to create the orders. The answer is 201 with each tracking number and fee.")}</p>
          </section>

          <section id="errors" className="scroll-mt-8">
            <h2 className="display text-3xl">{t("Errors")}</h2>
            <p className="mt-3 text-ink-2">{t("Errors are JSON with an error message, and the status says what kind:")}</p>
            <dl className="mt-5 divide-y divide-line rounded-2xl bg-white ring-1 ring-line">
              {[
                ["400", t("The body is not valid. The message names the field.")],
                ["401", t("No token, or it has ended. Sign in again.")],
                ["403", t("Your role cannot do this.")],
                ["404", t("Nothing with that id or tracking number.")],
                ["409", t("This order number was already sent. The answer carries its tracking number.")],
                ["422", t("The request cannot be carried out, for example a move the parcel's status does not allow, or a bulk order with an error. Nothing was changed.")],
                ["429", t("Too many attempts. Wait for the retry-after seconds.")],
              ].map(([c, d]) => (
                <div key={c} className="flex gap-5 px-5 py-3">
                  <dt className="tnum w-10 font-mono font-medium">{c}</dt>
                  <dd className="text-[15px] text-ink-2">{d}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section id="endpoints" className="scroll-mt-8">
            <h2 className="display text-3xl">{t("Endpoints")}</h2>
            {groups.map(([g, eps]) => (
              <div key={g} className="mt-8">
                <h3 className="font-medium">{g}</h3>
                <ul className="mt-3 divide-y divide-line overflow-hidden rounded-2xl bg-white ring-1 ring-line">
                  {eps.map((e) => (
                    <li key={e.method + e.path} className="grid gap-1 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] sm:gap-6">
                      <span dir="ltr" className="ltr flex min-w-0 items-center gap-2 font-mono text-[13px]">
                        <span className={`w-11 shrink-0 font-medium ${e.method === "GET" ? "text-info" : "text-accent-deep"}`}>{e.method}</span>
                        <span className="truncate">{e.path}</span>
                      </span>
                      <span className="text-[14px] text-ink-2">
                        {e.what} <span className="text-muted">({e.who})</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
