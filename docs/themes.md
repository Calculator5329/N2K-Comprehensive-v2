# Adding a new edition of the almanac

The web UI is themed top-to-bottom. A "theme" controls every visible
surface — colors, fonts, the page-level layout, and even how individual
components like dice and equations render. Adding a new edition is a
small, four-step recipe with no component refactors required.

This document is the canonical guide.

---

## Architecture

The theming system has three layers, each independent of the others:

```
┌──────────────────────────────────────────────────────────┐
│  1.  Theme registry        (TypeScript)                  │
│      web/src/core/themes.ts                              │
│      ───────────────────────                             │
│      Defines `Theme` records: id, label, swatches,       │
│      layout choice, dice/equation variant choice,        │
│      ornament strings, and the heatmap palette.          │
├──────────────────────────────────────────────────────────┤
│  2.  CSS-variable bundles  (CSS)                         │
│      web/src/styles/globals.css                          │
│      ───────────────────────                             │
│      One `[data-theme="<id>"] { --paper-50: ...; ... }`  │
│      block per theme, plus optional treatment            │
│      overrides (textures, scanlines, focus rings, etc.)  │
├──────────────────────────────────────────────────────────┤
│  3.  Component variants    (React)                       │
│      web/src/ui/{DiceGlyph,Equation,layouts}.tsx         │
│      ───────────────────────                             │
│      Components that need to render fundamentally        │
│      differently per theme expose a `switch (variant)`   │
│      and pick which sub-renderer to use.                 │
└──────────────────────────────────────────────────────────┘
```

The `ThemeStore` (`web/src/stores/ThemeStore.ts`) owns the active
`ThemeId`, persists user choice to `localStorage`, and writes
`document.documentElement.dataset.theme` so the CSS bundle takes effect.

Layer 1 + Layer 2 are enough for ~80% of theme work. Layer 3 is only
needed when you want a component to look *structurally* different (not
just recolored or re-typeset).

---

## Recipe — adding a new edition

Suppose you want to add a `wabi` edition (washi paper, vermillion seal,
vertical-feeling layout).

### Step 1.  Register the theme

`web/src/core/themes.ts`:

```ts
export type ThemeId =
  | "almanac" | "phosphor" | "broadsheet" | "risograph" | "arcade"
  | "manuscript" | "blueprint" | "tarot" | "vaporwave" | "receipt"
  | "tabletop" | "subway" | "spreadsheet" | "polaroid" | "comic" | "cartographic"
  | "wabi";

export const THEME_IDS: readonly ThemeId[] = [
  "almanac", "phosphor", "broadsheet", "risograph", "arcade",
  "manuscript", "blueprint", "tarot", "vaporwave", "receipt",
  "tabletop", "subway", "spreadsheet", "polaroid", "comic", "cartographic",
  "wabi",
];

const WABI: Theme = {
  id: "wabi",
  label: "Wabi",
  tagline: "Washi, vermillion seal, ink wash",
  swatches: ["#F4ECDC", "#1A1614", "#A33A2C"],
  // pick a LayoutId:    "sidebar" | "topbar" | "manuscript"
  //                   | "blueprint" | "frame" | "receipt" | "board"
  //                   | "platform" | "spreadsheet" | "scrapbook"
  //                   | "panels" | "chart"
  layout: "sidebar",
  // pick a DiceGlyphStyle: "tile" | "ascii" | "newsroom" | "pip-tile"
  //                      | "illuminated" | "blueprint" | "tarot"
  //                      | "boardgame" | "bullet" | "cell"
  //                      | "polaroid" | "panel" | "buoy"
  glyph: "tile",
  // pick an EquationStyle: "rendered" | "ascii"
  equation: "rendered",
  ornaments: {
    sectionMarker: "印",
    mastheadSuffix: "巻 一",
    ruleStyle: "hairline",
    // optional — used by `frame` and `manuscript` layouts:
    // corner: "❖",
  },
  scale: {
    stops: [
      { at: 0,   color: { r: 244, g: 236, b: 220 } },
      { at: 5,   color: { r: 230, g: 215, b: 195 } },
      { at: 12,  color: { r: 210, g: 180, b: 160 } },
      { at: 25,  color: { r: 180, g: 130, b: 110 } },
      { at: 50,  color: { r: 163, g:  58, b:  44 } },
      { at: 100, color: { r:  60, g:  20, b:  18 } },
    ],
    impossible: { r: 26, g: 22, b: 20 },
  },
};

export const THEMES: Record<ThemeId, Theme> = {
  almanac:    ALMANAC,
  phosphor:   PHOSPHOR,
  broadsheet: BROADSHEET,
  risograph:  RISOGRAPH,
  arcade:     ARCADE,
  manuscript:   MANUSCRIPT,
  blueprint:    BLUEPRINT,
  tarot:        TAROT,
  vaporwave:    VAPORWAVE,
  receipt:      RECEIPT,
  tabletop:     TABLETOP,
  subway:       SUBWAY,
  spreadsheet:  SPREADSHEET,
  polaroid:     POLAROID,
  comic:        COMIC,
  cartographic: CARTOGRAPHIC,
  wabi:         WABI,
};
```

