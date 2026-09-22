"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatSupportMessage, parseApiError } from "@/lib/api-error";
import { toast } from "@/lib/toast";
import type { RankingRenderPreviewPayload } from "@/lib/testing-render-preview";
import { Loader2 } from "lucide-react";

interface RankingTemplateSummary {
  id: string;
  name: string;
  number_overlay: Record<string, unknown>;
}

interface RankingVisualFeaturePanelProps {
  title: string;
  description: string;
  settingsSlot: React.ReactNode;
  buildRenderInput: (templateId: string) => RankingRenderPreviewPayload;
  onTemplateSelected?: (template: RankingTemplateSummary) => void;
}

/**
 * Ranking's visual-feature tabs (Bounce/number-overlay, SFX alignment) skip
 * "Update template": Ranking's 4 templates are shipped config.json files,
 * not user-owned rows — mutating them at runtime would corrupt the
 * built-in template for everyone on that checkout. The template picker
 * here is read-only: it just loads a starting point.
 */
export function RankingVisualFeaturePanel({
  title,
  description,
  settingsSlot,
  buildRenderInput,
  onTemplateSelected,
}: RankingVisualFeaturePanelProps) {
  const [templates, setTemplates] = useState<RankingTemplateSummary[]>([]);
  const [templateId, setTemplateId] = useState("rapid_fire");
  const [rendering, setRendering] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/ranking/templates", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectTemplate = (id: string) => {
    setTemplateId(id);
    const template = templates.find((t) => t.id === id);
    if (template) onTemplateSelected?.(template);
  };

  const handleApply = async () => {
    setRendering(true);
    try {
      const response = await fetch("/api/testing/ranking-render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildRenderInput(templateId)),
      });
      if (!response.ok) {
        const info = await parseApiError(response, "Render failed");
        throw new Error(formatSupportMessage(info));
      }
      const blob = await response.blob();
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
      toast.success("Rendered.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Render failed");
    } finally {
      setRendering(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Base template (read-only starting point)</Label>
        <Select value={templateId} onValueChange={handleSelectTemplate}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Ranking&apos;s templates are built-in config files, not user-editable — settings here only affect this
          preview.
        </p>
      </div>

      <div className="border border-border p-3 space-y-2">{settingsSlot}</div>

      <p className="text-xs text-muted-foreground">
        Renders a compilation from the bundled sample ranking clips (test-fixtures/ranking/media) — Ranking needs
        multiple inputs, so there&apos;s no single &quot;default test clip&quot; for this tool.
      </p>

      <div className="flex gap-2">
        <Button type="button" onClick={handleApply} disabled={rendering}>
          {rendering && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
          Apply
        </Button>
        {previewUrl && (
          <Button type="button" variant="outline" asChild>
            <a href={previewUrl} download="ranking-preview.mp4">
              Download
            </a>
          </Button>
        )}
      </div>

      {previewUrl && (
        <div className="space-y-2">
          <Label>Preview</Label>
          <video src={previewUrl} className="w-full max-w-xs rounded" controls autoPlay muted />
        </div>
      )}
    </div>
  );
}
