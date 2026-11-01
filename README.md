# Seurakartta

Responsive analytics dashboard for Finnish disc golf clubs. The JSON database is the sole source of truth; the application does not import, parse, or depend on spreadsheets.

## Data source

The separately maintained database is `jsondb/seurat.json` in the repository and is served relative to the application base path. The payload contains a `data` array and optional `metadata` (`generatedAt`, `recordCount`, `source`). Club fields are `seura`, `paikkakunta`, `latitude`, `longitude`, `jasenmaara`, and `aanimaara`. Numbers may be JSON numbers or numeric strings (including non-breaking spaces). Every object in `data[]` is processed; a stale `metadata.recordCount` produces a visible warning, never truncates the dataset or blocks rendering.

Membership bands and voting power follow one shared rule: 0 members means 0 votes; 1–99 means 10; 100–299 means 15; 300–499 means 20; and 500 or more means 25. `aanimaara` is derived from the validated member count when the database is loaded. A conflicting source value is replaced by the rule-based value and reported as a visible data warning. If the member count is missing or invalid, voting power remains unknown rather than being inferred from the source vote value.

Missing or invalid counts remain unknown, not zero. Average, median, extrema, and membership distributions use only known member counts; totals sum known counts and the dashboard states how many records have membership data. Records without valid coordinates remain searchable and included in analytics, but are not placed at invented locations. Invalid non-object records are skipped with a visible warning. Malformed payloads and failed requests display an error with a retry button.

The Vite development server exposes the repository JSON directly, and the production build copies that same file to `dist/jsondb/seurat.json`. No duplicate fixture or manually synchronized database is required.

## Club data API (phase 1)

The first club-administration backend phase adds a versioned private store at `clubs.json`, a public read endpoint, an Admin-only read/write endpoint, and a one-time CLI migration. This phase deliberately does not switch the dashboard or region planner to the new endpoint; those clients continue to read `jsondb/seurat.json` until the shared-reader phase is implemented.

The production build includes `api/planner.php`, `api/clubs.php`, and `api/clubs-api.php`; deploy the complete `dist/` output. `clubs.php` delegates to the planner endpoint so both APIs use the same private data-directory, session, role, HTTPS, and CSRF checks. Keep the existing private `planner-data` directory outside the web root with permissions `700`; the JSON files and lock files must have permissions `600`. The public endpoint is `GET /api/clubs.php`. Admin access is `GET /api/clubs.php?view=admin`; a full replacement requires `PUT /api/clubs.php`, a valid Admin session, `X-CSRF-Token`, and the current `X-Expected-Revision`. Do not expose the private store as a static file.

Run the migration from a trusted CLI environment after creating the private output directory:

```sh
php server/migrate-clubs.php jsondb/seurat.json /absolute/private/planner-data/clubs.json
```

The migration validates the source before creating a new file, creates deterministic IDs from the normalized club name and municipality, derives voting power from membership, and refuses duplicate names/municipalities or an existing destination. The current source contains two such duplicate groups. Review the source records first; to preserve them as separate clubs without merging, explicitly confirm that choice by adding `--preserve-duplicate-name-town` to the command. IDs for those duplicate rows are then deterministically distinguished by source row. Previously public legacy website and email fields remain public after migration; all new contact fields default to private. The migration prints aggregate warnings only, not contact details. Back up the source and verify the resulting record count before transferring `clubs.json` to production. The API returns `503` until this migration has provisioned its store. Never run the migration through an HTTP endpoint.

## Province regions and comparison

`jsondb/regions.json` is the source of truth for province IDs, display names, colors, and corresponding municipality `province` values. It contains no boundary geometry: the club map and planner overlay reuse municipality polygons from `public/geo/kunnat.geojson`. Province membership for clubs, population, area, and competitions is derived from that shared municipality dataset; province aggregates are not stored in planner documents. If the region list and municipality properties do not cover one another, the UI reports the mismatch rather than silently assigning municipalities.

The public dashboard's province comparison and the planner comparison tab support club, member, vote, competition, population, municipality, area, and density metrics; ascending or descending sort; province search; and Top 5, Top 10, or all provinces. Competition metrics follow the shared selected-year filter. Unknown population or competition data remain unknown.

The map overlay controls are available on both the public club map and planner map. Visibility, fill opacity (0–100%, default 35%), and province borders are independently adjustable. Settings are stored under `seurakartta-province-overlay-v1` in localStorage and shared between both map views in the same browser. These reference-geography settings do not alter or migrate editable planner regions, scenarios, backups, or exports.

To add or revise regions, update `jsondb/regions.json` with a unique ID, unique municipality province value, display name, and unique six-digit hex color. Municipality values must match the `province` field in the boundary dataset. The app loads the file as JSON at runtime; Vite serves it during development and includes the unchanged file in `dist/jsondb/regions.json` for production.

