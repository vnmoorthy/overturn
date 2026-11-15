# Overturn design system

Editorial, evidence-first, calm. Warm paper, ink type, one mint accent. It should read like a
well-set legal brief that happens to be software, not a neon AI dashboard.

## Tokens (src/index.css `@theme`)

| Role | Class | Value |
|---|---|---|
| Page | `bg-paper` (= `bg-ink-950`) | `#f7f5f0` |
| Card / raised | `bg-paper-high` (= `bg-ink-900`) | `#fcfbf7` |
| Inset / well | `bg-paper-low` (= `bg-ink-800`) | `#efede6` |
| Hairline | `border-line` · stronger `border-line-strong` | `#d8d4c8` · `#c9c5b8` |
| Ink (primary text) | `text-ink-100` | `#141414` |
| Secondary text | `text-ink-300` | `#57544b` |
| Muted / labels | `text-ink-400` · faint `text-faint` | `#6e6a5e` · `#a29d8d` |
| Accent | `bg-mint` / text `text-mint-deep` / tint `bg-mint-pale` / on-mint text `text-mint-ink` | `#2fce96` / `#0c8a5f` / `#dff5ec` / `#06301f` |
| Lab (the one dark surface) | `bg-lab` + `border-lab-line` + `.grid-lab` | `#0d0f0e` |
| Danger | `text-rose-700`, tint `bg-rose-50`, border `border-rose-200` | |
| Warning | `text-amber-800`, tint `bg-amber-50`, border `border-amber-200` | |

The ink-* scale is inverted for paper (950 = page, 100 = darkest ink), so existing `text-ink-100/300/400`
classes are already correct.

## Type

- **Headlines:** `font-serif` (IBM Plex Serif) weight 500, tight tracking `tracking-[-0.03em]` (hero up to
  `-0.045em`), line-height ~1.0–1.1. Never bold sans for a headline.
- **Accent phrase** inside a headline: `<span className="text-gradient">…</span>` renders Plex Serif *italic*
  in deep mint. One accent phrase per headline, max.
- **Body:** Plex Sans 13.5–16px, `text-ink-300` for paragraphs, `leading-relaxed`.
- **Labels / eyebrows / table headers / status words:** `.eyebrow` (Plex Mono 10.5px, uppercase,
  `tracking-[0.13em]`, `text-ink-400`). Use `<Eyebrow>` from the kit.
- **Machine output, ids, codes, model names, hashes, line numbers:** `font-mono` 11–12.5px.
- **Big numbers:** `font-serif` 500, ink (`text-ink-100`), with a mono label underneath. Color a number
  only when its color *means* something (mint for recovered/won, rose for a violation count).

## Surfaces & shape

- Cards: kit `<Card>` (paper-high, 1px `line`, 8px radius, faint shadow). Inner wells: `bg-paper-low`
  with `border-line/70`, radius 6px (`rounded-md`).
- Radii: buttons/badges 3–4px, cards 8px (`rounded-lg`), never `rounded-2xl+` except pills.
- No gradients, glows, blur blobs, glassmorphism, neon or rainbow. Shadows are soft and grey.
- Status is shown with a **left rule** (2–3px bar) or a small mono badge, not a fully tinted card.
  A violation card = paper-high card + `border-l-2 border-l-rose-600`; ok = `border-l-mint`.
- Diff / evidence highlights look like code-review diffs: `bg-mint-pale` row with a `border-l-2 border-mint`
  for supporting text; `bg-rose-50` + `border-l-2 border-rose-400` for removed/contradicted text.
- The **lab** surface (`bg-lab text-[#e9e7e0]`, `.grid-lab`, mono text, mint highlights) is for at most
  one "machine at work" element per page (agent run log, trace terminal, live-call console).
- Terminal-style blocks: header strip with three 7px dots `bg-line-strong` + mono title, body mono 12.5px,
  `$` prompt lines in `text-mint-deep`, dimmed past lines `text-faint`, result line with mint-pale band.

## Components (src/ui/kit.tsx)

`Button` (primary = ink black, success = mint, outline, subtle, ghost, danger), `Card`, `Badge`
(mono uppercase), `ModelChip` (mono + status dot), `Eyebrow`, `SectionTitle` (eyebrow + serif title),
`Modal`, `toast`, `Field`, `EmptyState`, `Toggle`, `Logo`, `Wordmark`.

## Motion

Short, functional: 150–250ms fades/slides, spring for layout. No infinite decorative animation except a
blinking caret (`.caret`) or a live-status dot. Respect `prefers-reduced-motion`.

## Don'ts

- Don't use `text-white` on paper. Don't use violet, cyan or pink as accents.
- Don't use emoji, sparkles icons as decoration, or gradient text.
- Don't put more than one accent color in a component.
