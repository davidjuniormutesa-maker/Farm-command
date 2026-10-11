import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";
import { Providers } from "@/components/farm/providers";

export const metadata: Metadata = {
  title: "Farm Command — Your farm. Your data. Your decisions.",
  description:
    "Offline-first farm management for Zambia. Livestock, crops, tasks & reminders, vaccinations, finances, reports — your farm in one place.",
  applicationName: "Farm Command",
  manifest: "/manifest.webmanifest",
  keywords: ["farm management", "Zambia", "agriculture", "livestock", "crops", "PWA"],
  authors: [{ name: "Farm Command" }],
  icons: {
    icon: "/icons/icon-192.png",
    apple: "/icons/icon-192.png",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Farm Command",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f3b2e",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${GeistSans.variable} ${GeistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
