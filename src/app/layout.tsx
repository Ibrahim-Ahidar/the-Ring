import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getTranslations } from "next-intl/server";

import { isRtl } from "@/shell/locale";
import { StaleBuildReload } from "@/shell/components/StaleBuildReload";
import { TimeZoneSync } from "@/shell/components/TimeZoneSync";
import { resolveLocale, resolveTheme, resolveTimeZone } from "@/shell/preferences";

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

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f5f3" },
    { media: "(prefers-color-scheme: dark)", color: "#161717" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveLocale();
  const theme = await resolveTheme();
  const timeZone = await resolveTimeZone();
  const messages = await getMessages();

  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"} data-theme={theme}>
      <body>
        <StaleBuildReload />
        <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
          <TimeZoneSync timeZone={timeZone}>{children}</TimeZoneSync>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
