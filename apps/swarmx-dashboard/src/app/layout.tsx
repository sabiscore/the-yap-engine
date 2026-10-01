import type { Metadata, Viewport } from "next";
import Link from "next/link";
import {
  Bot,
  Clapperboard,
  Home,
  ListVideo,
  Menu,
  Settings,
  UserRound,
  Workflow,
} from "lucide-react";
import "./globals.css";
import { PRODUCT_BRAND } from "@/lib/brand";
import { SystemStatus } from "@/components/SystemStatus";

const dashboardVersion =
  process.env.NEXT_PUBLIC_SWARMX_VERSION ??
  process.env.npm_package_version ??
  "0.1.0";

const HEADER_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/video#studio", label: "Studio", icon: Clapperboard },
  { href: "/video#queue", label: "Queue", icon: ListVideo },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

const BOTTOM_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/video#studio", label: "Studio", icon: Clapperboard },
  { href: "/video#queue", label: "Queue", icon: ListVideo },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings#account", label: "User", icon: UserRound },
] as const;

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
        <div className="min-h-dvh">
          <header className="sticky top-0 z-50 border-b border-border bg-bg-base/95 pt-[env(safe-area-inset-top)] backdrop-blur-sm">
            <div className="mx-auto flex min-h-14 w-full max-w-7xl items-center gap-3 px-4 sm:px-6">
              <Link
                href="/"
                className="flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border-accent bg-bg-surface font-mono text-[10px] font-black tracking-tight text-accent">
                  YE
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-heading text-sm font-semibold tracking-tight text-text-primary">
                    {PRODUCT_BRAND.name}
                  </span>
                  <span className="hidden text-[10px] font-mono uppercase tracking-[0.18em] text-text-muted sm:block">
                    Creative Hub
                  </span>
                </span>
              </Link>

              <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
                {HEADER_NAV.map(({ href, label, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 text-xs font-medium text-text-muted transition-colors hover:bg-bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {label}
                  </Link>
                ))}
              </nav>

              <div className="ml-auto flex items-center gap-2">
                <div className="hidden sm:block">
                  <SystemStatus compact />
                </div>
                <details className="relative md:hidden">
                  <summary className="flex min-h-11 min-w-11 list-none cursor-pointer items-center justify-center rounded-md border border-border bg-bg-surface text-text-secondary transition-colors hover:border-border-active hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan [&::-webkit-details-marker]:hidden">
                    <Menu className="h-5 w-5" aria-hidden="true" />
                    <span className="sr-only">Open navigation menu</span>
                  </summary>
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] w-[min(20rem,calc(100vw-2rem))] rounded-xl border border-border bg-bg-surface p-2 shadow-xl">
                    <div className="mb-2 rounded-lg border border-border/60 bg-bg-base px-3 py-2 sm:hidden">
                      <SystemStatus compact />
                    </div>
                    <nav aria-label="Mobile navigation" className="grid gap-1">
                      {HEADER_NAV.map(({ href, label, icon: Icon }) => (
                        <Link
                          key={href}
                          href={href}
                          className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-cyan"
                        >
                          <Icon className="h-4 w-4 text-accent-cyan" aria-hidden="true" />
                          {label}
                        </Link>
                      ))}
                    </nav>
                  </div>
                </details>
              </div>
            </div>
          </header>

          <div className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-6">
            {children}
          </div>

          <nav
            className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg-base/98 pb-[env(safe-area-inset-bottom)] md:hidden"
            aria-label="Mobile primary navigation"
          >
            <div className="mx-auto grid h-16 max-w-lg grid-cols-5">
              {BOTTOM_NAV.map(({ href, label, icon: Icon }) => (
                <Link
                  key={label}
                  href={href}
                  className="flex min-h-16 flex-col items-center justify-center gap-1 text-[10px] font-medium text-text-muted transition-colors hover:bg-bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-cyan"
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                  <span>{label}</span>
                </Link>
              ))}
            </div>
          </nav>
        </div>
      </body>
    </html>
  );
}
