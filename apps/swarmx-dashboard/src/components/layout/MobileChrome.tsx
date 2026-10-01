"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  Clapperboard,
  Home,
  Menu,
  Settings,
  UserRound,
  Workflow,
  X,
  ListChecks,
  FileText,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

const PRIMARY_NAV = [
  { href: "/", label: "Home", icon: Home },
  { href: "/video", label: "Studio", icon: Clapperboard },
  { href: "/video#queue", label: "Queue", icon: ListChecks },
  { href: "/settings", label: "Settings", icon: Settings },
  { href: "/settings#account", label: "User", icon: UserRound },
] as const;

const MENU_NAV = [
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/composer", label: "Composer", icon: Clapperboard },
  { href: "/logs", label: "Logs", icon: FileText },
  { href: "/system", label: "System", icon: Settings },
] as const;

function isActive(pathname: string, href: string): boolean {
  const path = href.split("#", 1)[0] ?? href;
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

export function MobileChrome() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (pathname === "/login") {
    return null;
  }

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b border-border bg-bg-base px-3 sm:px-5"
        role="banner"
      >
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between gap-3">
          <Link
            href="/"
            className="flex min-h-11 min-w-11 shrink-0 items-center gap-2 rounded px-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label="The Yap Engine home"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded border border-border-accent bg-[var(--color-accent-dim)] font-mono text-[10px] font-black text-accent">
              YE
            </span>
            <span className="hidden font-heading text-sm font-semibold tracking-tight text-text-primary sm:inline">
              The Yap Engine
            </span>
          </Link>

          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-1 md:flex" aria-label="Primary navigation">
            {PRIMARY_NAV.slice(0, 3).map((item) => {
              const Icon = item.icon;
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-2 rounded px-3 text-xs font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    active
                      ? "bg-[var(--color-accent-dim)] text-accent"
                      : "text-text-muted hover:bg-bg-surface hover:text-text-primary",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-text-muted sm:inline">
              Research / Local
            </span>
            <details
              className="relative"
              open={menuOpen}
              onToggle={(event) => setMenuOpen(event.currentTarget.open)}
            >
              <summary
                className="flex min-h-11 min-w-11 list-none cursor-pointer items-center justify-center rounded border border-border bg-bg-surface text-text-secondary transition-colors hover:border-border-active hover:text-text-primary [&::-webkit-details-marker]:hidden"
                aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
              >
                {menuOpen ? (
                  <X className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Menu className="h-5 w-5" aria-hidden="true" />
                )}
              </summary>
              <div className="absolute right-0 top-[calc(100%+0.5rem)] z-60 w-64 rounded border border-border bg-bg-surface p-2 shadow-xl">
                <p className="px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.16em] text-text-muted">
                  Workspace
                </p>
                <div className="space-y-1">
                  {MENU_NAV.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(pathname, item.href);
                    return (
                      <Link
                        key={item.label}
                        href={item.href}
                        className={cn(
                          "flex min-h-11 items-center gap-3 rounded px-3 text-sm",
                          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                          active
                            ? "bg-[var(--color-accent-dim)] text-accent"
                            : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
                        )}
                        {...(active ? { "aria-current": "page" } : {})}
                      >
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </details>
          </div>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-bg-base px-2 pt-1.5 md:hidden"
        style={{ paddingBottom: "max(0.375rem, env(safe-area-inset-bottom))" }}
        aria-label="Mobile navigation"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 gap-1">
          {PRIMARY_NAV.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded px-1 text-[10px] font-medium",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  active
                    ? "bg-[var(--color-accent-dim)] text-accent"
                    : "text-text-muted hover:bg-bg-surface hover:text-text-primary",
                )}
              >
                <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
