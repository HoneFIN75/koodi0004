# Municipality population integration report

## Scope and architecture

The dashboard and planner can aggregate 2025 population by province using `jsondb/regions.json` and the province values in the municipality boundary dataset. This is a derived view: province colors and labels come from the registry, while municipality membership, population, and area come from the shared municipality records. It does not duplicate population rows, alter planner documents, or imply historical province population series. Missing municipal population makes a province population total and population density unknown.

The supplied `municipalities-population-2025.json` is copied unchanged into `src/data/` as a permanent, read-only reference source. A static JSON module import feeds the centralized `populationService`. Module initialization processes it once; both application routes share the same records, name index, national total and population rankings. No population API, separate repeated population requests, external service or server credential is required.

The existing municipality repository continues caching one boundary-fetch promise, now enriching its municipalities with the authoritative population reference instead of relying on optional boundary properties. A generated compact bilingual name index allows population-service lookups to work before boundaries have loaded. React memoization handles club placement, filtered results, coverage, municipality summaries and backup comparisons. Dataset-wide population summaries are cached by dataset identity in a WeakMap. Updates must create a new dataset rather than mutate a cached dataset.

The codebase was inspected for club and municipality data, geographic placement, municipality editing, region/scenario definitions, maps, filtering, statistics, dashboards, comparisons, backups and exports. Province-level competition totals reuse the existing municipality-based competition index and active year filter; province-level population totals reuse the shared population source. Authentication, account administration, theme preferences and planner persistence formats are not population features and remain unchanged.

## Data audit and matching

| Check | Result |
|---|---|
| Declared population year | 2025 |
| Declared municipality count | 308 |
| Actual unique source records | 308 |
| Joined boundary municipalities | 308/308, including all 16 in Aland |
| Supplied national total | 5,652,881 |
| Invalid, negative, fractional or duplicate populations | None in the supplied file |
| Finnish primary-name mismatch | Boundary `Maarianhamina`; source `Maarianhamina - Mariehamn` |
| Resolution | Register both halves of the combined source name and the official Finnish/Swedish names |
| Remaining unmatched boundaries | None |
| Bilingual names with different Finnish/Swedish spellings | 114 pairs from existing boundary properties |
| Original publisher and reference date within 2025 | Not supplied; explicitly marked unspecified |

Names are normalized with Unicode NFC, Finnish case-folding, whitespace collapsing and trimming. Diacritics are preserved rather than removed, avoiding accidental conflation. Finnish and Swedish aliases come from the existing boundary dataset, not speculative historical municipality mappings. Club location assignment retains the existing point-in-polygon fallback for former municipalities or villages. Unknown names return `null`.

Malformed source structures/years throw explicit errors. Invalid or duplicate rows and inconsistent metadata generate warnings instead of silently replacing accepted records. Missing population is not zero: complete region/coverage totals and per-capita rates are withheld when required values or municipality codes are unknown. Mean/median and extrema use known municipalities only. An empty coverage union is zero residents, while averages, medians and per-capita rates on empty data are unknown.

The total is a sum of the supplied records, not an independently verified official Finland population figure. The original source, licensing and precise measurement date should be established before making authoritative demographic claims.

## Reusable helpers

`populationService.ts` provides:

- `getMunicipalityPopulation(name)` and `getMunicipalityByName(name)` for cached name/alias lookup.
- `getMunicipalityRank(name)` for national population ranking; ties receive the same rank.
- `getLargestMunicipalities(count)` and `getSmallestMunicipalities(count)`.
- `getNationalPopulation()` for the precomputed source total.
- `getRegionPopulation(regionId, document, dataset)`, scoped to the document's active scenario.
- `getPopulationCategory(population)` and `matchesPopulation(population, filters)`.
- `per10000Residents(count, population)` for consistent null/zero-safe per-capita calculations.
- `summarizePopulation(municipalities)` for de-duplicated total, known total, missing names, mean, median, extrema and ordering.
- `getDatasetPopulation(dataset)` for cached national boundary-linked summaries.
- `getCoveragePopulation(regions, dataset)` for the union of enabled region municipalities.
- `normalizeMunicipalityName(name)` and `registerNames(...)` for consistent name handling.
- `createPopulationService(input)` for validation and isolated test instances.

## Standard population categories

UI labels are Finnish; the service also retains the requested English labels. These bands do not assert administrative city status.

| English category | Finnish UI label | Residents |
|---|---|---|
| Mega City | Suurkaupunki | >= 200,000 |
| Large City | Suuri kaupunki | 100,000-199,999 |
| Medium City | Keskisuuri kaupunki | 50,000-99,999 |
| Small City | Pieni kaupunki | 20,000-49,999 |
| Large Municipality | Suuri kunta | 10,000-19,999 |
| Municipality | Kunta | 5,000-9,999 |
| Small Municipality | Pieni kunta | 2,000-4,999 |
| Very Small Municipality | Hyvin pieni kunta | 0-1,999 |

