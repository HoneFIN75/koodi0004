# Browser support and CI coverage

| Browser | Coverage | CI policy | Observed local runtime |
|---|---|---|---|
| Chromium | Full Playwright browser suite | Required on every pull request and push to `main` | 2.1 minutes for all 61 tests |
| Firefox | `tests/browser/cross-browser.spec.ts`: dashboard map/filter and planner login/save/reload smoke journeys | Scheduled weekly and available through manual workflow dispatch; not a pull-request gate | 12 seconds for both selected tests |
| WebKit | Not currently covered | — | — |

Both browsers use the same Playwright assertions and deterministic API/tile fixtures. The Firefox suite has exactly two selected journeys; the rest of the browser suite remains Chromium-only. Runtimes are observed local test durations (excluding browser installation); hosted CI duration varies by runner and should be reviewed from scheduled workflow results.

Run the required baseline with `npm run test:e2e`. To run the Firefox smoke suite locally, install its browser with `npx playwright install firefox`, build with `npm run build`, then run `npx playwright test --project=firefox`.
