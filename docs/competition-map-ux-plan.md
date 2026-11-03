# Competition map and planning UX audit

## Scope and evidence

This audit is based on the checked-out application source, the runtime competition repository, the municipality boundary dataset, and direct inspection of `jsondb/SFL-Kilpailut-2019-2026.json`. Repository documentation was not used as a substitute for validating the competition data.

The application is a React 19 and TypeScript single-page application built with Vite. Hash routing in `src/main.tsx` selects the club dashboard, regional planning application, or data-source page. Leaflet is used by both maps. Competition records are loaded from the JSON file by `competitionRepository`, indexed by year and normalized municipality name, and shared through a Zustand store. The year filter is already shared across the homepage and planner.

## Dataset validation

**Found:** `jsondb/SFL-Kilpailut-2019-2026.json`, a 235,721-byte JSON array.

| Field | Verified type | Completeness | Meaning supported by the value |
|---|---|---:|---|
| `Kilpailun nimi` | string | 2,292 / 2,292 non-empty | Recorded competition title |
| `Vuosi` | integer | 2,292 / 2,292 | Recorded competition year |
| `Kunta` | string | 2,292 / 2,292 non-empty | Recorded municipality name |

There are **2,292 records** across **2020–2026**. Record counts are 2020: 232; 2021: 262; 2022: 302; 2023: 365; 2024: 399; 2025: 411; 2026: 321. Despite the filename, no 2019 records are present. The file contains 161 distinct municipality strings, and all 161 match municipality names in the application's 308-municipality geometry dataset. 160 match the separate population dataset; `Maarianhamina` has no matching population name there. Competition counts can still be mapped for Maarianhamina, but per-capita calculations requiring population must remain unavailable for it.

All records have the three expected field types, and no blank values, surrounding whitespace, invalid years, or municipality spelling/case variants were found. There are 51 exact `(name, year, municipality)` duplicate groups, containing 54 records beyond one per group. Competition names also repeat across records. The dataset has no event identifier, date, location coordinates, status, organizer, category, level, player count, club identifier, or membership/participation fields. A repeated row therefore cannot be proven to be an accidental duplicate, nor can distinct event identity be proven from a title.

Examples from the source include `NBDG One Round Åland`, 2022, `Maarianhamina`; `NBDG Special Åland`, 2021, `Maarianhamina`; and `Hunaja open WARM-up`, 2021, `Akaa`.

### Supported and unsupported analysis

| Capability | Status | Basis or limitation |
|---|---|---|
| Record counts by year and municipality | Supported | `Vuosi` and `Kunta`; duplicate source rows remain separate records |
| Municipality choropleth and search | Supported | All 161 source municipality names match the current municipality geometry |
| Municipality trend | Supported | Yearly record counts can be grouped from the dataset |
| Unique title count | Supported only as a title count | `Kilpailun nimi` can be deduplicated as text; it is not a validated event ID |
| First and latest recorded year | Supported | Derived from the municipality's records; it describes the available file, not complete history |
| Distinct event count | Not independently verifiable | There is no event ID and exact triplets repeat |
| Participants, courses, clubs as organizers, licenses, competition class/level, attendance | Unsupported | Required fields do not exist in this dataset |
| Competition point locations or within-municipality clusters | Unsupported | No competition coordinates or course locations |
| Current/confirmed competition status | Unsupported | No event status or date |
| 2019 comparison or complete 2026 trend | Unsupported | 2019 is absent; the file does not describe year completeness |
| Population-normalized municipality measures for Maarianhamina | Partially supported | Record and boundary exist, but the population dataset has no matching municipality name |

## Current-state and visualization audit

The homepage currently presents club and membership KPIs, a club-marker map, club search/member/vote filters, club detail panels, population analysis, province comparison, club analytics, and a club matrix. Competition content is a compact KPI block near the top, municipality competition details inside club detail, competition columns in population analysis and the club matrix, and a long-form competition analytics panel at the end of the page.

The planner is a separate scenario editor with municipality boundaries, editable regional assignments, club markers, unassigned-municipality highlighting, population coloring, province overlays, filters, region details, and a regional dashboard. Regional competition counts already use the shared year filter and are available in region statistics and the planning dashboard. Full competition analytics are also repeated on planner dashboard, comparison, and administration views. The planner map's year filter is inside the general filter disclosure, while other planner views render it separately.

| Feature | Current location | Recommended location | Reason |
|---|---|---|---|
| Competition year filter | Homepage KPI card; planner map filters; other planner views | One visible shared control per active view | The underlying state is shared; repeated placement obscures its global effect |
| Competition total and active municipalities | Homepage KPIs, competition analytics, planner analytics | Homepage `Yhteenveto`; regional aggregates only in planning | Remove competing totals while preserving area-specific decision support |
| Competition yearly counts | Homepage long-form analytics and planner analytics | Municipality trend on homepage; regional counts in planning | Differentiate operational municipality history from strategic regional comparison |
| Competition municipality ranking/density | Long-form analytics and population analysis | Keep only where the population denominator is explicit; defer standalone rank panel | Avoid redundant ranked views and make the population source/denominator visible |
| Competition count in club matrix | Club matrix | Remove from club matrix | This is an unrelated cross-context duplicate of municipality competition counts |
| Club/member/vote KPIs and club markers | Homepage | Club section of homepage and planner when needed | These fields are sourced from the club dataset, not the competition file |
| Municipality boundaries | Both maps | Both, with independent styling and controls | Shared geography is a base layer; the business question and thematic layer differ |
| Province overlay | Both maps | Optional context layer; default off | Useful geographic context, but can conflict with thematic fills |
| Population choropleth | Planner map and population explorer | Planning / population analysis only | Population is a separate 2025 dataset and supports strategic context, not competition event volume |
| Custom regions and scenarios | Planner | Aluesuunnittelu only | These are planning objects, not observations of current competition activity |
| Full competition analytics tables/export | Homepage and several planner views | One administration/report location | Retain data-export capability without repeating the same broad analysis in every view |
| Club and population filters | Homepage and planner | Keep context-specific; centralize only competition year selection | Club membership and population filters do not apply to competition records |