## Competition statistics

The first-class competition source is `jsondb/SFL-Kilpailut-2019-2026.json`, the corrected dataset supplied by the user (renamed from `SFL-Kilpailut_korjattu_v6-kunnat-lopullinen.json`). It is consumed unchanged as an array of `{ "Kilpailun nimi": string, "Vuosi": integer, "Kunta": string }`. Each row counts once, including repeated names. Years are taken from `Vuosi`, never inferred from names. Future years and municipalities appear automatically.

The file is read dynamically relative to the application base path, with `cache: 'no-store'`. One shared refresh lifecycle checks it every 60 seconds while the application is visible, on window focus/visibility return, and on demand. Successful reloads replace the shared index and recalculate every view. HTTP, JSON and row-validation failures are visible with retry; a failed refresh retains the previous successful dataset with an explicit stale-data warning and disables competition exports. No competition data is imported into a map, geocoded, or used to create markers, layers or map colours.

The shared **Kilpailujen vuodet** control supports all years, one or several selected years (including non-consecutive years), an inclusive year range, and an empty selection. It persists between the dashboard and region planner for the current session. It affects every competition total, ranking, distribution, trend and export, but not timeless club data or the fixed 2025 population dataset. Club-specific filters do not claim to identify competition organizers: the competition source contains no organizer field.

`competitionService.ts` owns parsing, pre-indexed year/municipality groups and first-appearance years, filtering, totals, rankings, distributions, participation trends, historical comparisons and year-over-year changes. `competitionStore.ts` / `useCompetitions.ts` provide the single runtime dataset and active year filter. The national overview, club municipality details, population explorer, planner dashboard, regional comparison/detail/list, unassigned municipalities, scenarios, backup coverage comparisons and administrative/report views all use this source. Regional totals use municipality names, count overlapping regions independently, and deduplicate municipalities in scenario coverage totals. Unknown municipality names remain in national statistics and are reported as unmatched in the planner rather than guessed or placed on a map.

New municipalities are identified using their first year in the **entire dataset**, even when earlier years are excluded by the filter. Year-over-year changes are shown only when both adjacent calendar years are selected; non-consecutive selections use the separate historical comparison. A zero baseline has no percentage growth rate. Municipal participation means competition activity, not player attendance. Density is competitions per 10,000 residents (fixed population reference: 2025) or per 1,000 km²; missing denominators remain unknown. The source has no dates or completion status, so partial/future years must not be interpreted as completed seasons.

The analytics panels export their current scope to CSV. Planner JSON adds filtered competition analytics without modifying the round-trip planning document; CSV/XLSX region and municipality reports add competition totals/densities and the year selection. XLSX also contains national year, municipality and distribution sheets. Formula escaping uses the existing spreadsheet-safe exporter. Backup comparisons apply the **current** competition dataset and year filter to both planning snapshots; they do not pretend to restore historical competition data.

Development serves the repository file directly. Production copies the unchanged file to `dist/jsondb/SFL-Kilpailut-2019-2026.json`; deploy it alongside the bundle. For live data-only updates, replace that served JSON file (not a bundled JavaScript asset). Updating the repository file becomes visible after the normal build/deployment. The name is configured once by `COMPETITION_FILE` in `src/models/competition.ts`; both Vite and the browser repository use it.

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
- Voting options are the five rule-based values: 0, 10, 15, 20 and 25.
- All metrics, rankings, distributions, results and map markers update together when filters change.
- Metrics include total clubs/members, average, median and clickable largest/smallest clubs. All matching clubs are reachable through incremental list rendering.
- Clicking or keyboard-activating a marker/list entry opens the non-modal detail panel. Escape or the close button closes it. Hover/focus shows a tooltip. Leaflet supports keyboard panning and zoom controls; touch users can pinch to zoom.
- True Leaflet markers are clustered with visible club counts, animated expansion and spiderfying of coincident locations. Off-screen markers are not rendered. Reduced-motion preference disables cluster animation.
- Marker radius smoothly increases with membership, including values above 999, and asymptotically approaches 28px to remain usable at extreme values. The map legend demonstrates representative sizes.
- Voting colors distinguish all five rule-based values. Unknown voting power (because membership is unknown) is slate gray. Numeric text accompanies the color encoding.
- The map starts fitted to Finland and all valid locations; filtering preserves the current view. “Näytä Suomi” restores the Finland extent.
- Responsive light/dark cards, visible keyboard focus, named controls, live result announcements and loading/empty/error states are provided.

Additional scalar JSON fields are retained and automatically rendered in the detail panel. `district`, `region`, `website`, `email`, and `foundedYear` have Finnish display labels. Only valid HTTP(S) websites and email addresses become links; other values remain safe text. Add display labels in `ClubDetail.tsx` without changing data loading.

