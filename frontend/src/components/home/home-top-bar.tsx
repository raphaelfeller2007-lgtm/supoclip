"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, Activity, Home, Settings } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { toast } from "@/lib/toast";

/** Persistent, thin header — wordmark left, icon-only quick access right.
 * Sticky so it stays visible while a page scrolls, and rendered from every
 * app-shell layout (home, clipping, rank, testing, settings) so it's the
 * one nav bar visible on every screen. Deliberately no search input here
 * (per product direction: this is an operator dashboard, not a search
 * surface). */
export function HomeTopBar() {
  const pathname = usePathname();
  const isHome = pathname === "/";

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background">
      <div className="max-w-6xl mx-auto px-4 h-12 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.png" alt="SupoClip" width={24} height={24} className="rounded-sm" />
          <span className="text-title text-foreground">SupoClip</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/">
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Home"
              aria-current={isHome ? "page" : undefined}
              className={isHome ? "text-foreground" : "text-muted-foreground"}
            >
              <Home className="w-4 h-4" />
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Notifications"
            onClick={() => toast.info("Notifications are coming soon")}
          >
            <Bell className="w-4 h-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="System status"
            onClick={() => {
              if (!isHome) return;
              document.getElementById("system-status-strip")?.scrollIntoView({ behavior: "smooth" });
            }}
          >
            <Activity className="w-4 h-4" />
          </Button>
          <Link href="/settings">
            <Button variant="ghost" size="icon-sm" aria-label="Settings">
              <Settings className="w-4 h-4" />
            </Button>
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
