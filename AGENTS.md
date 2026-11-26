# Uniconverter

Uniconverter is a single HTML file that customs freight forwarders use in the browser. They drop an Excel or CSV file, match its columns to a country format, and download the result. Saved column mappings stay in `localStorage` on that computer. The page loads SheetJS 0.18.5 to read files and ExcelJS 4.3.0 to write xlsx. There is no build step and no server.

The owner is Bachir Bouti. The file to change is `index.html`.

## How index.html is organised

The page is one document. Styles are in the head. The body is a sequence of phases. One script at the bottom holds the logic. Function declarations with the same name overwrite each other, and the later one is the one that runs. That is true today for `handleFiles`, `finishUpload`, `onHsToggle`, and `openHsModal`.

Phases, by element id:

- `ph-country` asks for the output format. `renderCountryGrid` and `selectCountry` draw it from `OUTPUT_PROFILES`. Switzerland (`CH`, FastLogistics LINEDROP) and Germany (`DE`, DBH Upload) are `ready`. The Netherlands, Poland, Austria, and Belgium show Coming soon.
- `ph-upload` is the drop zone. `handleFiles` reads `.csv`, `.xls`, and `.xlsx`. `parseFile` turns a file into headers and rows. `isConsignmentFile` skips mapping when the name contains "consign" or a workbook has a `GoodsItems` sheet.
- `ph-mapping` is the marble board. `renderPool`, `renderTargets`, `assign`, and `toggleSkip` match source columns to `FIELDS` (Switzerland) or `FIELDS_DE` (Germany). `goConfigure` blocks until every required field is mapped or skipped.
- `ph-configure` collects Anzahl and runs `generate`. That chains the invoice, preference, currency, date, and HS dialogs, then `doGenerateLD`, `doGenerateConsignment`, or `doGenerateDE`.
- `ph-edit` is the review grid. `showEditPhase` fills it. `downloadFromGrid` writes xlsx. `downloadCSV` writes Windows-1252 CSV. `ph-done` is the fallback when the grid throws.
- `ph-consolidate` loads a previous file into the same grid through `runConsolidateToEdit`. From the grid, `_applyConsolidation` groups rows.

Profiles and settings:

- `saveProfile`, `loadProfiles`, `bestProfile`, and `applyProfileData` keep column mappings under the key `ld_profiles_v1`. `doGenerateLD` writes one automatically. At most 25 are kept.
- `loadSettings` and `saveSettings` keep the HS database URL and consolidate limits under `ld_settings_v1`.
- `saveProfile_country` stores the selected country under `ld_output_profile_v1`. The country screen still shows on every open.

Clicks go through the `data-action` map at the end of the script. A new button needs an entry there.

The feature list, with the test that covers each one, is in `docs/FEATURES.md`.

## Project rules

Keep the design simple. The tool stays one HTML file. Do not add a bundler, a framework, or a second way to store profiles.

Do not duplicate profiles. Mapping profiles already live in `ld_profiles_v1`. Country formats already live in `OUTPUT_PROFILES`. Open pull requests 1 and 2 add template output profiles on their own branches. Leave those branches alone.

Test every change with the unit tests and a browser test that saves screenshots. Summarise both in the pull request.

Keep pull requests small. Open a pull request. Do not push to `main`.

UI text stays in English. German names of customs fields stay, because they are the output format. `node scripts/check-english.mjs` fails when French shows up in the UI strings. The check is described in that file. One existing placeholder, `Référence expédition`, is listed in `scripts/french-ui-baseline.txt`. Translate it and delete that line in the same change.

## Verification

From the repo root:

```
npm install
npx playwright install chromium
npm test
```

`npm test` runs three things in order.

1. `node --test tests/unit.test.mjs` loads `index.html` in jsdom and calls the functions. The test copy attaches `S` and the profile tables to `window` so the tests can set them up. The file on disk is not modified.
2. `node scripts/check-english.mjs` checks UI strings for French.
3. `playwright test` serves the repo, opens `index.html` in Chromium, and walks the main flow. Screenshots land in `test-results/screenshots/`. The CDN scripts are served from `node_modules` during the test. The page still points at the CDN for real use.

`npm run test:unit`, `npm run check:english`, and `npm run test:browser` run the parts on their own.
