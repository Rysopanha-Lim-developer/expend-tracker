import type { Metadata, Viewport } from "next";
import { DM_Sans, Manrope, Noto_Sans_Khmer } from "next/font/google";
import ServiceWorkerCleanup from "./service-worker-cleanup";
import "./globals.css";

const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans" });
const manrope = Manrope({ subsets: ["latin"], variable: "--font-manrope" });
const notoSansKhmer = Noto_Sans_Khmer({ subsets: ["khmer"], variable: "--font-noto-khmer" });

export const metadata: Metadata = {
  title: "MoneyGuard — Know where your money went",
  description: "A simple personal expense tracker for dollars and riel.",
  applicationName: "MoneyGuard",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: "MoneyGuard", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#10140d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
      <html lang="en" className={`${dmSans.variable} ${manrope.variable} ${notoSansKhmer.variable}`}>
        <body>
          <ServiceWorkerCleanup />
          {children}
        </body>
    </html>
  );
}
