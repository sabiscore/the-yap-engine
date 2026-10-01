import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { Clapperboard, Home, Menu, Settings, UserCircle2, Workflow } from "lucide-react";
import "./globals.css";
import { PRODUCT_BRAND } from "@/lib/brand";
import { MobileChrome } from "@/components/layout/MobileChrome";

const dashboardVersion =
  process.env.NEXT_PUBLIC_SWARMX_VERSION ??
  process.env.npm_package_version ??
  "0.1.0";

const MOBILE_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/video/studio", label: "Studio", icon: Clapperboard },
  { href: "/video", label: "Queue", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings#profile", label: "User", icon: UserCircle2 },
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

function YapMark() {
  return (
    <span
      className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border-accent bg-[var(--color-accent-dim)] font-mono text-[10px] font-black tracking-tight text-accent"
      aria-hidden="true"
    >
      YE
    </span>
  );
}

export default function RootLayout({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full" data-theme="nocturne-v2" suppressHydrationWarning>
      <body className="flex h-full min-h-dvh flex-col overflow-hidden bg-bg-base text-text-primary antialiased">
        <header
          className="relative z-50 flex h-14 shrink-0 items-center justify-between border-b border-border bg-bg-base px-3 sm:px-5"
          role="banner"
        >
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="Yap Engine home"
          >
            <YapMark />
            <span className="min-w-0">
              <span className="block truncate font-heading text-sm font-semibold tracking-tight text-text-primary">
                Yap Engine
              </span>
              <span className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted sm:block">
                Creative Hub
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Primary navigation">
            {MOBILE_NAV.slice(0, 4).map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-medium text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden rounded-md border border-border bg-bg-surface px-2 py-1 font-mono text-[9px] uppercase tracking-wide text-text-muted sm:inline-flex">
              v{dashboardVersion}
            </span>

            <details className="relative md:hidden">
              <summary
                className="flex size-11 list-none cursor-pointer items-center justify-center rounded-lg border border-border bg-bg-surface text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent [&::-webkit-details-marker]:hidden"
                aria-label="Open navigation menu"
              >
                <Menu className="size-5" aria-hidden="true" />
              </summary>
              <div className="absolute right-0 top-[calc(100%+0.5rem)] w-56 rounded-xl border border-border bg-bg-surface p-2">
                <div className="mb-2 border-b border-border px-3 pb-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                    Navigation
                  </p>
                </div>
                <div className="grid gap-1">
                  {MOBILE_NAV.slice(0, 4).map(({ href, label, icon: Icon }) => (
                    <Link
                      key={href}
                      href={href}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Icon className="size-4 text-accent" aria-hidden="true" />
                      {label}
                    </Link>
                  ))}
                  <Link
                    href="/settings#profile"
                    className="flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-text-secondary hover:bg-bg-elevated hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <UserCircle2 className="size-4 text-accent" aria-hidden="true" />
                    User
                  </Link>
                </div>
              </div>
            </details>
          </div>
        </header>

        <div className="min-h-0 flex-1">{children}</div>

        <nav
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg-base pb-[max(0px,env(safe-area-inset-bottom))] md:hidden"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto grid h-16 max-w-xl grid-cols-5">
            {MOBILE_NAV.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                className="group flex min-h-11 flex-col items-center justify-center gap-1 px-1 text-text-muted transition-colors active:bg-bg-surface hover:bg-bg-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              >
                <Icon className="size-4 transition-colors group-hover:text-accent" aria-hidden="true" />
                <span className="font-mono text-[9px] uppercase tracking-wide">{label}</span>
              </Link>
            ))}
          </div>
        </nav>
      </body>
    </html>
  );
}
