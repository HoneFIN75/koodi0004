# Seurakartta

Responsive analytics dashboard for Finnish disc golf clubs. The JSON database is the sole source of truth; the application does not import, parse, or depend on spreadsheets.

## Data source

The separately maintained database is `jsondb/seurat.json` in the repository and is served relative to the application base path. The payload contains a `data` array and optional `metadata` (`generatedAt`, `recordCount`, `source`). Club fields are `seura`, `paikkakunta`, `latitude`, `longitude`, `jasenmaara`, and `aanimaara`. Numbers may be JSON numbers or numeric strings (including non-breaking spaces). Every object in `data[]` is processed; a stale `metadata.recordCount` produces a visible warning, never truncates the dataset or blocks rendering.

Missing or invalid counts remain unknown, not zero. Average, median, extrema, and membership distributions use only known member counts; totals sum known counts and the dashboard states how many records have membership data. Records without valid coordinates remain searchable and included in analytics, but are not placed at invented locations. Invalid non-object records are skipped with a visible warning. Malformed payloads and failed requests display an error with a retry button.

The Vite development server exposes the repository JSON directly, and the production build copies that same file to `dist/jsondb/seurat.json`. No duplicate fixture or manually synchronized database is required.

## Development

```sh
npm ci
npm run dev
```

Production build:

```sh
npm run build
npm run preview
```

The build uses relative asset and database URLs (`base: './'`), so the production bundle works both at a domain root and under a subdirectory such as `https://example.com/koodi0004/`. Deploy the complete contents of `dist/`—`index.html`, `assets/`, and `jsondb/`—to the web server's matching document root. The filesystem destination in `DEPLOY_PATH` must be the same directory that the `/koodi0004/` web URL serves.

Service and data-validation tests use Node.js 22.18+ (native TypeScript stripping), without additional test dependencies:

```sh
npm test
```

Browser tests cover filters, keyboard selection/clustering, mobile layouts, retries, incomplete data, 600 clubs and automated WCAG checks in both themes:

```sh
npx playwright install chromium
npm run test:e2e
```

The browser suite serves the production build locally and mocks JSON/tile responses. Automated accessibility checks supplement, but do not replace, a manual assistive-technology review.
The `Validate dashboard` workflow runs service tests and production browser checks on pull requests and pushes to `main`.

## Interactive dashboard

- Text search matches club names and municipalities, ignoring case and accents.
- The member slider selects **0 through the chosen maximum**, inclusive. Its full-range position includes unknown member counts; a narrower range excludes unknown counts.
- Voting options include 10, 15, 20 and any additional values found in the database.
- All metrics, rankings, distributions, results and map markers update together when filters change.
- Metrics include total clubs/members, average, median and clickable largest/smallest clubs. All matching clubs are reachable through incremental list rendering.
- Clicking or keyboard-activating a marker/list entry opens the non-modal detail panel. Escape or the close button closes it. Hover/focus shows a tooltip. Leaflet supports keyboard panning and zoom controls; touch users can pinch to zoom.
- True Leaflet markers are clustered with visible club counts, animated expansion and spiderfying of coincident locations. Off-screen markers are not rendered. Reduced-motion preference disables cluster animation.
- Marker radius smoothly increases with membership, including values above 999, and asymptotically approaches 28px to remain usable at extreme values. The map legend demonstrates representative sizes.
- Voting colors are exactly blue `#2563eb` at 10, orange `#f59e0b` at 15 and red `#dc2626` at 20. Intermediate values interpolate RGB anchors; values above 20 continuously darken red. Unknown votes are slate gray. Numeric text accompanies the color encoding.
- The map starts fitted to Finland and all valid locations; filtering preserves the current view. “Näytä Suomi” restores the Finland extent.
- Responsive light/dark cards, visible keyboard focus, named controls, live result announcements and loading/empty/error states are provided.

Additional scalar JSON fields are retained and automatically rendered in the detail panel. `district`, `region`, `website`, `email`, and `foundedYear` have Finnish display labels. Only valid HTTP(S) websites and email addresses become links; other values remain safe text. Add display labels in `ClubDetail.tsx` without changing data loading. Regional analytics prefer the supplied `region` or `district` before falling back to coordinate grouping.

## Region planner (`#/alueet`)

A lazily loaded territorial planning tool for designing representation regions from municipalities. Open it from the “Aluesuunnittelu” link or directly at `…/#/alueet`.

