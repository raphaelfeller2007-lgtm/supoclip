"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/publish/channels", label: "Channels" },
  { href: "/publish/analytics", label: "Analytics" },
] as const;

/**
 * In-tool nav for the Publish tool's two browsable destinations (Channels,
 * Analytics) — Select/Schedule aren't listed here since they only make
 * sense mid-workflow with a taskId/clipIds query string, not as a nav
 * target. Deliberately lighter than ToolTabs (no border-b-2, no icon) so it
 * reads as in-page navigation, not a second tab strip. Rendered on all 4
 * Publish pages unconditionally — safe since every page autosaves, so
 * there's no unsaved-work risk in offering this exit mid-workflow.
 */
export function PublishSubNav() {
  const pathname = usePathname();

  return (
    <div className="border-b border-border bg-background">
      <div className="max-w-6xl mx-auto px-4 flex items-center gap-4 h-10">
        {LINKS.map((link) => {
          const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {link.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
