import type { Metadata, Viewport } from "next";
import Link from "next/link";
import {
  Bot,
  Clapperboard,
  FileText,
  Film,
  Home,
  Menu,
  Settings,
  SlidersHorizontal,
  UserCircle2,
  Workflow,
} from "lucide-react";
import "./globals.css";
import { PRODUCT_BRAND } from "@/lib/brand";
import { NavLink } from "@/components/layout/NavLink";

const dashboardVersion =
  process.env.NEXT_PUBLIC_SWARMX_VERSION ??
  process.env.npm_package_version ??
  "0.1.0";

const MOBILE_NAV = [
  { href: "/", label: "Home", iconName: "home" },
  { href: "/video/studio", label: "Studio", iconName: "studio" },
  { href: "/video", label: "Queue", iconName: "queue" },
  { href: "/settings", label: "Settings", iconName: "settings" },
  { href: "/settings#profile", label: "User", iconName: "user" },
] as const;

const DESKTOP_NAV = [
  { href: "/", label: "Home", iconName: "home" },
  { href: "/video/studio", label: "Studio", iconName: "studio" },
  { href: "/video", label: "Queue", iconName: "queue" },
  { href: "/series", label: "Series", iconName: "series" },
  { href: "/agents", label: "Agents", iconName: "agents" },
  { href: "/workflows", label: "Workflows", iconName: "workflows" },
  { href: "/logs", label: "Logs", iconName: "logs" },
  { href: "/system", label: "System", iconName: "system" },
  { href: "/settings", label: "Settings", iconName: "settings" },
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

          <nav className="hidden items-center gap-1 xl:flex" aria-label="Primary navigation">
            {DESKTOP_NAV.map(({ href, label, iconName }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                iconName={iconName}
                variant="desktop"
              />
            ))}
          </nav>
          <nav className="hidden items-center gap-1 md:flex xl:hidden" aria-label="Primary navigation">
            {DESKTOP_NAV.slice(0, 5).map(({ href, label, iconName }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                iconName={iconName}
                variant="desktop"
              />
            ))}
            <details className="relative">
              <summary
                className="inline-flex min-h-9 list-none cursor-pointer items-center gap-1 rounded-lg px-2 text-xs font-medium text-text-secondary hover:bg-bg-elevated hover:text-text-primary [&::-webkit-details-marker]:hidden"
                aria-label="More navigation links"
              >
                More ▾
              </summary>
              <div className="absolute right-0 top-[calc(100%+0.25rem)] w-48 rounded-xl border border-border bg-bg-surface p-1.5 shadow-lg z-50">
                {DESKTOP_NAV.slice(5).map(({ href, label, iconName }) => (
                  <NavLink
                    key={href}
                    href={href}
                    label={label}
                    iconName={iconName}
                    variant="menu"
                  />
                ))}
              </div>
            </details>
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
              <div className="absolute right-0 top-[calc(100%+0.5rem)] max-h-[80vh] w-64 overflow-y-auto rounded-xl border border-border bg-bg-surface p-2 shadow-xl">
                <div className="mb-2 border-b border-border px-3 pb-2">
                  <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                    Workspace
                  </p>
                </div>
                <div className="grid gap-1">
                  {DESKTOP_NAV.map(({ href, label, iconName }) => (
                    <NavLink
                      key={href}
                      href={href}
                      label={label}
                      iconName={iconName}
                      variant="menu"
                    />
                  ))}
                  <NavLink
                    href="/settings#profile"
                    label="User"
                    iconName="user"
                    variant="menu"
                  />
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
            {MOBILE_NAV.map(({ href, label, iconName }) => (
              <NavLink
                key={href}
                href={href}
                label={label}
                iconName={iconName}
                variant="tab"
              />
            ))}
          </div>
        </nav>
      </body>
    </html>
  );
}
