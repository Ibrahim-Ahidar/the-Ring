import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Pulse",
  description: "Username-first realtime chat",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  );
}
