# Browser support and CI coverage

| Browser | Coverage | CI policy | Observed test runtime |
|---|---|---|---|
| Chromium | Full Playwright browser suite (61 tests) | Required on every pull request and push to `main` | 2.1 minutes locally |
| Firefox | `tests/browser/cross-browser.spec.ts`: dashboard map/filter and planner login/save/reload smoke journeys (2 tests) | Scheduled weekly and available through manual workflow dispatch; not a pull-request gate | 8 seconds locally; 9 seconds for the test step in CI |
| WebKit | Not currently covered | Not required for the current browser-support scope | — |

Firefox provides a second browser engine for the current critical journeys. No Safari/WebKit support requirement is documented in the repository; adding WebKit is deferred until Safari support is an explicit product requirement. The smoke tests use the same assertions and deterministic API/tile fixtures as Chromium, with no browser-specific test branches.

The manual workflow run [42383335728](https://github.com/HoneFIN75/koodi0004/actions/runs/42383335728) passed both jobs on 2026-11-07. The Firefox job took 48 seconds end-to-end, including setup, browser installation and build; its test step took 9 seconds. The Chromium job took 2 minutes 8 seconds end-to-end, including setup, browser installation and the full suite. Local runtimes exclude browser installation; hosted CI duration varies by runner.

Run the required baseline with `npm run test:e2e`. To run the Firefox smoke suite locally, install its browser with `npx playwright install firefox`, build with `npm run build`, then run `npx playwright test --project=firefox`.