## New calculations and interpretation

| Calculation | Definition and safeguards |
|---|---|
| National population | Sum of unique source municipalities; cached once |
| Region population | Sum over unique selected municipality codes |
| Regional mean and median | Municipality populations, not club member counts |
| Largest/smallest municipality | Region's population extrema with deterministic name tie-breaking |
| National municipality rank | Descending population; equal populations share rank |
| Region share of Finland population | Region population / complete boundary-linked national population |
| Population density | Residents / existing municipality-boundary area in square kilometres |
| Clubs per 10,000 residents | Matched club count / corresponding population * 10,000 |
| Members per 10,000 residents | Known member total / corresponding population * 10,000 |
| Enabled-region coverage | Union of municipality codes, counting overlaps only once |
| Unassigned population | Population of municipalities outside the enabled-region union |
| Club-municipality population | Unique municipalities hosting currently filtered, geographically matched clubs |
| Category breakdown | Municipality count and resident total per size band |
| Municipality comparison | Both population totals and absolute difference |
| Scenario/backup comparison | Enabled-region coverage using the same 2025 reference data |

Existing club filters still change club/member/vote metrics; they do not shrink the geographic population of a defined region. Therefore regional per-capita metrics describe the filtered clubs against the whole region's population. The club dashboard instead uses only the union of filtered clubs' matched home municipalities; unmatched clubs are excluded from both the per-capita numerator and geographic denominator. Unknown member counts remain excluded from member sums as before; rates are not verified residential membership or participation rates.

Individual regions may intentionally overlap. Region-specific chart bars and export rows describe each region separately; they must not be summed as a non-overlapping national total. Coverage summary cards count overlaps once. Area-based density retains the existing boundary area definition, including inland waters. No residential population-weighted geographic centroid is invented from polygon label points.

## Affected dashboards, maps and visualizations

| Surface | Integration |
|---|---|
| Public club dashboard (`App`) | Filtered club-municipality population; members and clubs per 10,000 residents; population filters and national explorer |
| Public club map (`MapView`) | Municipality population in each club tooltip; population filters affect marker selection without changing existing membership sizes/voting colours |
| Public club detail (`ClubDetail`) | Matched municipality, population, category, national rank and club members per 10,000 residents |
| Planner map (`RegionMap`) | Municipality population/category/rank tooltips, region-label population tooltips, club-municipality population, optional category-based choropleth and legend |
| Planner municipality detail (`MunicipalityCard`) | Population, national rank, category, national share, population density and clubs per capita |
| Region list/detail | Population summary plus regional population share, municipal mean/median/extrema and per-capita rates |
| Municipality picker | Population beside each municipality; selected population; minimum/maximum/category filters also affect bulk selection |
| Planner club filters | Minimum/maximum population and category combine with existing club/member/vote/region filters |
| Executive planner dashboard | National, assigned, unassigned and filtered club-municipality population cards; regional population and members-per-capita bar charts |
| Region comparison | Sortable population, share, municipal mean/median, per-capita rates and density columns; selectable chart metrics; de-duplicated combined population |
| Unassigned municipality view | Unassigned population card and municipality population column |
| Scenario cards | Enabled-region population coverage for each scenario, de-duplicating overlaps |
| Backup comparison | Active-scenario coverage before/after and change, using 2025 data for both snapshots, not historical demographic change |
| Population explorer | National mean/median/extrema, top 10/20/50/all municipalities, smallest/largest ordering, bilingual search, min/max/category filters, national ranks/shares, resident distribution bars and two-municipality comparison |

The reusable population explorer appears in public dashboard analytics and the planner's import/export view. It stays public and read-only. Its table is keyboard-focusable for horizontal scrolling on small screens. Choropleth colours are explained by text/category thresholds, not colour alone.

Existing approximate directional groups in the club dashboard are not formal municipal regions. Their member chart is retained without attributing an unsupported geographic population to those groups. Existing club result rows and member/vote distributions retain their original meaning; municipality demographics are available in details and the population explorer.

## Affected reports and exports

| Format | Added population information |
|---|---|
| JSON | Reference year, national population, missing municipality names and unspecified-source metadata; per-scenario coverage and region-level population analytics with municipality population/rank/category |
| CSV | Municipality population, national rank, category, clubs/members per 10,000 residents in region-municipality rows |
| XLSX `Alueet` | Region population, national share, municipal mean/median/extrema, per-capita rates and population density |
| XLSX `Aluekunnat` | Same municipality population columns as CSV |
| XLSX `Metatiedot` | Population year, national total, source limitation and overlap interpretation |
| On-screen coverage explanation | Regional population and share of national population |

The planner document and backups are not rewritten to store demographics. Exported analytics are derived reference data; JSON remains import-compatible, and importing a planner document does not replace the population source. Existing CSV formula neutralization and safe DOM text rendering remain intact.

