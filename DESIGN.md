# SupoClip Design System

International Typographic (Swiss) Style. This document is the source of truth for
every UI decision in the app. If code and this document disagree, fix the code —
unless the change is intentional, in which case update this document in the same
commit.

## 1. Principles

- **Grid discipline.** Every element aligns to the grid and the 8px spacing scale
  below. Nothing floats free of it.
- **Sans-serif only.** One text typeface, used at every size. See §3.
- **Flush-left, ragged-right.** No centered text unless the element is
  structurally centered (e.g. a single icon in a fixed-size tile) — never
  centered body copy or headings.
- **Asymmetry over balance.** Layouts are built from unequal column spans, not
  mirrored/centered compositions.
- **Whitespace is structural.** Space is used to group and separate content,
  not left over. Don't fill space just because it's empty.
- **Absolute hierarchy.** Contrast comes from a small number of very different
  sizes/weights, not many similar ones. See the type scale.
- **Rules serve structure.** A hairline exists to separate or group content —
  never as decoration.
- **No ornament.** No drop shadows, no gradients. Radius is `0` everywhere
  except the one named `radius-full` exception (pills, circular controls,
  discs — see §6.1). Any other exception must be documented here first.
- **Color is functional.** Color communicates state or interactivity. It is
  never chosen for decoration.

## 2. Color

Twelve tokens, full stop: a paper/ink pairing plus one signal accent. No new
hues — contrast comes from scale, weight, and space instead.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--color-surface` | `#f3f0e8` | `#0a0a0a` | Page background and the default ground of every cell. |
| `--color-surface-muted` | `#e6e2d6` | `#1a1a1a` | Quiet cell fill, a step off surface. Set apart from surface by a rule or position, never shade alone. |
| `--color-ink` | `#0a0a0a` | `#f3f0e8` | Primary text, hairlines, structure. 17:1 on surface. |
| `--color-ink-muted` | `#57534b` | `#a8a49b` | Secondary text, captions, metadata. 5.9:1+ on surface/surface-muted. Never on an ink or accent fill. |
| `--color-brand-accent` | `#ff3b14` | `#ff4a26` | The one accent, a signal red-orange: primary action fill, one accent cell, one shape a reader must find first. 3.1:1+ as a fill. Never as small text. |
| `--color-accent-ink` | `#b92500` | `#ff5a38` | The accent as text or a thin line. 4.5:1+ on surface/surface-muted/accent-soft. |
| `--color-accent-soft` | `#ffe1d6` | `#3a1408` | Tinted ground that highlights or groups content behind ink or accent-ink text. |
| `--color-on-accent` | `#0a0a0a` (both) | `#0a0a0a` (both) | Text/icons on an accent fill. Always black — never white, in either theme. |
| `--color-on-ink` | alias of `surface` | alias of `surface` | Text on an ink fill (an ink cell). Inverts with the theme. |
| `--color-rule` | alias of `ink` | alias of `ink` | Structural lines: grid edges, section rules, control borders. |
| `--color-rule-soft` | `#c9c4b5` | `#3a3a3a` | Decorative-only lines: the dotted grid guide, quiet separators already set apart by space. Below 3:1 on surface — never the only thing that carries meaning. |
| `--color-focus-ring` | alias of `ink` | alias of `ink` | Keyboard focus: solid 2px outline, 2px gap. Becomes `on-ink`/`on-accent` inside an ink/accent cell. |

### Functional states

There are no status hues. With only ink and the one accent available, state is
carried by **words, weight, and the accent** — never a semaphore of colors.

- **Primary action** → accent fill (`--color-brand-accent`), `on-accent` text.
- **Warning / Error** → **not a color.** Rendered as ink at heavier weight plus
  a rule, or an inverted block (surface text on an ink fill). Never a new hue.
  See `task-status-dot.tsx` for the reference implementation of an
  inverted-block error state.

