import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";

import { isRtl } from "@/shell/locale";
import { resolveLocale, resolveTheme } from "@/shell/preferences";

import "./globals.css";

export const metadata: Metadata = {
  title: "Pulse",
  description: "Username-first realtime chat",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await resolveLocale();
  const theme = await resolveTheme();
  const messages = await getMessages();

  return (
    <html lang={locale} dir={isRtl(locale) ? "rtl" : "ltr"} data-theme={theme}>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
