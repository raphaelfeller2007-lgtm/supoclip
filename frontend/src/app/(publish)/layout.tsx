import { noIndexMetadata } from "@/lib/seo";
import { ToolTabs } from "@/components/tool-tabs";
import { HomeTopBar } from "@/components/home/home-top-bar";
import { PublishSubNav } from "@/components/publish/publish-sub-nav";

export const metadata = noIndexMetadata;

// Shared shell for every Publish-tool route (select, schedule, channels,
// analytics) — a route group ("(publish)"), so it changes none of their
// URLs. Mirrors (rank)/layout.tsx, plus an in-tool secondary nav since this
// tool has two independent browsable destinations (Channels, Analytics)
// rather than one linear flow.
export default function PublishLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HomeTopBar />
      <ToolTabs />
      <PublishSubNav />
      {children}
    </>
  );
}