### Step 2.  Add the CSS-variable bundle

`web/src/styles/globals.css`:

```css
[data-theme="wabi"] {
  /* Color tokens — ALWAYS as space-separated RGB triplets so Tailwind's
     /opacity modifiers work (`bg-paper-100/60`).                        */
  --paper-50:  244 236 220;
  --paper-100: 232 222 200;
  --paper-200: 218 205 178;
  --paper-300: 188 170 142;
  --paper-400: 154 136 112;

  --ink-50:   140 122  98;
  --ink-100:   90  78  66;
  --ink-200:   54  46  40;
  --ink-300:   30  26  22;
  --ink-400:   22  18  16;
  --ink-500:   14  10   8;

  --accent-400: 198  72  56;
  --accent-500: 163  58  44;
  --accent-600: 124  40  30;

  --support-400: 114 134 104;
  --support-500:  82 102  78;
  --support-600:  56  72  54;

  --font-display: "Noto Serif JP", "Source Serif 4", ui-serif, serif;
  --font-body:    "Noto Serif JP", "Source Serif 4", ui-serif, serif;
  --font-mono:    "JetBrains Mono", ui-monospace, monospace;

  --page-shadow: 0 1px 0 0 rgba(14, 10, 8, 0.05);
  --page-radius: 0;
  --page-border: 1px solid rgba(14, 10, 8, 0.06);

  --selection-bg: rgb(var(--accent-500));
  --selection-fg: rgb(var(--paper-50));
}
```

Then add any treatment overrides at the bottom of `globals.css`,
following the existing `[data-theme="..."] body { ... }` pattern.

### Step 3.  Add the bootstrap whitelist

`web/index.html` has an inline script that applies the persisted (or
default) theme *before* React mounts to prevent flash-of-unstyled-
content. Add the new id to its allow-list — and update the `DEFAULT`
constant if you're changing which edition serves on first paint
(it must mirror `DEFAULT_THEME` in `core/themes.ts`):

```html
<script>
  (function () {
    var DEFAULT = "tabletop";   // mirror DEFAULT_THEME in core/themes.ts
    var ok = {
      almanac: 1, phosphor: 1, broadsheet: 1, risograph: 1, arcade: 1,
      manuscript: 1, blueprint: 1, tarot: 1, vaporwave: 1, receipt: 1,
      tabletop: 1, subway: 1, spreadsheet: 1, polaroid: 1, comic: 1, cartographic: 1,
      wabi: 1   // <- add here
    };
    var pick = DEFAULT;
    try {
      var t = localStorage.getItem("n2k.theme");
      if (t && ok[t]) pick = t;
    } catch {}
    document.documentElement.setAttribute("data-theme", pick);
  })();
</script>
```

If the theme uses any new fonts, also add a Google Fonts URL to the
`<link rel="stylesheet" ...>`.

### Step 4.  Add the footer colophon

`web/src/ui/nav.ts`:

```ts
export const FOOTER_COLOPHON: Record<string, string> = {
  // ...
  wabi: "Set in Noto Serif JP — ink wash on washi",
};
```

### That's it.

The `ThemeSelector` automatically picks up the new entry from
`THEME_IDS` and renders a swatch flag for it. Both layouts handle
arbitrary numbers of themes. No other component code needs to touch.

---

## CI gate (Phase 7)

