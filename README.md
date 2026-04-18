# N2K Comprehensive Solver

A CLI tool for solving and analyzing N2K equations: generate boards and dice, solve any board number for the easiest equation, score the difficulty of any equation, and compute the overall difficulty of a full board against every standard dice combination.

> Originally a single Python script (`Main.py`), this project was rewritten in TypeScript with a clean three-layer architecture, strict types, and a unit-test suite. See [`docs/changelog.md`](docs/changelog.md) for the list of behavioral changes and bug fixes carried over from the rewrite.

## Requirements

- **Node.js 20+**
- npm (or your package manager of choice)

## Install

```bash
npm install
```

## Run the REPL

For development (no build step):

```bash
npm run dev
```

For a production-style build:

```bash
npm run build
node dist/main.js
```

After install, the `n2k` bin is also available:

```bash
npx n2k
```

## Commands

Once the REPL starts, type the command name, the number, `Command N`, or `CN`:

| #   | Command                  | What it does                                                                  |
| --- | ------------------------ | ----------------------------------------------------------------------------- |
| 1   | End                      | Exit the REPL                                                                 |
| 2   | List commands            | Reprint the command list                                                      |
| 3   | Generate random board    | Build a 36-cell board of unique random integers in `[1, N]`                   |
| 4   | Generate pattern board   | Build a 36-cell arithmetic-progression board                                  |
| 5   | Generate random dice     | Roll three dice within the configured ranges                                  |
| 6   | Solve equation           | For a given dice triple + target, find the easiest equation that hits it     |
| 7   | Find difficulty          | Score the difficulty of a user-supplied equation (e.g. `2^5 + 2^2 + 2^2 = 40`) |
| 8   | Find board difficulty    | For each standard dice combination, compute average difficulty across a board |
| 9   | Export all solutions     | Bulk-export the easiest equation + difficulty for every (dice triple, target) cell to NDJSON + manifest. See [Bulk export](#bulk-export). |

## Bulk export

Command **9 (Export all solutions)** writes a complete solution dataset to disk.

For the default ranges (dice 1..20 unordered, totals 1..999, raw dice / no depower), the export takes roughly 6 seconds and produces:

- `n2k-export.ndjson` (~30 MB) — one JSON record per **solvable** `(dice triple, target)` pair, sorted by dice then total:

  ```json
  {"dice":[2,3,5],"total":31,"difficulty":4.27,"equation":"2^0 + 5^0 + 2^2 = 31"}
  ```

- `n2k-export.manifest.json` — run metadata plus a `perDice` array with `solvableCount`, `impossibleCount`, `minDifficulty`, `maxDifficulty`, `averageDifficulty` for each of the 1,540 unordered dice triples.

The format is **NDJSON** (newline-delimited JSON) so the file streams line-by-line and can be queried directly with standard tools:

```bash
# Pull the easiest equation for every dice triple at total = 100:
jq -c 'select(.total == 100)' n2k-export.ndjson | head

# Load into pandas / Polars / DuckDB (all support NDJSON natively):
duckdb -c "SELECT dice, AVG(difficulty) FROM read_json_auto('n2k-export.ndjson') GROUP BY dice ORDER BY 2"
```

The export prompts you for output path and ranges, but defaults match the original request (dice 1..20, totals 1..999, raw dice).

## The N2K Almanac (web UI)

A React + MobX + Tailwind frontend that browses, searches, and visualizes
the bulk export. Lives in the `web/` workspace.

To run it from a clean checkout:

```bash
npm install            # installs both workspaces
npm run data:all       # generate NDJSON + split into /web/public/data/
npm run web:dev        # start Vite on http://127.0.0.1:5173
```

The data pipeline is split into two phases so you can re-run them
independently:

```bash
npm run data:export    # solver → data-raw/n2k-export.ndjson + manifest
npm run data:prep      # NDJSON → web/public/data/{index,by-target,dice/*}.json
```

The web app has four sections:

- **§ I Lookup** — pick a dice triple and target, get the easiest equation
  with rendered superscripts plus a window-normalized bar chart of adjacent
  targets.
- **§ II Explore** — sortable, filterable index of all 1,540 unordered dice
  triples with overall difficulty stats. Click any row to drill into the
  full solution roster.
- **§ III Visualize** — heatmap of every target 1–999 colored by globally
  easiest reachable difficulty, plus a histogram and a coverage-vs-difficulty
  scatter of all dice triples.
- **§ IV Colophon** — about page with dataset metadata.

The almanac is published in **sixteen editions**, identical in content
and wildly opposite in temperament — switch between them in the sidebar.
The full list lives in `web/src/core/themes.ts`; representative examples:

- **Almanac** — parchment / ink / oxblood, set in Fraunces, Source
  Serif 4, and JetBrains Mono. The default scholarly reference book.
- **Phosphor** — green-on-black CRT terminal, JetBrains Mono
  throughout, scanlines, soft phosphor glow, amber alerts.
- **Risograph** — warm cream paper, vermillion ink, brutalist sans
  (Bricolage Grotesque + Inter Tight + Space Mono), hard borders, drop
  shadow. A punk math zine.
- **Tabletop**, **Blueprint**, **Manuscript**, **Tarot**, **Vaporwave**,
  **Receipt**, **Subway**, **Spreadsheet**, **Polaroid**, **Comic**,
  **Cartographic**, **Broadsheet**, **Arcade** — see `docs/themes.md`
  for the full catalogue and the recipe to add a new one.

Theme choice persists to `localStorage` and is applied before React
mounts, so reloads never flash the wrong edition.

A production build is just static HTML/CSS/JS plus the prebuilt JSON
chunks — drop `web/dist/` on any static host. Total transfer: ~150 KB
initial + ~3 KB per dice triple browsed.

## Project layout

```
/                  # Solver workspace (n2k-comprehensive-solver)
  src/
    core/          # Types & constants — no dependencies
    services/      # Pure business logic — no I/O
    cli/           # REPL, prompts, output formatting
    main.ts        # Entry point
  scripts/         # Data-pipeline glue scripts
  tests/           # Vitest test suite mirroring services/
  docs/            # roadmap, tech spec, changelog
  data-raw/        # (generated) NDJSON export + manifest
web/               # @n2k/web — React + MobX frontend workspace
  public/data/     # (generated) static JSON chunks served at /data
  src/
    core/          # Web-side types
    services/      # Stateless data fetching
    stores/        # MobX state (DataStore, AppStore, feature stores)
    ui/            # Reusable presentation (Wordmark, Equation, etc.)
    features/      # Lookup, Explore, Visualize, Colophon
```

See [`docs/tech_spec.md`](docs/tech_spec.md) for architecture details.

## Scripts

```bash
# Solver
npm run dev         # Start the REPL via tsx (no build)
npm run build       # Compile to dist/
npm start           # Same as dev
npm test            # Run the Vitest suite
npm run typecheck   # tsc --noEmit

# Data pipeline
npm run data:export # Generate the full NDJSON + manifest
npm run data:prep   # Split NDJSON into web/public/data/ chunks
npm run data:all    # Both, in order

# Web app
npm run web:dev     # Vite dev server
npm run web:build   # Production build to web/dist/
npm run web:preview # Preview the production build
```

## License

Unlicensed — internal project.
