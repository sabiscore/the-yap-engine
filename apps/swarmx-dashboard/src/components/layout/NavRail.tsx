"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Film,
  FileText,
  Home,
  MessageSquareText,
  Settings,
  SlidersHorizontal,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Overview", icon: Home },
  { href: "/agents", label: "Agents", icon: Bot },
  { href: "/workflows", label: "Workflows", icon: Workflow },
  { href: "/composer", label: "Composer", icon: MessageSquareText },
  { href: "/logs", label: "Logs", icon: FileText },
  { href: "/video", label: "Video", icon: Clapperboard, badge: "LOW-RAM" },
  { href: "/series", label: "Series", icon: Film },
  { href: "/system", label: "System", icon: SlidersHorizontal },
  { href: "/settings", label: "Settings", icon: Settings },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavRailItem({
  item,
  isActive,
  expanded,
}: {
  item: NavItem;
  isActive: boolean;
  expanded: boolean;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      aria-label={expanded ? undefined : item.label}
      aria-current={isActive ? "page" : undefined}
      title={expanded ? undefined : item.label}
      className={cn(
        "group relative flex h-9 items-center gap-3 rounded border px-2.5 text-sm",
        "transition-colors duration-(--duration-micro)",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
        expanded ? "justify-start" : "justify-center",
        isActive
          ? "border-border-accent bg-[var(--color-accent-dim)] text-text-primary nav-item-active-glow"
          : "border-transparent text-text-muted hover:border-border hover:bg-bg-elevated hover:text-text-secondary",
      )}
    >
      <Icon
        className={cn(
          "h-4 w-4 shrink-0 transition-colors",
          isActive ? "text-accent" : "text-text-muted group-hover:text-text-secondary",
        )}
        aria-hidden="true"
      />
      <span className={cn("min-w-0 truncate", expanded ? "inline" : "sr-only")}>
        {item.label}
      </span>
      {item.badge && expanded && (
        <span className="ml-auto shrink-0 rounded border border-border-accent bg-[var(--color-accent-dim)] px-1 py-0.5 text-[9px] font-mono uppercase tracking-wide text-accent">
          {item.badge}
        </span>
      )}
      {item.badge && !expanded && (
        <span
          className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-accent"
          aria-hidden="true"
        />
      )}
    </Link>
  );
}

export function NavRail() {
  const pathname = usePathname();
  const expanded = useUIStore((s) => s.navExpanded);
  const toggleNav = useUIStore((s) => s.toggleNav);

  return (
    <nav
      className="row-start-2 col-start-1 flex h-full min-w-0 flex-col border-r border-border bg-bg-surface/80 px-2 py-2"
      aria-label="Main navigation"
    >
      <div className={cn("mb-2 flex items-center gap-2 px-1", expanded ? "justify-between" : "justify-center")}>
        <Link
          href="/"
          className={cn(
            "flex min-w-0 items-center gap-2 rounded px-1.5 py-1.5",
            "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent",
          )}
          aria-label="Yap Engine overview"
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border-accent bg-[var(--color-accent-dim)] font-mono text-[10px] font-black text-accent">
            YE
          </span>
          {expanded && (
            <span className="min-w-0 truncate text-sm font-semibold tracking-tight text-text-primary">
              Yap Engine
            </span>
          )}
        </Link>
        {expanded && (
          <button
            type="button"
            onClick={toggleNav}
            className="flex h-7 w-7 items-center justify-center rounded text-text-muted transition-colors hover:bg-bg-elevated hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            aria-label="Collapse navigation"
            aria-expanded={expanded}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {!expanded && (
        <button
          type="button"
          onClick={toggleNav}
          className="mb-2 flex h-8 items-center justify-center rounded border border-transparent text-text-muted transition-colors hover:border-border hover:bg-bg-elevated hover:text-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          aria-label="Expand navigation"
          aria-expanded={expanded}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}

      <div className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.map((item) => (
          <NavRailItem
            key={item.href}
            item={item}
            isActive={isActivePath(pathname, item.href)}
            expanded={expanded}
          />
        ))}
      </div>

      <div className={cn("mt-3 border-t border-border pt-2", expanded ? "px-1" : "text-center")}>
        <p className="font-mono text-[10px] uppercase tracking-wide text-text-muted/70">
          {expanded ? "APEX-17 Console" : "A17"}
        </p>
      </div>
    </nav>
  );
}