### Semantic tokens (`frontend/src/app/globals.css`)

Every ShadCN/Radix primitive already consumes these semantic variables, so
retheming happens here, not in the components:

| Variable | Maps to | Notes |
|---|---|---|
| `--background`/`--foreground` | surface / ink | |
| `--card`, `--popover`, `--muted` | = background / surface-muted | flat — no elevation tiers |
| `--card-foreground`, `--popover-foreground`, `--muted-foreground` | = foreground / ink-muted | "muted" means smaller/lighter type or the muted ink tone, never a dimmed opacity |
| `--primary` | `brand-accent` | `--primary-foreground` is `on-accent` (always black) |
| `--secondary` | `surface-muted` | there is no second accent hue — "secondary" is a quiet/structural variant, not a color variant |
| `--accent`/`--accent-foreground` | `accent-soft` / `accent-ink` | **naming collision, read carefully:** this is ShadCN's own generic "accent" slot (hover/highlight role), distinct from our brand token `--color-brand-accent`. Do not repoint this at the brand red — that's what `--primary` is for. |
| `--destructive` | `ink` | pair with weight/rule, not a hue — doubly true now since red is reserved for primary actions |
| `--border`, `--input` | `rule` (ink alias) | solid 1px hairline, never alpha |
| `--ring` | `focus-ring` (ink alias) | solid 2px focus ring, no blur |

One sanctioned exception: modal/sheet scrims use `bg-black/50` (`dialog.tsx`,
`alert-dialog.tsx`, `sheet.tsx`) — a functional dimming layer, not a
decorative tint, and deliberately plain black rather than the `ink` token so
it darkens consistently in both themes (`ink` itself flips to a light color in
dark mode, which would lighten a scrim instead of dimming it). Don't add any
other alpha usage of the palette.

A second sanctioned exception: `landing-page.tsx`'s `HeroVisual` demo player
overlays a caption gradient (`bg-gradient-to-t from-black/70`) and semi-opaque
play/mute control backgrounds directly on arbitrary video pixels, not a themed
surface — alpha here is what keeps controls/captions legible over unpredictable
video content, the same rationale as the scrim above. `backdrop-blur` is not
part of the exception — softness is ornamental, translucency is functional,
so blur is dropped from both controls while the alpha stays.

## 3. Typography

**Font stack:** `"Helvetica Neue", Helvetica, Arial, "Liberation Sans",
sans-serif` (`--font-helvetica`, mapped to Tailwind's `font-sans`) — one
sans-serif, used everywhere. `Geist Mono` (`--font-geist-mono`, `font-mono`)
is preserved for numerals, timestamps, and status/system text (e.g.
`status-strip.tsx`) — the guide this system is drawn from doesn't cover
monospace, so this existing assignment is kept as-is. No third family in
core-product screens. (`Syne` remains loaded only for the marketing pages
that are being phased out — do not use it in any new core-product UI.)

Weights are light (300), regular (400) or bold (700) only — except the
`label` level's 500, used for tiny uppercase tags where true bold reads too
heavy at that size. Never a second typeface, italics, underlines, or
decorative styles for hierarchy.

| Level | Size / line-height | Weight | Tracking | Usage |
|---|---|---|---|---|
| `display-xl` | 160px / 144px (56px mobile) | 700 | -0.05em | The poster line: at most once per view, may bleed off an edge. |
| `display` | 96px / 88px (44px mobile) | 700 | -0.04em | The message of a view when `display-xl` is too large. |
| `headline` | 56px / 52px (32px mobile) | 700 | -0.03em | Section titles, several per view. |
| `title` | 24px / 28px | 700 | -0.01em | Titles inside a cell, list headings, card/panel titles. |
| `subtitle` | 20px / 26px | 300 (light) | — | Standfirst under a display or headline. |
| `body` | 16px / 22px | 400 | — | Default reading/UI text. |
| `small` | 13px / 18px | 400 | — | Secondary text, button labels, table cells, form hints. |
| `label` | 11px / 14px | 500 | 0.06em | Captions, metadata, cell numbers, status/tab labels, table column headers. **Always paired with `uppercase`** — the type-scale token sets size/weight/tracking but can't force text-transform. |

These generate Tailwind utilities directly (`text-display-xl`, `text-display`,
`text-headline`, `text-title`, `text-subtitle`, `text-body`, `text-small`,
`text-label`) from `@theme` in `globals.css` — pick a level by its utility
class, never an arbitrary `text-[Npx]`.

Hierarchy comes from jumping between these levels, not from intermediate
sizes. If a design needs something between two levels, it's using the wrong
level — pick the one that reads correctly at a glance.

## 4. Grid & Spacing

**Base unit: 8px.** Every margin, padding, and gap is one of these steps,
using Tailwind's existing default numeric scale (no custom `@theme` spacing
tokens — Tailwind's default `0.25rem`-per-step scale already lands exactly
on these values, so redefining `--spacing-*` would collide with and silently
change every other numeric spacing utility in the app):

