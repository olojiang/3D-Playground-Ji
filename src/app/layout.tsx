import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/playfair-display";
import "./globals.css";
import { themeCss, THEME_BOOT_SCRIPT } from "@/core/themes";
import { translate } from "@/core/i18n";
import { SITE_URL } from "@/core/seo";
import { requestLang } from "@/server/lang";
import { summaries } from "@/server/catalog";
import { Providers } from "@/components/Providers";
import { Monitoring } from "@/components/Monitoring";

const currentLang = requestLang;

export async function generateMetadata(): Promise<Metadata> {
  const lang = await currentLang();
  return {
    title: { default: `${translate(lang, "app.name")} · ${translate(lang, "app.tagline")}`, template: `%s · ${translate(lang, "app.name")}` },
    description: translate(lang, "app.description"),
    applicationName: "3D Playground",
    metadataBase: new URL(SITE_URL),
    openGraph: { siteName: "3D Playground", type: "website", locale: lang === "zh" ? "zh_CN" : "en_US", title: translate(lang, "app.name"), description: translate(lang, "app.description") },
    twitter: { card: "summary_large_image" },
    formatDetection: { telephone: false, email: false, address: false },
  };
}
export const viewport: Viewport = { themeColor: "#08080b", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await currentLang();
  return (
    <html lang={lang === "zh" ? "zh-CN" : "en"} data-theme="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
        <style dangerouslySetInnerHTML={{ __html: themeCss() }} />
      </head>
      <body>
        <Providers initialLang={lang} catalog={summaries()}>{children}</Providers>
        <Monitoring />
      </body>
    </html>
  );
}
