import type { Metadata, Viewport } from "next";
import "./globals.css";
import { PRODUCT_BRAND } from "@/lib/brand";
import { MobileChrome } from "@/components/layout/MobileChrome";

const dashboardVersion =
  process.env.NEXT_PUBLIC_SWARMX_VERSION ?? process.env.npm_package_version ?? "0.1.0";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0E0E10",
  colorScheme: "dark",
};

export const metadata: Metadata = {
  title: { default: PRODUCT_BRAND.name, template: `%s | ${PRODUCT_BRAND.name}` },
  description: `${PRODUCT_BRAND.name} — ${PRODUCT_BRAND.descriptor}. ${PRODUCT_BRAND.transitionNote}. Runtime ${dashboardVersion}.`,
  keywords: ["video creation", "short-form video", "creator", "AI", "Yap Engine"],
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" data-theme="nocturne-v2" suppressHydrationWarning>
      <body className="min-h-dvh overflow-x-hidden bg-bg-base text-text-primary antialiased">
        <MobileChrome />
        {children}
      </body>
    </html>
  );
}