| Step | px | Tailwind class (e.g. padding) |
|---|---|---|
| space-1 | 8px | `p-2` |
| space-2 | 16px | `p-4` |
| space-3 | 24px | `p-6` |
| space-4 | 32px | `p-8` |
| space-5 | 48px | `p-12` |
| space-6 | 64px | `p-16` |
| space-7 | 96px | `p-24` |
| space-8 | 128px | `p-32` |
| gutter | 20px | `p-5` / `gap-5` |

Reach for the larger step first — whitespace is an active element, not
leftover space. `p-5`/`gap-5` (20px) is reserved for the grid gutter role;
don't use it as generic spacing. Other in-between Tailwind steps (`p-3`,
`p-7`, `p-10`, etc.) aren't part of this scale — don't use them either.

**Grid:** 4 columns by default, collapsing to 2 columns at the 600px
breakpoint (structure survives; only the arrangement shifts — a cell spanning
3+ columns spans the full 2, and `start` offsets drop). A 12-column "wide"
variant is available for poster/marketing-style layouts with staggered,
offset cells. This is greenfield relative to the previous system, which used
Tailwind's raw default breakpoints with no custom grid scale — the 4/12/2
column tokens now live as spacing/grid conventions rather than a Tailwind
config (Tailwind v4 here is CSS-only, via `@theme` in `globals.css`).

**Breaking the grid:** rare, and only for full-bleed media that has no
meaningful column boundary — a video preview frame, a clip thumbnail grid.
Even then, the container around the media stays on-grid.

## 5. Components

Each rule below states geometry/states and points at the file that owns it.

### Buttons — `frontend/src/components/ui/button.tsx`
CVA variants: `default` (primary/accent fill, `on-accent` black text),
`secondary` (quiet surface-muted fill), `outline`/`ghost` (ink border or
transparent, ink text), `destructive` (ink fill, surface text — weight
carries the warning, not a hue). Square corners (radius token is 0). Focus
state is the solid 2px ink (`focus-ring`) ring. Disabled state is reduced to
`opacity-50` — the one exception to "no opacity tricks", since it
communicates non-interactivity rather than color meaning.

### Inputs — `frontend/src/components/ui/{input,select,switch,slider,textarea,checkbox}.tsx`
1px rule (ink) hairline border, square corners, no inner shadow. Focus =
solid ink (`focus-ring`) ring, no border-color change (avoids introducing a
new color state). Disabled = `opacity-50`. Select/switch/slider handles are
ink or accent fills, never new colors. Switch and slider thumbs use
`rounded-full` — the sanctioned `radius-full` pill exception (see §6.1).

### Cards — `frontend/src/components/ui/card.tsx`, `home/tool-card.tsx`
Flat: same background as the page, separated by a 1px ink hairline border,
never a shadow. Internal padding is `space-3` (`24px`, `p-6`). A card's own
internal layout still follows the 8px scale and flush-left text.

