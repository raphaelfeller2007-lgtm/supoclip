import { noIndexMetadata } from "@/lib/seo";
import { ToolTabs } from "@/components/tool-tabs";
import { HomeTopBar } from "@/components/home/home-top-bar";

export const metadata = noIndexMetadata;

// Shared shell for every Clipping-tool route (create/list/tasks/trash) — a
// route group ("(clipping)"), so it changes none of their URLs. Consolidates
// what were three near-identical per-route layout.tsx files (list, tasks;
// create/trash had none) into one, and adds the tool tab bar described in
// CLAUDE.md's tools/ section. HomeTopBar stacks above it so the same
// sticky nav bar shown on the home screen is visible here too.
export default function ClippingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HomeTopBar />
      <ToolTabs />
      {children}
    </>
  );
}
