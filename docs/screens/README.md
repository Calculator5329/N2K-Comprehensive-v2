# Reference screenshots

PNG snapshots of every web edition (theme) across the four primary
views — Lookup, Explore, Visualize, Colophon — plus a handful of
Compose / Compare / Gallery shots. They serve two purposes:

1. **Reference shots** for theme work: when adjusting `globals.css`
   or component variants, compare the new render against the captured
   baseline.
2. **Eyeballable regression checks** for layouts/glyphs across the
   sixteen editions registered in [`web/src/core/themes.ts`](../../web/src/core/themes.ts).

## Naming convention

```
<edition-id>-<view-or-state>.png
```

Examples:

- `almanac-lookup.png`           — Lookup view, Almanac edition.
- `phosphor-explore.png`         — Explore view, Phosphor edition.
- `tabletop-colophon.png`        — Colophon, Tabletop edition.
- `<edition>-after-system.png`   — full-page snapshot taken after
                                   the latest layout/system pass for
                                   that edition.

The full list of edition IDs lives in `THEME_IDS` in
[`web/src/core/themes.ts`](../../web/src/core/themes.ts).

## Refreshing

Captured manually from the running dev server (`npm --workspace web
run dev`). Replace any individual file in place; do not introduce a
parallel directory. Keep filenames lowercase-hyphenated.
