# Features

User-facing behavior of `index.html` on `main`. The test column names a check in `tests/unit.test.mjs` or `tests/browser.spec.js`.

| Feature | Where | Test |
| --- | --- | --- |
| Choose Switzerland or Germany. Other countries show Coming soon. | `ph-country`, `OUTPUT_PROFILES`, `renderCountryGrid`, `selectCountry` | Browser test opens the country screen. Unit test checks which profiles are `ready`. |
| Drop or browse for CSV, XLS, or XLSX. | `ph-upload`, `handleFiles`, `parseFile`, `detectHeaderRow` | Browser test loads `tests/fixtures/sample.csv` and an `.xls` file. Unit test checks header detection and `parseFile`. |
| Pick a sheet when the workbook has more than one. | `openSheetModalMulti`, `getSheetSummaries`, `defaultSheet` | No browser coverage. `defaultSheet` prefers a sheet named `GoodsItems`. |
| Detect a consignment file and skip the mapping board. | `isConsignmentFile`, `readGoodsItemsSheet`, `extractRowsConsignment`, `showConfigureForConsignment` | Unit test reads a `GoodsItems` sheet and checks the name rule. |
| Match source columns to output fields by clicking or dragging. Required fields block Continue. | `renderPool`, `renderTargets`, `assign`, `toggleSkip`, `goConfigure`, `FIELDS`, `FIELDS_DE` | Browser test maps the sample file and reaches Anzahl. |
| Save a column mapping in this browser and apply it the next time the same headers arrive. | `saveProfile`, `bestProfile`, `applyProfileData`, `doGenerateLD` | Browser test checks `localStorage` after Generate, reloads the same CSV, and lands on Anzahl. Unit test checks name matching, order, and the cap of 25. |
| Enter Anzahl, answer the date dialog, and build the output. Invoice, preference, and currency dialogs open only when those fields are not mapped. | `generate`, `submitDate`, `submitPR`, `submitCurrency`, `submitInvoice`, `doGenerateLD`, `doGenerateDE`, `extractRowsLD`, `extractRowsDE` | Browser test fills Anzahl and the date, then sees the review grid. Unit test checks `resolvePR`. |
| Review, edit, undo, replace an HS code, and consolidate from the grid. | `showEditPhase`, `downloadFromGrid`, `downloadCSV`, `_applyConsolidation` | Browser test reads the grid values and downloads xlsx. Consolidation sums are covered by the unit test of `consolidateRows`. |
| Look up an HS code from a reference file or a URL in Settings. | `parseHsDb`, `lookupHs`, `onHsToggle`, `openHsModal`, `loadSettings` | Unit test parses a reference sheet and looks up a SKU. |
| Open a previous file from the Consolidate shortcut. | `ph-consolidate`, `runConsolidateToEdit` | Not covered in the browser. The group-and-sum rule is the `consolidateRows` unit test. |

## Limitations

Checked against `index.html` on `main`. Two items from the original list are wrong. Both are called out below.

`.xls` input is exported as `.xlsx`. `doGenerateLD` names the file `*_LINEDROP.xlsx`. `doGenerateDE` names it `*_DBH.xlsx`. The browser test uploads `lines.xls` and the download is `lines_LINEDROP.xlsx`. A CSV upload is also written as `.xlsx` on this path. CSV download is a separate button on the review grid, and that file is Windows-1252 (`toCP1252`).

There is no template import on `main`. Output columns are the fixed lists `LD_HEADER_TITLES` (21 columns) and `DBH_HEADERS` (16 columns). Nothing copies column names, order, styles, or formulas from a user file into a new output format. Saved mapping profiles store the source column names and apply only when the header list matches in length and order (`bestProfile`). Open pull requests 1 and 2 add template output profiles. This tree does not.

`'1.234'` is read as one point two three four, not as one thousand. `fmtNumStr` leaves the dot in place, turns the first comma into a dot, and calls `parseFloat`. So `'1,234'` is also 1.234, and `'1.234,56'` stops at 1.234. Neither symbol is a thousands separator. `parseFile` on the text `1.234` produces a value that `fmtNumStr` turns into 1.234. The browser grid shows `1.234` for the sample CSV.

Input CSV is not a general UTF-8 or Windows-1252 reader. Measured through `parseFile`:

- UTF-8 is decoded only when the file starts with a UTF-8 BOM. Without a BOM, `café` is read as `cafÃ©`.
- The byte `0xE9` (é in both Latin-1 and Windows-1252) is read as é.
- Bytes from `0x80` to `0x9F` are not translated. The euro sign (byte `0x80`) stays U+0080, not €.
- `runConsolidateToEdit` and `runConsolidate` do the same byte-by-byte read for `.csv`, and they assume a semicolon separator.

Other encodings are not supported. CSV that the app writes is Windows-1252, including the euro sign, via `toCP1252`.

A file with more than 200 columns is not refused. The only `200` values in the file are a z-index and a pixel width. `parseFile` returns 201 headers for a 201-column CSV.

Amounts and weights are not recognised by themselves on the mapping screen. `SYNONYMS` and `SYNONYMS_DE` list name variants for amount and weight, and a comment points at `bestAutoMapping`, but nothing reads those tables. Dropping headers named `amount` and `gross weight` leaves `S.mapping` empty. The consignment reader is different. `readGoodsItemsSheet` matches `Total Price`, `Total Gross Mass`, and `Total Net Mass` by header name. It does not look at the cell values.

Mappings are saved in this browser only. `storeProfiles` writes `localStorage` key `ld_profiles_v1` and keeps 25 profiles. There is no account and no export file on `main`.
