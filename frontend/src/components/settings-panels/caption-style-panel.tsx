"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { FontSelectOption, type FontOption } from "@/components/font-select-option";
import { TemplatePicker, type TemplateInfo } from "@/components/template-picker";
import { FONT_SIZE_OPTIONS, FONT_TEMPLATE_DEFAULT_VALUE } from "@/lib/font-options";

interface CaptionStylePanelProps {
  fontFamily: string | null;
  fontSize: number | null;
  fontColor: string | null;
  captionTemplate: string;
  onFontFamilyChange: (value: string | null) => void;
  onFontSizeChange: (value: number | null) => void;
  onFontColorChange: (value: string | null) => void;
  onCaptionTemplateChange: (value: string) => void;
  availableFonts: FontOption[];
  availableTemplates: TemplateInfo[];
  deletingFontName?: string | null;
  onDeleteFont?: (font: FontOption) => void;
}

/**
 * The real caption/font styling controls — same component used by the
 * Project Settings sheet and the Testing tab's Captions sub-tab.
 */
export function CaptionStylePanel({
  fontFamily,
  fontSize,
  fontColor,
  captionTemplate,
  onFontFamilyChange,
  onFontSizeChange,
  onFontColorChange,
  onCaptionTemplateChange,
  availableFonts,
  availableTemplates,
  deletingFontName = null,
  onDeleteFont,
}: CaptionStylePanelProps) {
  return (
    <>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Font</label>
        <Select
          value={fontFamily ?? FONT_TEMPLATE_DEFAULT_VALUE}
          onValueChange={(value) => onFontFamilyChange(value === FONT_TEMPLATE_DEFAULT_VALUE ? null : value)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Template default" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={FONT_TEMPLATE_DEFAULT_VALUE}>Template default</SelectItem>
            {availableFonts.map((font) => (
              <FontSelectOption
                key={font.name}
                font={font}
                isDeleting={deletingFontName === font.name}
                onDelete={onDeleteFont ?? (() => {})}
              />
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Size</label>
        <div className="grid grid-cols-4 gap-1.5">
          {FONT_SIZE_OPTIONS.map((option) => (
            <button
              key={option.label}
              type="button"
              onClick={() => onFontSizeChange(option.value)}
              className={`px-2 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                fontSize === option.value
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-primary"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-muted-foreground">Color</label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={fontColor === null}
              onChange={(e) => onFontColorChange(e.target.checked ? null : "#FFFFFF")}
              className="rounded"
            />
            Template default
          </label>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={fontColor ?? "#FFFFFF"}
            onChange={(e) => onFontColorChange(e.target.value)}
            disabled={fontColor === null}
            className="h-9 w-9 rounded border border-border cursor-pointer disabled:cursor-not-allowed"
          />
          <Input
            value={fontColor ?? ""}
            onChange={(e) => onFontColorChange(e.target.value)}
            disabled={fontColor === null}
            placeholder="Template default"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Caption Template</label>
        <TemplatePicker templates={availableTemplates} selectedId={captionTemplate} onSelect={onCaptionTemplateChange} />
      </div>
    </>
  );
}
