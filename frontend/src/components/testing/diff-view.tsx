"use client";

// Hand-rolled recursive JSON diff — fixtures/outputs here are structured
// JSON, not free text, so a proper text-diff library isn't needed. Per
// DESIGN.md, a difference is signaled by weight (bold) + a rule, never a
// color, since the palette has no sanctioned "changed" hue.

function allKeys(a: unknown, b: unknown): string[] {
  const aKeys = a && typeof a === "object" && !Array.isArray(a) ? Object.keys(a as object) : [];
  const bKeys = b && typeof b === "object" && !Array.isArray(b) ? Object.keys(b as object) : [];
  return Array.from(new Set([...aKeys, ...bKeys]));
}

function isEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function DiffNode({ left, right, depth = 0 }: { left: unknown; right: unknown; depth?: number }) {
  const equal = isEqual(left, right);

  const bothObjects =
    left &&
    right &&
    typeof left === "object" &&
    typeof right === "object" &&
    !Array.isArray(left) &&
    !Array.isArray(right);

  if (!equal && bothObjects) {
    const keys = allKeys(left, right);
    return (
      <div style={{ paddingLeft: depth > 0 ? 16 : 0 }}>
        {keys.map((key) => (
          <div key={key} className="border-l border-border pl-2">
            <span className="font-medium text-foreground">{key}: </span>
            <DiffNode
              left={(left as Record<string, unknown>)[key]}
              right={(right as Record<string, unknown>)[key]}
              depth={depth + 1}
            />
          </div>
        ))}
      </div>
    );
  }

  if (equal) {
    return <span className="text-muted-foreground">{JSON.stringify(left)}</span>;
  }

  return (
    <span className="font-semibold text-foreground border-b-2 border-foreground">
      {JSON.stringify(left)} → {JSON.stringify(right)}
    </span>
  );
}

export function DiffView({
  left,
  right,
  leftLabel,
  rightLabel,
}: {
  left: unknown;
  right: unknown;
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        Bold + underline marks a difference between <strong>{leftLabel}</strong> and{" "}
        <strong>{rightLabel}</strong> (shown as left → right).
      </p>
      <div className="text-xs font-mono bg-muted/30 border border-border p-3 overflow-x-auto">
        <DiffNode left={left} right={right} />
      </div>
    </div>
  );
}
