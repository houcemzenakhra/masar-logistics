import type { Metadata, Viewport } from "next";
import "@fontsource-variable/noto-sans-arabic";
import "@fontsource-variable/readex-pro";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { I18nProvider } from "@/components/i18n-client";
import { isRtl, translate } from "@/i18n/config";
import { DICTS, initLocale } from "@/lib/i18n";
import "./globals.css";

const staging = process.env.MASAR_ENV === "staging";

export const metadata: Metadata = {
  title: { default: "Masar — delivery across Algeria", template: "%s · Masar" },
  description: "Masar is a logistics platform for Algeria: pickup, hub network, cash on delivery and live tracking in every wilaya.",
  // A staging copy must not show up in search results next to the real site.
  ...(staging ? { robots: { index: false, follow: false } } : {}),
};

export const viewport: Viewport = { themeColor: "#0c1a26", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const l = await initLocale();
  return (
    <html lang={l} dir={isRtl(l) ? "rtl" : "ltr"} className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {staging && (
          <div className="no-print bg-warn px-4 py-1.5 text-center text-xs font-medium text-white">
            {translate(DICTS[l], "Staging: test data only. Parcels here are not real and no money moves.")}
          </div>
        )}
        <I18nProvider locale={l} dict={DICTS[l]}>{children}</I18nProvider>
      </body>
    </html>
  );
}
