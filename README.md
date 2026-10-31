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
- `src/services/searchService.ts` — instant, accent-insensitive search and composed membership/voting filters.
- `src/services/statisticsService.ts` — totals, municipal rankings, membership/voting distributions, and approximate location-based regional grouping.
- `src/services/mapService.ts` — membership-scaled markers, voting-power colors, and safe popup content.
- `src/services/{regionAnalytics,validationService,plannerDocument,historyService,persistenceService,backupService,exportService}.ts` — framework-free region planner logic and shared-storage client, covered by `tests/planner.test.mjs`.
- `server/planner.php` — public read, session-authenticated shared planner writes, Admin password API and optimistic concurrency checks.
- `server/setup-auth.php` — one-time CLI-only setup for the shared Writer and Admin accounts.
- `src/state/plannerStore.ts` — Zustand store with undo history, debounced autosave and backups.
- `src/planner/` — region planner UI (map, editor, dashboard, comparison, scenario, backup and data views).
- `src/components/` — clustered map, legend, filters, accessible club details, incrementally rendered results and reusable dashboard charts/rankings.

Regional comparison is derived from coordinates because the source data has no official region field: latitude at or north of 64° is grouped as North Finland; other locations east of 27° longitude as East Finland; remaining locations as South and West Finland. This is a visualization aid, not an official regional classification.

The map uses public OpenStreetMap tiles with attribution and displays a warning on tile failures. Production deployments with high traffic should use an appropriately provisioned tile service in accordance with the provider's usage policy. No club dataset is sent to a geocoding service. Analytics summarize the currently filtered data without changing the source. Dark/light preference is saved locally in the browser.

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
