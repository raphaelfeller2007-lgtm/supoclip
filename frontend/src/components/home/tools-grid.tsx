import { TOOLS } from "@/tools/registry";
import { ToolCard } from "./tool-card";

/**
 * The Tools section — one card per entry in the tool registry
 * (frontend/src/tools/registry.ts). Adding a tool there is the whole
 * integration surface; this grid needs no changes to pick it up.
 */
export function ToolsGrid({ processingCount }: { processingCount: number }) {
  return (
    <section>
      <h2 className="text-label uppercase text-muted-foreground mb-3">Tools</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {TOOLS.map((tool) => (
          <ToolCard
            key={tool.id}
            tool={tool}
            statusLabel={
              tool.id === "clipping" && processingCount > 0
                ? `${processingCount} processing`
                : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
