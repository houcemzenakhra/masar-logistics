import type { Metadata, Viewport } from "next";
import "@fontsource-variable/noto-sans-arabic";
import "@fontsource-variable/readex-pro";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { BrandProvider } from "@/components/brand";
import { I18nProvider } from "@/components/i18n-client";
import { DEFAULT_BRAND, currentBrand, darker } from "@/server/services/brand";
import { isRtl, translate } from "@/i18n/config";
import { DICTS, initLocale } from "@/lib/i18n";
import "./globals.css";

const staging = process.env.MASAR_ENV === "staging";

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await currentBrand();
  return {
    title: { default: `${name} — delivery across Algeria`, template: `%s · ${name}` },
    description: `${name} is a logistics platform for Algeria: pickup, hub network, cash on delivery and live tracking in every wilaya.`,
    // A staging copy must not show up in search results next to the real site.
    ...(staging ? { robots: { index: false, follow: false } } : {}),
  };
}

export const viewport: Viewport = { themeColor: "#0c1a26", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const l = await initLocale();
  const brand = await currentBrand();
  // A company's own colour replaces the default everywhere the theme uses it.
  const colours = brand.accent === DEFAULT_BRAND.accent ? undefined : ({ "--color-accent": brand.accent, "--color-accent-deep": darker(brand.accent), "--color-accent-soft": `${brand.accent}1f` } as React.CSSProperties);
  return (
    <html lang={l} dir={isRtl(l) ? "rtl" : "ltr"} style={colours} className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        {staging && (
          <div className="no-print bg-warn px-4 py-1.5 text-center text-xs font-medium text-white">
            {translate(DICTS[l], "Staging: test data only. Parcels here are not real and no money moves.")}
          </div>
        )}
        <I18nProvider locale={l} dict={DICTS[l]}>
          <BrandProvider value={{ name: brand.name, supportPhone: brand.supportPhone, supportEmail: brand.supportEmail }}>{children}</BrandProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
