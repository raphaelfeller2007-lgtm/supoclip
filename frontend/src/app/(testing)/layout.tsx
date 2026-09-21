import { noIndexMetadata } from "@/lib/seo";
import { ToolTabs } from "@/components/tool-tabs";

export const metadata = noIndexMetadata;

// Shared shell for the Testing tool's routes — a route group ("(testing)"),
// so it changes none of their URLs. Mirrors (clipping)/layout.tsx and
// (rank)/layout.tsx exactly.
export default function TestingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ToolTabs />
      {children}
    </>
  );
}
