"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

type NavVariant = "desktop" | "menu" | "tab";

interface NavLinkProps {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly variant: NavVariant;
}

function isActive(pathname: string, href: string): boolean {
  const path = href.split("#")[0] ?? href;
  if (path === "/") return pathname === "/";
  return pathname === path || pathname.startsWith(`${path}/`);
}

const BASE_FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";

const CLASSES: Record<NavVariant, { base: string; active: string; idle: string }> = {
  desktop: {
    base: `inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-medium transition-colors ${BASE_FOCUS}`,
    active: "bg-[var(--color-accent-dim)] text-accent",
    idle: "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
  },
  menu: {
    base: `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm ${BASE_FOCUS}`,
    active: "bg-[var(--color-accent-dim)] text-accent",
    idle: "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
  },
  tab: {
    base: `flex min-h-11 min-w-11 flex-col items-center justify-center gap-1 px-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent`,
    active: "text-accent",
    idle: "text-text-muted hover:bg-bg-surface hover:text-text-primary",
  },
};

export function NavLink({ href, label, icon: Icon, variant }: NavLinkProps) {
  const pathname = usePathname() ?? "/";
  const active = isActive(pathname, href);
  const c = CLASSES[variant];
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${c.base} ${active ? c.active : c.idle}`}
    >
      <Icon
        className={variant === "tab" ? "size-5" : variant === "menu" ? "size-4" : "size-3.5"}
        aria-hidden="true"
      />
      <span>{label}</span>
    </Link>
  );
}
