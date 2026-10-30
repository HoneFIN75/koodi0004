# Seurakartta

Responsive analytics dashboard for Finnish disc golf clubs. The JSON database is the sole source of truth; the application does not import, parse, or depend on spreadsheets.

## Data source

Serve the separately maintained database at `/jsondb/seurat.json`. It must have a `metadata` object (`generatedAt`, `recordCount`, `source`) and a `data` array of clubs with `seura`, `paikkakunta`, `latitude`, `longitude`, `jasenmaara`, and `aanimaara`. Counts may be JSON numbers or numeric strings (including non-breaking spaces). The client validates and normalizes the payload, and reports missing, invalid, or inconsistent data instead of showing invented values.

For local development, place the maintained file at `public/jsondb/seurat.json`; this path is intentionally not populated with a substitute dataset. In production the static host must serve the same URL. The deployment workflow preserves the separately maintained remote `jsondb/` directory when syncing the built site.

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

## Architecture

- `src/models/club.ts` — typed JSON database and analytics models.
- `src/data/clubRepository.ts` — validates and caches the one-time database request; clears a failed request so it can be retried.
- `src/services/searchService.ts` — instant, accent-insensitive club and municipality search.
- `src/services/statisticsService.ts` — totals, municipal rankings, membership/voting distributions, and approximate location-based regional grouping.
- `src/services/mapService.ts` — membership-scaled markers, voting-power colors, and safe popup content.
- `src/components/` — Leaflet marker-cluster map and reusable dashboard charts/rankings.

Regional comparison is derived from coordinates because the source data has no official region field: latitude at or north of 64° is grouped as North Finland; other locations east of 27° longitude as East Finland; remaining locations as South and West Finland. This is a visualization aid, not an official regional classification.

The map uses OpenStreetMap tiles and Leaflet clustering. Analytics summarize the complete source data; search filters map markers and club results without changing the source or totals. Dark/light preference is saved locally in the browser.