Steps 1, 3, and 4 above have no compile-time guarantee — TypeScript
won't catch a missing `FOOTER_COLOPHON` entry or a forgotten
addition to the `index.html` allow-list. Phase 7 added a vitest
suite (`web/tests/themeRegistry.test.ts`) that turns the recipe into
a CI gate:

| Test | What it catches |
|------|-----------------|
| `THEME_IDS matches the keys of THEMES` | You added the id but forgot to register the `Theme` object (or vice versa). |
| `every Theme entry has the same id as its registry key` | Copy-paste error where `id: "wabi"` was registered under `THEMES.tabletop`. |
| `every Theme has a footer colophon registered` | Step 4 was skipped. |
| `every Theme appears in the index.html bootstrap allow-list` | Step 3 was skipped — site would FOUC into the default theme. |
| `every Theme appears in the index.html font preload comment when relevant` | Soft check — the documentation comment is out of date relative to `THEME_IDS`. |
| `scale stops are in non-decreasing at order` | Heatmap palette would render incorrectly. |

Run `npm --workspace web run test` (or `npm run test:web` from the
root) to execute the suite locally. There is no separate "ship test"
script — the registry tests run alongside the rest of the web test
suite.

For a fully-additive example that exercises only Layers 1 + 2 (no
new layout, glyph, equation variant, or font), see the **Herbarium**
edition added in Phase 7. It's the smallest addition possible and a
good starting point for new contributors.

---

## Layouts ship today

Twelve layouts ship today. Use the matching `layout:` value in your theme.
Each layout is a single React component in `web/src/ui/layouts/`.

| `layout` value | File | Composition |
|----------------|------|-------------|
| `"sidebar"` | `SidebarLayout.tsx` | Left masthead column with vertical nav + edition selector + dataset stats; large centered page card. *Used by: Almanac, Phosphor, Risograph, Vaporwave.* |
| `"topbar"` | `TopbarLayout.tsx` | Horizontal masthead with wordmark + date + selector + stats; nav row beneath; full-width content. *Used by: Broadsheet, Arcade.* |
| `"manuscript"` | `ManuscriptLayout.tsx` | Vertical folio rail of section numerals on the left, marginalia rail (Latin labels + selector) on the right, centered illuminated page card with a gilded blackletter wordmark. *Used by: Manuscript.* |
| `"blueprint"` | `BlueprintLayout.tsx` | Drafting-grid background; content sits in a "drawing area"; engineering title block in the bottom-right corner contains the nav, edition selector, dataset stats, and revision date. *Used by: Blueprint.* |
| `"frame"` | `FrameLayout.tsx` | Ornamental gold border around a narrow centered column; corner ornaments (`ornaments.corner`); navigation as a row of arcana cards separated by `ornaments.sectionMarker`. *Used by: Tarot.* |
| `"receipt"` | `ReceiptLayout.tsx` | Narrow ~560px centered column of paper with ✂ scissor-cut perforations top and bottom; dashed perforation rules between sections; navigation as line items; dataset stats as receipt totals with dotted leaders. *Used by: Receipt.* |
| `"board"` | `BoardLayout.tsx` | Vintage board-game frame: navy outer band with L-shaped corner brackets punching outside the corners, butter-yellow play surface inside, big chunky N2K wordmark, navigation as game-tile buttons with hard offset shadows. *Used by: Tabletop.* |
| `"platform"` | `PlatformLayout.tsx` | NYC subway platform: full-bleed black info strip with wordmark + stats + colored route-bullet navigation, yellow tactile-warning safety strips top and bottom (with simulated bumps), white tile body, black footer with platform-edge caption. *Used by: Subway.* |
| `"spreadsheet"` | `SpreadsheetLayout.tsx` | Lotus 1-2-3 / VisiCalc DOS: navy title bar, formula bar showing the active section's address, column-letter row that doubles as navigation, row numbers down the side, status bar with READY indicator, REM-prefix colophon line. *Used by: Spreadsheet.* |
| `"scrapbook"` | `ScrapbookLayout.tsx` | Kraft-paper scrapbook: tilted polaroid wordmark card, washi-tape labels for date/edition, torn-paper stats note, tilted body card with paper-clip ornament, navigation as a row of polaroid cards alternating ±3°. *Used by: Polaroid.* |
| `"panels"` | `PanelsLayout.tsx` | Silver-age comic page: bright halftone background, blue splash masthead with sound-effect display type and a 24-point starburst stat badge, five alternating-tilt nav panels with thick black borders + drop shadows. *Used by: Comic.* |
| `"chart"` | `ChartLayout.tsx` | Aged maritime chart: sepia paper with hairline lat/long grid, four compass-rose corner ornaments, scroll-banner masthead with cursive subtitle, body cartouche with inner hairline border, navigation as ringed navigational buoys, footer with mini SVG compass rose. *Used by: Cartographic.* |

