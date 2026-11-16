import type { Metadata, Viewport } from "next";
import "@fontsource-variable/noto-sans-arabic";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { I18nProvider } from "@/components/i18n-client";
import { isRtl } from "@/i18n/config";
import { DICTS, initLocale } from "@/lib/i18n";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Masar — delivery across Algeria", template: "%s · Masar" },
  description: "Masar is a logistics platform for Algeria: pickup, hub network, cash on delivery and live tracking in every wilaya.",
};

export const viewport: Viewport = { themeColor: "#0c1a26", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const l = await initLocale();
  return (
    <html lang={l} dir={isRtl(l) ? "rtl" : "ltr"} className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <I18nProvider locale={l} dict={DICTS[l]}>{children}</I18nProvider>
      </body>
    </html>
  );
}
