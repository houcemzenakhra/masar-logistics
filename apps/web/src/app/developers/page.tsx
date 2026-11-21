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
      { method: "GET", path: "/api/v1/parcels", who: t("Signed in"), what: t("Your parcels. Filter with status and q.") },
      { method: "GET", path: "/api/v1/parcels/:id", who: t("Signed in"), what: t("One parcel with its full history.") },
      { method: "GET", path: "/api/v1/merchant/wallet", who: t("Merchant"), what: t("Balance and ledger entries.") },
    ]],
    [t("Reference data"), [
      { method: "GET", path: "/api/v1/wilayas", who: t("Anyone"), what: t("Wilayas with zone and hub, and the rate table.") },
      { method: "GET", path: "/api/v1/wilayas/:id/communes", who: t("Anyone"), what: t("Communes of a wilaya, with ids to use on orders.") },
      { method: "GET", path: "/api/v1/communes?q=", who: t("Anyone"), what: t("Search communes by name in French or Arabic.") },
      { method: "GET", path: "/api/v1/track/:tracking", who: t("Anyone"), what: t("Public status and scans, with no personal details.") },
    ]],
    [t("Couriers and hubs"), [
      { method: "GET", path: "/api/v1/courier/tasks", who: t("Courier"), what: t("Today's parcels for the signed-in courier.") },
      { method: "GET", path: "/api/v1/courier/route", who: t("Courier"), what: t("The same stops in driving order.") },
      { method: "POST", path: "/api/v1/parcels/:id/transition", who: t("Courier, hub"), what: t("Record delivery, a failed attempt or another move.") },
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
            {[["#auth", t("Sign in")], ["#bulk", t("Bulk orders")], ["#errors", t("Errors")], ["#endpoints", t("Endpoints")]].map(([h, l]) => (
              <li key={h}><a href={h} className="hover:text-ink">{l}</a></li>
            ))}
          </ul>
        </nav>
        <div className="min-w-0 max-w-3xl space-y-16">
          <section id="auth" className="scroll-mt-8">
            <h2 className="display text-3xl">{t("Sign in")}</h2>
            <p className="mt-3 text-ink-2">{t("Exchange an email and password for a token, then send it on every call. Tokens last a week. A password reset ends every token for that account at once.")}</p>
            <Code>{`curl -X POST https://<your-masar>/api/v1/auth/login \\
  -H "content-type: application/json" \\
  -d '{"email":"shop@example.dz","password":"…"}'

→ { "token": "eyJhbGciOi…", "user": { "role": "merchant", … } }

curl https://<your-masar>/api/v1/parcels \\
  -H "authorization: Bearer eyJhbGciOi…"`}</Code>
            <p className="mt-3 text-[14px] text-muted">{t("Repeated wrong passwords are slowed down and answered with 429 and a retry-after header.")}</p>
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
