import { noIndexMetadata } from "@/lib/seo";
import { ToolTabs } from "@/components/tool-tabs";
import { HomeTopBar } from "@/components/home/home-top-bar";

export const metadata = noIndexMetadata;

// Shared shell for every Ranking-tool route (create, tasks/[id]) — a route
// group ("(rank)"), so it changes none of their URLs. Mirrors
// (clipping)/layout.tsx exactly.
export default function RankingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HomeTopBar />
      <ToolTabs />
      {children}
    </>
  );
}
