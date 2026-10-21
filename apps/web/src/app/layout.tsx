import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import { isRtl } from "@/shell/locale";
import { StaleBuildReload } from "@/shell/components/StaleBuildReload";
import { TimeZoneSync } from "@/shell/components/TimeZoneSync";
import { resolveAccent, resolveLocale, resolveTheme, resolveTimeZone } from "@/shell/preferences";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("shell");
  const name = t("landing.title");
  return {
    title: { default: name, template: `%s · ${name}` },
    description: t("public.desc"),
    applicationName: name,
  };
}

const THEME_COLORS = { indigo: "#4f46e5", green: "#1daa61" } as const;

export async function generateViewport(): Promise<Viewport> {
  const accent = await resolveAccent();
  return {
    width: "device-width",
    initialScale: 1,
    themeColor: THEME_COLORS[accent],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveLocale();
  const theme = await resolveTheme();
  const accent = await resolveAccent();
  const timeZone = await resolveTimeZone();
  const messages = await getMessages();

  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"} data-theme={theme} data-accent={accent}>
      <body>
        <StaleBuildReload />
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          <TimeZoneSync timeZone={timeZone}>{children}</TimeZoneSync>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