### Responsibility decision matrix

| Component | Seurakartta | Aluesuunnittelu | Both | Remove | Reason |
|---|---:|---:|---:|---:|---|
| Competition counts by municipality | Yes |  |  |  | Operational question: where records occur |
| Municipality/year/name search | Yes |  |  |  | Operational exploration of the competition source |
| Overall competition total, active municipalities, observed period | Yes |  |  |  | One clear source of truth on the homepage |
| Municipality competition trend | Yes |  |  |  | Shows observed history in the selected municipality |
| Competition counts by planning region |  | Yes |  |  | Supports regional allocation and comparison |
| Region coverage, overlap, unassigned areas, scenarios |  | Yes |  |  | Planning-specific information |
| Club/member/population context |  | Yes |  |  | Useful regional context from other, separate datasets; label sources and denominators |
| Shared municipality boundaries |  |  | Yes |  | Geography is necessary on both maps; its thematic meaning differs |
| Province outlines |  |  | Yes |  | Optional reference layer; both maps may need orientation |
| Global competition rankings and repeated year tables on each page |  |  |  | Yes | Consolidate in one report surface instead of duplicating |
| Participant, course, event-status, or event-location visualizations |  |  |  | Yes | Not supported by source fields |

The only intentional overlap is reference geography and, in planning, competition counts aggregated to custom regions. The latter is not a duplicate municipality visualization: it answers how a user-authored area allocation covers observed activity.

## Information architecture and interaction proposal

1. **Seurakartta — operational**: preserve the existing homepage and club map. Add competition counts as an independently switchable municipality-fill layer on that map, with a legend and the shared competition-year filter. Keep club markers visually above the fill layer.
2. **Aluesuunnittelu — strategic**: preserve the existing planning map and its region, club, and population features. Add the same optional competition-count municipality fill using the shared year filter. When enabled, competition coloring replaces population and region fills; region outlines, municipality selection, and club markers remain available.
3. **Seuratoiminta and population analysis**: retain the existing club, membership, and population features under their own labels and context. They are separate datasets and must not be presented as competition-derived measures.
4. **Reports and administration**: retain detailed tables and CSV export in one report/admin surface; do not make a second operational dashboard.

### Filter architecture

Keep the existing shared `YearFilter` store as the sole source of truth for competition-year selection. Render `CompetitionFilters` once on the homepage and once in Aluesuunnittelu. The layer-visibility toggle is separate from the year filter. Club, population, and region filters remain independent and must not be described as filtering competition counts.

### Layer and visualization architecture

Treat competition counts as an optional thematic fill layer on each existing map, not as a separate map or route. Municipality boundaries, basemaps, and club markers remain independent. In Aluesuunnittelu, competition coloring is mutually exclusive with population and region fills; region outlines and club markers stay visible. Hide province fills and borders while competition coloring is active to prevent competing overlays. Use the same color ramp and legend on both maps, report source-row counts in municipality tooltips, and persist the visibility toggle as a presentation preference.

Keep the existing homepage summary and planning panels in their current locations. Every new layer control must have a Finnish label and keyboard focus state. On narrow viewports, retain the existing map layout and move the competition legend below the map rather than covering map controls.

## Wireframe recommendation

**Homepage, desktop:** existing Seurakartta page and summary → existing club map with an independent `Kilpailumäärät kunnittain` layer toggle and year filter → existing club list and controls.

**Homepage, mobile:** preserve the existing stacked map layout; keep the competition toggle and year filter adjacent to the club map and place its legend below the map when enabled.

**Aluesuunnittelu:** preserve the planning map and controls; add the same optional competition layer next to its existing population and club toggles. Keep regional outlines and planning interactions available while the competition fill is active.

## Component hierarchy and implementation plan

```text
Root
├── Seurakartta (App)
│   ├── Seurakartta summary and filters
│   └── MapView
│       ├── Club markers
│       ├── Optional competition-count municipality fill
│       └── Shared map controls and legends
└── Aluesuunnittelu (PlannerApp)
    ├── Shared CompetitionFilters
    ├── PlannerFilters (clubs / population / regions)
    ├── RegionMap and planning layers
    │   └── Optional competition-count municipality fill
    ├── RegionDetails
    └── Regional Dashboard / Comparison
```

The first implementation should use the existing competition repository, shared year filter, municipality geometry, and current map stack. It should not add synthetic competition coordinates, event categories, or inferred event IDs. A later dataset contract should add a stable event identifier and explicit completeness metadata before exact event deduplication or year-over-year claims are introduced.

## Final recommendations

- Do not add a standalone competition map. Add the competition-count layer only to the existing homepage and planning maps.
- Preserve record-based counts exactly as stored. Distinguish records from unique title strings and do not silently deduplicate exact triplets.
- Show 2019 as unavailable and avoid presenting partial-year comparisons as complete.
- Keep `Maarianhamina` visible in both competition layers; mark population-based measures unavailable until its population-dataset name is reconciled.
- Keep regional competition aggregates in Aluesuunnittelu, but consolidate repeated national competition analysis and filters.
- Add future club, membership, course, or scenario layers only after their data sources and join keys have been validated.