## Region planner (`#/alueet`)

A lazily loaded territorial planning tool for designing representation regions from municipalities. Open it from the “Aluesuunnittelu” link or directly at `…/#/alueet`.

- **Regions:** create, edit, duplicate, delete, enable/disable and show/hide. Each region has a number, name, short name, description, colour (32 presets, HEX input and colour picker) and fill opacity (0–100 %, default 40 %). Municipalities and clubs may belong to any number of regions; overlap is intentional and outlines of overlapping areas are dashed.
- **Municipality selection:** click municipalities on the map while editing, or search, filter by province and bulk add/remove from the list. All 308 municipalities, including the 16 Åland municipalities, are supported.
- **Live analysis:** clubs, members, voting power, average/largest/smallest club, area (km²), share of Finland, club and member density, and an automatic Finnish coverage explanation. The permanent 2025 municipality population dataset adds regional population, municipal mean/median/extrema, national population share, population density, and clubs/members per 10,000 residents.
- **Views:** map, executive dashboard, region comparison (table and charts), unassigned municipalities (highlighted on the map, with bulk assignment), scenarios, backups and import/export.
- **Filters:** club name, municipality, member range, voting power and multiple regions. Filters affect club-based figures; areas always use full geography.
- **Validation:** unassigned municipalities, empty regions, regions without clubs, single-municipality regions, regions over 40 % of Finland, and member or vote totals ≥ 1.5× or ≤ 0.5× the regional average.
- **Scenarios:** create, rename, duplicate, delete and switch independent planning scenarios.
- **Persistence:** production changes are autosaved to the shared server endpoint; development mode uses IndexedDB (fallback: LocalStorage, then memory). The last active scenario and backups are shared. Existing browser plans require explicit migration when the server is empty.
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
- `src/data/provinceRepository.ts` / `src/services/provinceAnalytics.ts` — validate the runtime province registry, report coverage gaps, and derive province-level statistics from municipality data.
- `src/services/provinceOverlay.ts` / `src/services/provinceSettings.ts` — render the shared province map layer and persist validated local overlay settings.
- `src/services/searchService.ts` — instant, accent-insensitive search and composed membership/voting filters.
- `src/services/statisticsService.ts` — totals, municipal rankings, and membership/voting distributions.
- `src/services/mapService.ts` — membership-scaled markers, voting-power colors, and safe popup content.
- `src/services/{regionAnalytics,validationService,plannerDocument,historyService,persistenceService,backupService,exportService}.ts` — framework-free region planner logic and shared-storage client, covered by `tests/planner.test.mjs`.
- `server/planner.php` — public read, session-authenticated shared planner writes, Admin password API and optimistic concurrency checks.
- `server/setup-auth.php` — one-time CLI-only setup for the shared Writer and Admin accounts.
- `src/state/plannerStore.ts` — Zustand store with undo history, debounced autosave and backups.
- `src/planner/` — region planner UI (map, editor, dashboard, comparison, scenario, backup and data views).
- `src/components/` — clustered map, legend, filters, accessible club details, incrementally rendered results and reusable dashboard charts/rankings.

Administrative province comparison is derived from municipality province metadata and the configurable `jsondb/regions.json` registry; the former three-group coordinate heuristic has been removed.

The map uses public OpenStreetMap tiles with attribution and displays a warning on tile failures. Production deployments with high traffic should use an appropriately provisioned tile service in accordance with the provider's usage policy. No club dataset is sent to a geocoding service. Analytics summarize the currently filtered data without changing the source. Dark/light preference is saved locally in the browser.

### Municipality population (2025)

`src/data/municipalities-population-2025.json` is the permanent population source: 308 municipalities and 5,652,881 residents in the supplied dataset. `populationService.ts` imports and processes it once as a shared module, with cached name lookups, national totals and rankings. It is bundled into the application, not fetched separately by each view. Municipality boundaries are still fetched once and reused across routes.

The dataset enriches both the public club dashboard and Region Planner: municipality details and map tooltips, an optional population choropleth, regional population statistics and per-capita comparisons, national municipality rankings/distributions, minimum/maximum/category filters, scenario/backup coverage comparisons, and JSON/CSV/XLSX reports. Population remains public, read-only reference data; it is never added to or allowed to overwrite the shared planner document.

Names are matched using case-insensitive Unicode NFC normalization, Finnish/Swedish boundary names, and the combined source name `Maarianhamina - Mariehamn`. The compact bilingual name index is generated from the existing boundaries:

```sh
node scripts/build-municipality-names.mjs
```

Regenerate it after updating municipality boundaries. Unknown population values remain unknown, not zero; complete totals and population-based rates are withheld when a participating municipality is missing. Scenario coverage and selected-region summary populations count a municipality only once, even when regions overlap. Individual region bars/rows still describe that region separately.

