import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { Navbar } from "@/components/nav/navbar";
import { Providers } from "@/components/providers";

import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata");

  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale}>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider messages={messages}>
          <Providers>
            <Navbar />
            {/* pb-20 keeps content clear of the mobile bottom tab bar */}
            <div className="pb-20 md:pb-0">{children}</div>
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