## Dice glyph variants ship today

Thirteen variants ship in `web/src/ui/DiceGlyph.tsx`. Use the matching
`glyph:` value in your theme.

| `glyph` value | Visual |
|---------------|--------|
| `"tile"` | Square typecase block with a number. *Used by: Almanac, Risograph, Vaporwave.* |
| `"ascii"` | Bracketed mono ASCII, e.g. `[ 2  3  5 ]`. *Used by: Phosphor, Receipt.* |
| `"newsroom"` | Tight serif numerals in a hairline box, divided by hairlines. *Used by: Broadsheet.* |
| `"pip-tile"` | Chunky 8-bit beveled tile with neon glow on the active state. *Used by: Arcade.* |
| `"illuminated"` | Gilded versal capital with gold-leaf shadow. *Used by: Manuscript.* |
| `"blueprint"` | Orthographic line cube with isometric ghost shadow. *Used by: Blueprint.* |
| `"tarot"` | Mini-card with arcane roman numerals and `✦` ornaments above + below. *Used by: Tarot.* |
| `"boardgame"` | Chunky black numerals on bordered white tiles with a navy offset-shadow. *Used by: Tabletop.* |
| `"bullet"` | Solid colored route bullets (red/green/MTA-yellow) with white numerals; active state adds a 3px ink ring. *Used by: Subway.* |
| `"cell"` | Three adjacent gridlined spreadsheet cells with right-aligned mono numerals; active state shifts to selection-blue with a 2px accent ring. *Used by: Spreadsheet.* |
| `"polaroid"` | Three rotated mini photo cards with white border + thick bottom margin; tilts alternate so the row reads as a stack. *Used by: Polaroid.* |
| `"panel"` | Numbered comic panels with thick black border + 3px ink offset shadow + Bangers numerals. *Used by: Comic.* |
| `"buoy"` | Ringed navigational marker with double-stroke (paper / ink) outline. *Used by: Cartographic.* |

---

## When to add a new variant

Add a new `DiceGlyphStyle` only when none of the existing seven suit
your aesthetic — for example, if you want dice rendered as actual pip
dots (●●● for 3) you'd add a `"pip-dots"` variant to `DiceGlyphStyle`
and a matching case in `DiceGlyph`.

Same applies to `EquationStyle` — `"rendered"` and `"ascii"` cover the
two major axes.

The component files have inline comments showing exactly where to add
the new case.

---

## When to add a new layout

The six layouts above cover most useful page compositions. To add a
seventh (say, a `"manuscript-double"` layout with two true facing
pages), implement a new component in `web/src/ui/layouts/`, extend
`LayoutId` in `core/themes.ts`, and register it in the `LAYOUTS` map
inside `PageShell.tsx`. Layouts are completely free to compose their
own masthead, navigation, edition-selector orientation, and footer —
the only contract is `({ children }: { children: ReactNode })`.

Conventions worth keeping:

- Keep nav, edition selector, and dataset stats accessible somewhere
  on every page (a layout that hides them is hard to navigate).
- Read nav items from `ui/nav.ts` rather than hardcoding the list.
- Read the per-edition footer string from `FOOTER_COLOPHON`.
- Never read theme-specific colors directly — use Tailwind utilities
  (`bg-paper-100`, `text-ink-300`, etc.) so the layout works for
  every edition that opts into it.

---

## Checklist

When adding an edition, confirm in this order:

1. `npm run typecheck` (web) — types compile.
2. `npm run dev`  — the new theme appears in the selector.
3. Cycle through Lookup / Explore / Visualize / Colophon — nothing
   blows up; the heatmap uses your palette; dice + equation render in
   the variant you picked.
4. Reload the page after switching to your edition — it should come
   back up in the right theme (no FOUC).
5. `npm run build` — production build succeeds.
6. Add a row to `docs/changelog.md` under "Editions".