## Complete file and component inventory

| File | Status / purpose |
|---|---|
| `src/data/municipalities-population-2025.json` | New permanent user-supplied dataset, unchanged |
| `src/data/municipality-names.json` | New generated bilingual name index |
| `scripts/build-municipality-names.mjs` | New regeneration command for the name index |
| `src/services/populationService.ts` | New centralized validation, caching, matching, categorization, ranking and summary helpers |
| `src/data/municipalityRepository.ts` | Enrich the cached boundary dataset with population |
| `src/services/regionAnalytics.ts` | Region/scenario population and per-capita calculations; population club filters; coverage explanation |
| `src/services/searchService.ts` | Population-aware public club filtering |
| `src/services/mapService.ts` | Population in safe club tooltip content |
| `src/services/exportService.ts` | JSON/CSV/XLSX population fields and provenance |
| `src/components/PopulationFilters.tsx` | New shared min/max/category filter component |
| `src/components/PopulationExplorer.tsx` | New shared population analytics/search/comparison component |
| `src/App.tsx` | Public dashboard data/placement wiring, metrics and explorer |
| `src/components/ClubFilters.tsx` | Shared population filters and reset |
| `src/components/ClubDetail.tsx` | Municipality demographics and per-capita detail |
| `src/components/MapView.tsx` | Resolved population in club map tooltips |
| `src/planner/PlannerApp.tsx` | Population-map toggle, explorer, scenario/backup dataset wiring |
| `src/planner/components/PlannerFilters.tsx` | Shared population filters |
| `src/planner/components/MunicipalityCard.tsx` | Population detail metrics |
| `src/planner/components/MunicipalityPicker.tsx` | Population-based municipality selection and selected population |
| `src/planner/components/RegionList.tsx` | Population in region rows |
| `src/planner/components/RegionDetail.tsx` | Population statistics, extrema and municipality population labels |
| `src/planner/components/RegionMap.tsx` | Tooltips, choropleth and legend |
| `src/planner/components/DashboardView.tsx` | Population coverage cards and charts |
| `src/planner/components/ComparisonView.tsx` | Population table/chart metrics and union summary |
| `src/planner/components/UnassignedView.tsx` | Unassigned population summary and table column |
| `src/planner/components/ScenarioManager.tsx` | Population coverage in scenario cards |
| `src/planner/components/BackupManager.tsx` | Population coverage comparison |
| `src/styles.css` | Shared responsive filters/explorer/table/chart/legend styles |
| `tests/population.test.mjs` | New numeric, matching, quality, coverage, filtering, caching and export tests |
| `tests/planner.test.mjs` | Replace obsolete missing-population expectation with the real source total |
| `tests/browser/dashboard.spec.ts` | Public population comparisons, bilingual search, filters, detail and cached cross-route loading |
| `tests/browser/planner.spec.ts` | Population across map/details/dashboard/comparison/explorer |
| `README.md` | Population architecture, regeneration, usage, limitations and report link |
| `POPULATION-INTEGRATION.md` | This report |

All new/modified React components are enumerated above; no additional dashboards, maps, competition features or report formats exist outside the described surfaces.

## Verification

Tests cover all 308 boundary matches and their Swedish aliases, exact category edges, Unicode normalization, invalid/missing/duplicate records, tied rankings, region totals and median, per-capita arithmetic, overlap de-duplication, disabled regions, unknown codes, inclusive range/category filters, JSON/CSV/XLSX fields, and unchanged planner document contents.

Browser coverage includes public and authenticated views, cross-route reuse of one boundary request, population filters/comparisons, regional population displays and the map legend. Existing suites continue checking public read-only behavior, shared storage/authentication, imports/exports, undo/redo, themes, mobile layouts and automated accessibility. Production type checking/build is required before publication.

Final validation completed successfully: `npm test` passed 45 tests; `npm run test:e2e` passed 18 browser tests and its production build/type check. Automated accessibility checks passed for both themes and dashboard widths of 1440, 390 and 320 pixels. `git diff --check` passed. Deployment uses the existing production workflow after the integration is merged into `main`; no new server configuration or authentication initialization is required.

## Recommendations

1. Confirm the original population publisher, usage license, precise reference date and official national total; add verified provenance without changing the supplied numbers silently.
2. When updating the reference year, update the population source, explicit year labels and tests together; regenerate the bilingual name index after boundary changes.
3. Add population-based competition coverage only if actual competition records and host-municipality identifiers are introduced. De-duplicate overlapping host/coverage municipalities.
4. Consider official administrative-region population comparisons only after obtaining trustworthy municipal membership definitions; do not infer them from club coordinates.
5. If useful, add a separate per-capita choropleth with an explicit metric/denominator rather than conflating population size, resident density and club density.
6. Add longitudinal comparisons only with separately versioned yearly datasets. The current backup comparison reflects planning coverage changes, not population change over time.
