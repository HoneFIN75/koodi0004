# Seurakartta

Responsive analytics dashboard for Finnish disc golf clubs. The JSON database is the sole source of truth; the application does not import, parse, or depend on spreadsheets.

## Data source

The separately maintained database is `jsondb/seurat.json` in the repository and is served by the application at `/jsondb/seurat.json`. The payload contains a `data` array and optional `metadata` (`generatedAt`, `recordCount`, `source`). Club fields are `seura`, `paikkakunta`, `latitude`, `longitude`, `jasenmaara`, and `aanimaara`. Numbers may be JSON numbers or numeric strings (including non-breaking spaces). Every object in `data[]` is processed; a stale `metadata.recordCount` produces a visible warning, never truncates the dataset or blocks rendering.

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

## Architecture

- `src/models/club.ts` — typed JSON database, nullable measurements, extensible details and analytics models.
- `src/data/clubRepository.ts` — validates and caches the one-time database request; clears a failed request so it can be retried.
- `src/services/searchService.ts` — instant, accent-insensitive search and composed membership/voting filters.
- `src/services/statisticsService.ts` — totals, municipal rankings, membership/voting distributions, and approximate location-based regional grouping.
- `src/services/mapService.ts` — membership-scaled markers, voting-power colors, and safe popup content.
- `src/components/` — clustered map, legend, filters, accessible club details, incrementally rendered results and reusable dashboard charts/rankings.

Regional comparison is derived from coordinates because the source data has no official region field: latitude at or north of 64° is grouped as North Finland; other locations east of 27° longitude as East Finland; remaining locations as South and West Finland. This is a visualization aid, not an official regional classification.

The map uses public OpenStreetMap tiles with attribution and displays a warning on tile failures. Production deployments with high traffic should use an appropriately provisioned tile service in accordance with the provider's usage policy. No club dataset is sent to a geocoding service. Analytics summarize the currently filtered data without changing the source. Dark/light preference is saved locally in the browser.