The supplied file does not identify its original publisher or reference date within 2025; these are explicitly marked as unspecified in the UI and export metadata. Population categories are size bands, not official city status. Member-per-capita figures describe clubs relative to their municipalities' populations, not verified residential membership or participation rates. See [the full integration report](POPULATION-INTEGRATION.md) for the file inventory, calculations, data audit and enhancement recommendations.

### Shared region-planner access and storage

The production planner is publicly readable. Editing its shared plan, backups, imports and scenario settings requires one of two shared accounts: **Writer** or **Admin**. Both can edit; only Admin can change either account's password. There are no personal accounts, email services, invitations or third-party authentication providers. Because credentials are shared, the application cannot identify which person made a change. The club dataset and the rest of the Seurakartta remain public and read-only.

The PHP 8.1+ endpoint needs JSON, PHP sessions, `password_hash`/`password_verify`, `random_bytes`, file locking, and a private writable directory outside the web root. HTTPS is required for login and edits. The host must allow PHP to read and write the private directory (including any `open_basedir` restrictions). No PHP-FPM pool edits, outbound network requests or email service are required. The site should run through the host's HTTPS configuration; the endpoint does not trust forwarded-protocol or client-IP headers.

#### One-time shared-host setup

The default private directory is `"$HOME/planner-data"`. Confirm it is outside `public_html` and restrict it to the hosting account:

```sh
chmod 700 "$HOME/planner-data"
```

From the repository root on your computer, copy the CLI initializer into that private directory (replace the SSH destination with your host and account):

```sh
scp server/setup-auth.php account@example-host:/home/account/planner-data/setup-auth.php
```

Then connect by SSH and run:

```sh
chmod 700 "$HOME/planner-data"
php "$HOME/planner-data/setup-auth.php"
```

If the API uses `PLANNER_DATA_FILE`, the CLI setup script stores authentication files beside that configured planner file. Make sure the same absolute path is available to the CLI process, for example:

```sh
PLANNER_DATA_FILE=/home/account/private/planner.json php /home/account/private/setup-auth.php
```

In that example, place `setup-auth.php` in `/home/account/private/` before running it. The selected directory must exist, be writable, and be outside the site's public document root.

The script prompts for Writer and Admin passwords without echoing them in a terminal (it uses CLI `proc_open` and `stty` for this). Enter each twice. Use at least 12 characters; when the PHP build lacks Argon2id, passwords are limited to 72 bytes to avoid bcrypt truncation. Passwords are never command-line arguments and are not written to shell history. The script runs only in PHP CLI, refuses to overwrite an existing `auth.json`, stores password hashes and a random rate-limit key with mode `600`, and does not change `planner.json` or its backups. It also removes the obsolete `writeKey` entry from a valid legacy `config.json`; the API no longer reads or accepts that credential.

After successful setup, remove the uploaded initializer:

```sh
rm "$HOME/planner-data/setup-auth.php"
```

The API creates `sessions/` and `login-attempts.json` inside `planner-data` as needed. Sessions live in that private directory, use Secure, HttpOnly and SameSite=Strict cookies, expire after eight hours, and are all invalidated whenever either password changes. Failed logins are limited to 10 per account and server-observed remote address per 15 minutes. Keep the directory private; do not use permission `777`. If the host cannot provide these PHP features or filesystem access, do not enable writes.

Remove any obsolete `PLANNER_WRITE_KEY` server setting if one exists. It is ignored by this release, and the old request header cannot authorize writes. The optional `PLANNER_DATA_FILE` environment setting may still select the planner JSON path, but it does not grant access. Never put passwords or hashes in the frontend, GitHub Actions, or this repository.

#### Password changes and recovery

Sign in as Admin and open **Admin** in the planner header. There are separate forms for changing Writer and Admin passwords. Each form requires the current Admin password, the new password twice, and at least 12 characters. A successful change immediately invalidates all sessions; everyone must sign in again with the updated shared account password. Share credentials only with trusted users using a private channel.

The initializer is intentionally non-destructive. If Admin access is lost, first make a private backup of `planner-data`. Then, using SSH or the host's file manager, move the authentication-only entries `auth.json`, `auth-setup.lock`, `login-attempts.json` (if present), and the `sessions/` directory to private recovery names outside the web root. Do not move or delete `planner.json` or planner backups. Upload `setup-auth.php` again, run it to set both passwords, then remove the script. Existing planner data remains intact; all old sessions are revoked.

The planner stores the document and up to 10 backups in `planner.json`, uses atomic replacement and revision checks, and rejects stale concurrent writes instead of silently overwriting newer server data. Existing browser-local data is shown only in that browser and can be migrated after Writer or Admin signs in, only when the server has no plan. It is never automatically uploaded over existing server data. Development mode continues to use browser storage.
