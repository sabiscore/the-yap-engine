import type { Metadata } from "next";
import "./globals.css";
import { PRODUCT_BRAND } from "@/lib/brand";

const dashboardVersion =
  process.env.NEXT_PUBLIC_SWARMX_VERSION ??
  process.env.npm_package_version ??
  "0.1.0";

export const metadata: Metadata = {
  title: {
    default: PRODUCT_BRAND.name,
    template: `%s | ${PRODUCT_BRAND.name}`,
  },
  description:
    `${PRODUCT_BRAND.name} — ${PRODUCT_BRAND.descriptor}. ${PRODUCT_BRAND.transitionNote}. Runtime ${dashboardVersion}.`,
  keywords: ["video creation", "short-form video", "creator", "AI", "Yap Engine"],
};

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    // [V6.1-FIX-13] Use CSS font fallbacks instead of network-fetched
    // next/font Google assets so production builds stay deterministic offline.
    <html lang="en" className="h-full" suppressHydrationWarning>
      <body className="h-full bg-bg-base text-text-primary antialiased">
        {children}
      </body>
    </html>
  );
}
