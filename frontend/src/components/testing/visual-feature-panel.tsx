"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { formatSupportMessage, parseApiError } from "@/lib/api-error";
import { toast } from "@/lib/toast";
import type { RenderPreviewPayload, TemplateSummary } from "@/lib/testing-render-preview";
import { Loader2 } from "lucide-react";

interface DefaultClipInfo {
  filename: string;
  duration_seconds: number;
  size_bytes: number;
}

interface VisualFeaturePanelProps<TValue> {
  featureKey: string;
  title: string;
  description: string;
  featureLabel: string;
  templateSection: string | null;
  templateSectionNote?: string;
  value: TValue;
  onValueChange: (value: TValue) => void;
  fromTemplateSettings?: (settings: Record<string, unknown>) => TValue;
  toSectionValues?: (value: TValue) => Record<string, unknown>;
  settingsSlot: React.ReactNode;
  buildRenderInput: ((sessionClipKey: string | undefined) => RenderPreviewPayload) | null;
  overlaySlot?: React.ReactNode;
}

async function sendJson<T>(url: string, method: "POST" | "PATCH", body: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const info = await parseApiError(response, "Request failed");
    throw new Error(formatSupportMessage(info));
  }
  return response.json();
}

/**
 * Shared shell for a Testing tab "visual feature" sub-tab: template picker
 * -> real settings component (passed in as `settingsSlot`) -> default clip
 * -> Apply (re-render) -> preview -> Download -> "Update template" (writes
 * only this feature's section into the selected template).
 *
 * `buildRenderInput: null` means this feature never calls the backend to
 * render (Safe Zones — the overlay is frontend-only, see `overlaySlot`).
 */
export function VisualFeaturePanel<TValue>({
  featureKey,
  title,
  description,
  featureLabel,
  templateSection,
  templateSectionNote,
  value,
  onValueChange,
  fromTemplateSettings,
  toSectionValues,
  settingsSlot,
  buildRenderInput,
  overlaySlot,
}: VisualFeaturePanelProps<TValue>) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [defaultClip, setDefaultClip] = useState<DefaultClipInfo | null>(null);
  const [defaultClipChecked, setDefaultClipChecked] = useState(false);
  const [sessionClipKey, setSessionClipKey] = useState<string | undefined>(undefined);
  const [sessionClipPreviewUrl, setSessionClipPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/templates", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { templates: [] }))
      .then((data) => setTemplates(data.templates ?? []))
      .catch(() => setTemplates([]));
  }, []);

  useEffect(() => {
    fetch("/api/testing/default-clip", { cache: "no-store" })
      .then(async (r) => (r.ok ? ((await r.json()) as DefaultClipInfo) : null))
      .then(setDefaultClip)
      .catch(() => setDefaultClip(null))
      .finally(() => setDefaultClipChecked(true));
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (sessionClipPreviewUrl) URL.revokeObjectURL(sessionClipPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectTemplate = useCallback(
    async (templateId: string) => {
      setSelectedTemplateId(templateId);
      if (!templateId || !fromTemplateSettings) return;
      try {
        const response = await fetch(`/api/templates/${templateId}`, { cache: "no-store" });
        if (!response.ok) throw new Error("Failed to load template");
        const data = await response.json();
        onValueChange(fromTemplateSettings(data.settings ?? {}));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load template");
      }
    },
    [fromTemplateSettings, onValueChange]
  );

  const handleOverrideUpload = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(
        `/api/testing/default-clip?scope=session&feature_key=${encodeURIComponent(featureKey)}`,
        { method: "POST", body: formData }
      );
      if (!response.ok) {
        const info = await parseApiError(response, "Failed to upload clip");
        throw new Error(formatSupportMessage(info));
      }
      setSessionClipKey(featureKey);
      setSessionClipPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(file);
      });
      toast.success("Using this clip for this tab's preview only.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload clip");
    } finally {
      setUploading(false);
    }
  };

  const hasAClip = Boolean(sessionClipKey || defaultClip);
  const clipSrc = sessionClipPreviewUrl ?? (defaultClip ? "/api/testing/default-clip/file" : null);

  const handleApply = async () => {
    if (!buildRenderInput) return;
    setRendering(true);
    try {
      const payload = buildRenderInput(sessionClipKey);
      const response = await fetch("/api/testing/render-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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

  const selectedTemplate = templates.find((t) => t.id === selectedTemplateId);

  const handleUpdateTemplate = async () => {
    if (!templateSection || !selectedTemplateId || !toSectionValues) return;
    setUpdating(true);
    try {
      await sendJson(`/api/templates/${selectedTemplateId}/section/${templateSection}`, "PATCH", {
        values: toSectionValues(value),
      });
      toast.success(`Updated "${selectedTemplate?.name ?? "template"}" — ${featureLabel} settings only.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update template");
    } finally {
      setUpdating(false);
      setConfirmOpen(false);
    }
  };

  const showRenderControls = buildRenderInput !== null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-1">{description}</p>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Base template</Label>
        <Select value={selectedTemplateId} onValueChange={handleSelectTemplate}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Start from a template's current values..." />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} ({t.section_count} sections)
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!fromTemplateSettings && (
          <p className="text-xs text-muted-foreground">
            Read-only starting point — see the note below about updating this feature.
          </p>
        )}
      </div>

      <div className="border border-border p-3 space-y-2">{settingsSlot}</div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Test clip</Label>
          <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            {uploading && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
            {sessionClipKey ? "Use a different clip" : "Use a different clip for this test"}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleOverrideUpload(file);
              e.target.value = "";
            }}
          />
        </div>
        {defaultClipChecked && !hasAClip && (
          <p className="text-xs text-muted-foreground">
            No default test clip yet — upload one above for this tab, or set a default for every visual tab in{" "}
            <Link href="/settings" className="underline">
              Settings → Testing
            </Link>
            .
          </p>
        )}
        {clipSrc && (
          <div className="relative w-full max-w-xs aspect-[9/16] bg-black rounded overflow-hidden">
            <video src={clipSrc} className="w-full h-full object-contain" controls muted />
            {overlaySlot && <div className="absolute inset-0">{overlaySlot}</div>}
          </div>
        )}
      </div>

      {showRenderControls && (
        <div className="flex gap-2">
          <Button type="button" onClick={handleApply} disabled={rendering || !hasAClip}>
            {rendering && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Apply
          </Button>
          {previewUrl && (
            <Button type="button" variant="outline" asChild>
              <a href={previewUrl} download={`${featureKey}-preview.mp4`}>
                Download
              </a>
            </Button>
          )}
        </div>
      )}

      {showRenderControls && previewUrl && (
        <div className="space-y-2">
          <Label>Preview</Label>
          <video src={previewUrl} className="w-full max-w-xs rounded" controls autoPlay muted />
        </div>
      )}

      <Separator />

      {templateSection ? (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" disabled={!selectedTemplateId} onClick={() => setConfirmOpen(true)}>
            Update template
          </Button>
          {!selectedTemplateId && <p className="text-xs text-muted-foreground">Pick a base template above first.</p>}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{templateSectionNote}</p>
      )}

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Update template?</AlertDialogTitle>
            <AlertDialogDescription>
              Update &quot;{selectedTemplate?.name}&quot; → {featureLabel} settings with the current values? (Other
              settings unchanged)
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleUpdateTemplate} disabled={updating}>
              {updating ? "Updating..." : "Update"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
