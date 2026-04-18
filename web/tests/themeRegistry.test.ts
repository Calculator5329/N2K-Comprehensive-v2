import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  THEMES,
  THEME_IDS,
  type ThemeId,
} from "../src/core/themes";
import { FOOTER_COLOPHON } from "../src/ui/nav";

/**
 * Theme-registry consistency tests.
 *
 * Adding a new edition is a four-step recipe (`docs/themes.md`):
 * register the `Theme` object, add a CSS-variable bundle, extend the
 * pre-mount allow-list in `index.html`, and add a footer colophon.
 * Steps 1, 3, 4 have no compile-time guarantee — these tests turn
 * the recipe into a CI gate so future contributors can't ship a
 * half-registered edition.
 *
 * Step 2 (the CSS bundle) is intentionally NOT covered here because
 * we don't want to require a CSS parser dependency in tests; missing
 * bundles surface immediately as flat / unstyled cards in the
 * gallery view's manual cycle (last item of the Phase-7 verification
 * checklist in `docs/current_task.md`).
 */
describe("theme registry", () => {
  it("THEME_IDS matches the keys of THEMES", () => {
    const themeKeys = Object.keys(THEMES).sort();
    const idList = [...THEME_IDS].sort();
    expect(idList).toEqual(themeKeys);
  });

  it("every Theme entry has the same id as its registry key", () => {
    for (const id of THEME_IDS) {
      expect(THEMES[id].id).toBe(id);
    }
  });

  it("DEFAULT_THEME is a registered theme id", () => {
    expect(THEME_IDS).toContain(DEFAULT_THEME as ThemeId);
  });

  it("every Theme has a 3-element swatch tuple", () => {
    for (const id of THEME_IDS) {
      expect(THEMES[id].swatches).toHaveLength(3);
    }
  });

  it("scale stops are in non-decreasing `at` order with 6 stops each", () => {
    for (const id of THEME_IDS) {
      const stops = THEMES[id].scale.stops;
      expect(stops.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < stops.length; i += 1) {
        expect(stops[i]!.at).toBeGreaterThanOrEqual(stops[i - 1]!.at);
      }
    }
  });

  it("every Theme has a footer colophon registered", () => {
    for (const id of THEME_IDS) {
      const colophon = FOOTER_COLOPHON[id];
      expect(colophon, `missing FOOTER_COLOPHON for "${id}"`).toBeTruthy();
    }
  });

  it("every Theme appears in the index.html bootstrap allow-list", () => {
    // Read the bootstrap script from index.html — it has its own
    // hard-coded allow-list to prevent FOUC, and we want a CI gate
    // when someone forgets to add a new theme to it. `process.cwd()`
    // is the web workspace root when vitest runs from `web/`.
    const indexHtmlPath = resolve(process.cwd(), "index.html");
    const html = readFileSync(indexHtmlPath, "utf8");
    // Match the inline `var ok = { …id: 1… };` map in <script> at
    // the top of <body>.
    const okMatch = /var\s+ok\s*=\s*\{([\s\S]*?)\}\s*;/.exec(html);
    expect(okMatch, "could not locate the bootstrap `ok` object in index.html")
      .not.toBeNull();
    const okBody = okMatch![1]!;
    const allowed = new Set<string>();
    for (const m of okBody.matchAll(/([a-z][a-z0-9_-]*)\s*:\s*1/gi)) {
      allowed.add(m[1]!.toLowerCase());
    }
    for (const id of THEME_IDS) {
      expect(
        allowed.has(id),
        `index.html bootstrap allow-list is missing "${id}"`,
      ).toBe(true);
    }
  });

  it("every Theme appears in the index.html font preload comment when relevant", () => {
    // Soft check: the font-preload <link> has a comment listing every
    // edition for documentation. Missing entries don't break runtime
    // (CSS falls back to system fonts) but the comment serves as a
    // reviewer aid and we want it to track THEME_IDS.
    const indexHtmlPath = resolve(process.cwd(), "index.html");
    const html = readFileSync(indexHtmlPath, "utf8").toLowerCase();
    for (const id of THEME_IDS) {
      expect(
        html.includes(id),
        `index.html does not mention "${id}" anywhere — ` +
          "either the bootstrap allow-list, font-preload comment, or " +
          "both is out of date",
      ).toBe(true);
    }
  });
});