### Tables / lists
Row height is a multiple of the base unit. Rows are separated by a single 1px
hairline (`divide-y`), not alternating background stripes. Hover = swap
`background`↔`foreground` is too strong; use a 1px ink border appearing on the
row instead. Selection = ink background fill with surface text (inverted
block), consistent with the warning/error convention.

### Tabs / navigation — `frontend/src/components/tool-tabs.tsx`
Active tab: 2px ink bottom border + full-weight text. Inactive tab: no
border, `muted-foreground` weight (same color, lighter/smaller type per §2).
No pill backgrounds, no rounded tab shape.

### Modals / dialogs — `frontend/src/components/ui/{dialog,alert-dialog,sheet}.tsx`
Square corners, 1px ink border, `bg-black/50` scrim (the one sanctioned
alpha use — see §2 for why it's plain black rather than the ink token).
Width: `max-w-2xl` for standard dialogs, full-width `Sheet` for editor side
panels. Actions are flush-right in the footer, primary action last
(rightmost).

### Toasts — `frontend/src/lib/toast.ts`, `components/ui/sonner.tsx`
Bottom-positioned (Sonner default), square corners, ink border. Success/info/
warning auto-dismiss at 4s; errors persist until dismissed
(`duration: Infinity`) — this behavior already exists in `lib/toast.ts` and
is unchanged by this refactor. Always import `toast` from `@/lib/toast`, never
`sonner` directly.

### Progress indicators — `frontend/src/components/ui/progress.tsx`
A single 4px-tall ink track with an accent fill bar. No rounded ends. An
indeterminate state uses the existing `command-bar-pulse` keyframe idiom
(border-weight pulse) rather than a shimmering gradient.

### Empty states
Icon (ink, no color fill) + one line of `body` copy + one primary button.
Existing pattern in `EmptyState`/`recent-projects.tsx` — unchanged by this
refactor beyond token/type-scale swaps.

### Loading states
Skeleton blocks (`components/ui/skeleton.tsx`) at `background`/`foreground`
contrast, 300ms delay before showing (existing decision, unchanged).

### Rank number tile — `backend/src/ranking_overlay.py` (burned-in), Ranking
tool's ordering list (on-screen)
A fixed square tile with a single centered digit — the sanctioned
"structurally centered" exception from §1/§7. **Not migrated this pass:**
the shipped Ranking output and its on-screen preview still use the previous
ink/teal/blue vocabulary literally, since page-level and backend rendering
code are out of scope for this foundation pass — see "Known follow-ups"
below. When migrated, tile fill should become ink or accent (never a second
new color), digit `on-ink`/`on-accent` on a filled tile, ink on the (rare)
surface-tile override.

### Gold #1 — Ranking tool's `ranking_classic` template only
`build_ranking_overlay_ass`'s #1 rank tile/text render in gold (`#FFD700`),
and the rank-select UI (`(rank)/rank/create/page.tsx`) previews that same
gold on the #1 slot. This remains the **one deliberate exception** to "no new
colors" — scoped to Ranking *video output* and the UI previewing that
output, never to site chrome. Unchanged by this pass (out of scope — see
"Known follow-ups"). See DECISIONS.md's "Ranking videos use full color" entry
for the reasoning; don't extend gold (or any other new color) to a site-UI
element on the strength of this precedent.

### Folder-based clip picker — `(rank)/rank/create/page.tsx`
Three-step flow (folder → select → text), built from existing primitives
only: a bordered drop zone (`border-border`, matches the editor's upload
zones) with two `Button variant="outline"` triggers for the OS folder
picker (`<input webkitdirectory>`) and a plain multi-file picker: a
`grid grid-cols-2 sm:grid-cols-4` thumbnail grid (matches the template
picker's grid pattern elsewhere in this tool); a `Badge variant="outline"`
for "used N×" usage-count hints, reusing the same badge component and
outline style as status badges on `/list`. No new component was added —
this screen composes existing `Button`/`Input`/`Textarea`/`Badge`/
`EmptyState` the same way `(clipping)/create` does. Not re-themed to the new
type scale this pass — see "Known follow-ups".

### Known follow-ups (out of scope for this foundation pass)
This pass covered `globals.css` tokens, font loading, and the shared
`components/ui/*` primitives only. Individual screens still reference the
previous vocabulary until a follow-up pass touches them:
- `(clipping)/create`, `tasks/[id]`, `(rank)/rank/create`,
  blog/privacy pages — not re-themed; some use arbitrary `text-[Npx]` sizing
  instead of the new type scale (heaviest in `rank/create/page.tsx`).
  `landing-page.tsx` was re-themed in a later pass (Syne removed, full type
  scale adopted, flush-left/asymmetric hero, no shadows/gradients/blur, one
  accent-fill cell) — see its own file for the current pattern.
- `backend/src/ranking_overlay.py` — burned-in rank-tile colors unchanged.
- `rank/create/page.tsx`'s `bg-[#FFD700]` gold badge — unchanged (see "Gold
  #1" above).
- `home/tool-card.tsx`'s one arbitrary `text-[11px] font-mono` badge — could
  move onto `text-label` once a page-level pass touches this file.
- The `text-title`/`text-subtitle` levels still have no adopters beyond
  `landing-page.tsx`'s use of `text-title` — wire them up as each remaining
  screen gets its re-theme pass. `text-display-xl`/`text-display`/
  `text-headline`/`text-label` are now live on the landing page, which is
  also what added the mobile step-down media query for the three poster
  levels (`globals.css`, below the `@theme inline` block) — the levels
  themselves had no responsive behavior wired in before that.

## 6. Tokens Reference

### 6.1 Radius
`--radius-sm/md/lg/xl` are all pinned to `0px` in the `@theme inline` block of
`globals.css` — square by default, everywhere. The one named exception is
`--radius-full` (`9999px`), for pills, circular controls, and discs — already
used by the switch and slider thumbs (`rounded-full`). The source guide also
defines `radius-sm` (10px) and `radius-lg` (20px) for "one deliberate rounded
outer container", but neither is wired into `@theme` in this pass — no
current component needs them. If a future screen genuinely needs one, add it
to `@theme` and document the usage here first, per §7.

### 6.2 Full variable table
See `frontend/src/app/globals.css` `:root`/`.dark` blocks — they are the
literal source; this document's §2 table mirrors them by role.
`frontend/components.json`'s `baseColor: "neutral"` is nominal only (shadcn
CLI generator metadata, closest stock option to a black/white-driven
palette) — the real tokens are hand-authored in `globals.css`, not derived
from it.

## 7. How to add a new screen

1. Pick every type size from the §3 table (`text-display-xl` … `text-label`)
   — no arbitrary `text-[Npx]`. Pair `text-label` with `uppercase`.
2. Every spacing value is a step on the 8px scale from §4
   (`space-1`…`space-8`, plus `gutter`) — no arbitrary in-between values.
3. Build interactive elements from `components/ui/*` primitives only — don't
   hand-roll a button/input/dialog.
4. No new colors, shadows, or gradients. Radius stays `0` except the
   sanctioned `radius-full` pill/circle exception. If the palette genuinely
   can't express something, that's a signal to rethink the design, not to add
   a color.
5. Default to flush-left, ragged-right text. Centered text needs a structural
   reason (e.g. a number inside a fixed square tile).
6. Lay the screen out on the grid from §4 (4 columns, or the 12-column wide
   variant for poster-style layouts); note in your PR description if and why
   you broke it.
7. If your screen needs a rule not covered here, add it to this document in
   the same change, not after the fact.
