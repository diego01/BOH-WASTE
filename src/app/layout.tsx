import type { Metadata, Viewport } from "next";
import { Roboto } from "next/font/google";
import { I18nProvider } from "@/components/I18nProvider";
import { ServiceWorker } from "@/components/ServiceWorker";
import { SyncProvider } from "@/components/SyncProvider";
import { getLang } from "@/lib/i18nServer";
import "./globals.css";

const roboto = Roboto({ variable: "--font-roboto", subsets: ["latin"], weight: ["400", "500", "700"] });

export const metadata: Metadata = {
  title: "BOH Waste",
  description: "Back-of-house waste and donation tracking",
  appleWebApp: { capable: true, title: "BOH Waste", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f3f4f6",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const lang = await getLang();
  return (
    <html lang={lang} className={`${roboto.variable} h-full antialiased`}>
      <body className="min-h-full font-sans">
        <I18nProvider lang={lang}>
          <SyncProvider>{children}</SyncProvider>
        </I18nProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
