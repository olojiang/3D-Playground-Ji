import type { Metadata, Viewport } from "next";
import { cookies } from "next/headers";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/playfair-display";
import "./globals.css";
import { themeCss, THEME_BOOT_SCRIPT } from "@/core/themes";
import { translate } from "@/core/i18n";
import { isLang } from "@/core/userdata";
import { summaries } from "@/server/catalog";
import { Providers } from "@/components/Providers";

async function currentLang() {
  const c = (await cookies()).get("tp-lang")?.value;
  return isLang(c) ? c : "zh";
}

export async function generateMetadata(): Promise<Metadata> {
  const lang = await currentLang();
  return {
    title: { default: `${translate(lang, "app.name")} · ${translate(lang, "app.tagline")}`, template: `%s · ${translate(lang, "app.name")}` },
    description: translate(lang, "app.description"),
    applicationName: "3D Playground",
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
      </body>
    </html>
  );
}