- **Regions:** create, edit, duplicate, delete, enable/disable and show/hide. Each region has a number, name, short name, description, colour (32 presets, HEX input and colour picker) and fill opacity (0–100 %, default 40 %). Municipalities and clubs may belong to any number of regions; overlap is intentional and outlines of overlapping areas are dashed.
- **Municipality selection:** click municipalities on the map while editing, or search, filter by province and bulk add/remove from the list. All 308 municipalities, including the 16 Åland municipalities, are supported.
- **Live analysis:** clubs, members, voting power, average/largest/smallest club, area (km²), share of Finland, club and member density, and an automatic Finnish coverage explanation. Population is shown as “Ei saatavilla” until a `population` property is added to the boundary data.
- **Views:** map, executive dashboard, region comparison (table and charts), unassigned municipalities (highlighted on the map, with bulk assignment), scenarios, backups and import/export.
- **Filters:** club name, municipality, member range, voting power and multiple regions. Filters affect club-based figures; areas always use full geography.
- **Validation:** unassigned municipalities, empty regions, regions without clubs, single-municipality regions, regions over 40 % of Finland, and member or vote totals ≥ 1.5× or ≤ 0.5× the regional average.
- **Scenarios:** create, rename, duplicate, delete and switch independent planning scenarios.
- **Persistence:** every change is autosaved to IndexedDB (fallback: LocalStorage, then memory) with a visible save status. The last active scenario is restored on reopen.
- **Undo/redo:** 100 steps (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z). Rapid edits to the same field, such as dragging the opacity slider, form a single step. Switching scenarios is navigation, not an undoable edit. History is not kept across reloads.
- **Backups:** the latest 10 timestamped snapshots are kept (automatic at most every 5 minutes, plus before imports and restores). Snapshots can be compared with the current state and restored; restoring is undoable.
- **Import/export:** JSON (full round trip), CSV (semicolon-separated, Excel-compatible, formula injection neutralised) and XLSX. Imports accept exported files or a plain region array and can add new scenarios, append regions or replace the active scenario.

Only enabled regions count as municipality assignments. Areas are computed spherically from the boundary polygons; Finland's total is the sum of all municipalities (≈ 336 700 km², including inland waters).

Municipality boundaries in `public/geo/kunnat.geojson` derive from Statistics Finland's 1:1 000 000 municipality data (`kunta1000k_2025`, © Tilastokeskus, CC BY 4.0). To refresh them, run the script; it fetches the WFS GeoJSON (EPSG:4326) by default or accepts a local file or URL:

```bash
node scripts/build-municipalities.mjs [input.geojson|url] [output]
```

Clubs are matched to municipalities by Finnish or Swedish name; clubs whose `paikkakunta` is a former municipality or village are placed by point-in-polygon using their coordinates.

## Architecture

- `src/models/club.ts` — typed JSON database, nullable measurements, extensible details and analytics models.
- `src/data/clubRepository.ts` — validates and caches the one-time database request; clears a failed request so it can be retried.
- `src/services/searchService.ts` — instant, accent-insensitive search and composed membership/voting filters.
- `src/services/statisticsService.ts` — totals, municipal rankings, membership/voting distributions, and approximate location-based regional grouping.
- `src/services/mapService.ts` — membership-scaled markers, voting-power colors, and safe popup content.
- `src/services/{regionAnalytics,validationService,plannerDocument,historyService,persistenceService,backupService,exportService}.ts` — framework-free region planner logic, covered by `tests/planner.test.mjs`.
- `src/state/plannerStore.ts` — Zustand store with undo history, debounced autosave and backups.
- `src/planner/` — region planner UI (map, editor, dashboard, comparison, scenario, backup and data views).
- `src/components/` — clustered map, legend, filters, accessible club details, incrementally rendered results and reusable dashboard charts/rankings.

Regional comparison is derived from coordinates because the source data has no official region field: latitude at or north of 64° is grouped as North Finland; other locations east of 27° longitude as East Finland; remaining locations as South and West Finland. This is a visualization aid, not an official regional classification.

The map uses public OpenStreetMap tiles with attribution and displays a warning on tile failures. Production deployments with high traffic should use an appropriately provisioned tile service in accordance with the provider's usage policy. No club dataset is sent to a geocoding service. Analytics summarize the currently filtered data without changing the source. Dark/light preference is saved locally in the browser.
