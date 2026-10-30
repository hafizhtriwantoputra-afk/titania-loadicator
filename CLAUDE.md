# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Titania Loadicator: an offline-capable PWA loading-condition calculator for MT TITANIA (IMO 9987469). It computes drafts/trim (CAMEL method), GM, IS Code 2008 intact stability and weather criterion, SF/BM, propeller immersion, bridge visibility, trim-corrected cargo soundings, and a PDF report. It is a planning aid only; the approved CAMEL loading computer is the official reference.

## Sebelum mengubah kode
- Baca graphify-out/GRAPH_REPORT.md dulu untuk memahami struktur proyek. Folder itu hanya ada di komputer ini dan tidak ikut git; kalau tidak ada atau usang, jalankan /graphify dulu.
- Setelah perubahan yang menambah atau mengubah fungsi, fitur, atau file, dan hasilnya sudah dicek serta di-commit, jalankan /graphify . --update atau ingatkan user.

## Build / test / run

There is no build system, package manager or linter. The only tests cover the pure planner helpers (the `PLAN-CORE` block) and need just Node:

```bash
node tests/plan.test.mjs
```

The whole app is static files served as-is (GitHub Pages, `.nojekyll`). To run locally, serve the directory over HTTP (the service worker only registers on https or localhost):

```bash
python3 -m http.server 8000
```

## Architecture

Everything lives in the single ~690 KB [index.html](index.html) (no modules, no bundler). Do not read it whole; use `grep -n` / ranged reads. Lines 1500 and 1501 (the `SHIP` and `EXAMPLES` data) are enormous (~414 KB and ~9 KB of JSON) and will blow up any full-line output, so cut them (`cut -c1-300`). Line numbers drift as the file grows; find parts with `grep -n "^<script>"`. The file has these parts, in order:

1. **CSS and markup** (top to ~line 625): six tab sections: `t-info` (default), `t-tanks`, `t-plan`, `t-res`, `t-save`, `t-set`.
2. **Engine** (first `<script>`, an IIFE exposing `LC`): pure calculation with no DOM access. Interpolation helpers, cargo volume correction (`vcf`), per-tank properties from calibration tables (`tankProps`, `trimCorr`), hydrostatic equilibrium (`equilibrium`, `hydAt`), KN cross-curves, `compute(S, cond)` (weights/moments, GM, stability, weather criterion, propeller/visibility) and `strength` (SF/BM from Bonjean data).
   **PLAN-CORE** (the `<script>` right after the engine, between `// PLAN-CORE start` and `// PLAN-CORE end`): pure planner helpers with no DOM, `S` or `LC` access, sliced out and run by `tests/plan.test.mjs`: `migrateV3`, `planTarget`, `ballastText`, `opFromFinal`, `XL_MAP`, `keepOps`, `autoDisch`, `sensorMap`, `sensorParse`.
3. **MiniPDF** (`const MiniPDF`): a dependency-free multi-page PDF writer (Helvetica and Times, WinAnsi, hardcoded width tables). Supports per-page sizes, clipping, images (PNG/JPEG decoded through a canvas, with alpha) and "slots" (several logical pages on one physical sheet, used for 2-in-1). The PDFs must stay free of external libraries so they work offline.
4. **PlanXlsx** (`const PlanXlsx`): fills the user's own `.xlsx` template without a library (reads/writes the zip, edits sheet XML, copies every other part byte for byte). Also writes cached values for formula cells, swaps cell styles (green boxes), fixes borders and adds signature pictures to the drawings.
5. **SheetCalc** and **XlsxPdf**: `SheetCalc` evaluates the template's simple formulas (refs, `SUM`, `ROUND`, arithmetic) so values are right without Excel. `XlsxPdf` prints the filled sheets to PDF the way Excel would (styles, merges, borders, diagonal borders, logos, hull shapes, page breaks, 2-in-1, full-width landscape).
6. **App script** (the big one after the engine): starts with the data constants `SHIP` (ship particulars, load lines, and every tank's calibration table), `EXAMPLES`, and label maps, followed by UI logic: state, `solve`/`update` and render functions, charts (hand-built SVG), `buildPdf` (the old condition report), saved conditions, import/export, the loading planner (`renderPlan`, `planUpdate`, `planSeq`), the Info tab (loading plan data, ROB density, crew onboard and saved crew with signatures) and the export code (`planData`, `xlEdits`, `xlFills`, `buildSheetPdf`, `exportPlan`).
7. **Service worker registration** (last `<script>`): registers `sw.js` on https or localhost only.

### State and data flow

- Global `S` is the current condition, persisted to `localStorage` under `lc_current` (saved conditions under `lc_saved`). `S.v` is the schema version (currently 3); v2 states (one plan in `S.plan`) are converted by `migrateV3` at start, in `loadState` (Saved) and `importText`; any other mismatch resets to `exampleState(0)`. Opening a Saved condition, importing JSON, test conditions and Clear all replace the tanks only and keep the current planner cycle (`keepOps`).
- `SHIP` is immutable reference data (from CAMEL Stored Data, BV test conditions, Loading Manual, Bonjean table, SGS calibration). Each tank is run through `LC.prep` at startup.
- Typical flow: UI input → mutate `S` → `buildCond` (cargo `vol`/`rho`/temperature → tank volumes via `cargoCalc`) → `solve` → `LC.compute` → `update` → render functions. Rendering is by `innerHTML` string templates, not a framework.
- Operations: `S.ops` is a list of operations (`type` `'load'` or `'disch'`, cycle number `cy`, `id`) and `S.opCur` the active one; `PLs()` returns it. A bunker cycle is one loading then several dischargings to receiving vessels; `opNewDisch` copies the previous operation's Final (`opFinal`: observed soundings, ballast, cargo density) into the new Initial, `opNewLoad` starts the next cycle. The Operation card at the top of the Info tab lists and switches them; labels that change with the type come from `MODE_LBL`/`ML` (elements with `data-ml`).
- The planner (`PLs()`) has an Initial condition (ROB / cargo on board soundings, `planRob`) and four stages `PLs().seq[0..3]` (Seq 1, Seq 2, Seq 3, Final). A blank cell means "same as the previous stage". `planSeq` resolves the chain and runs `LC.compute` for every stage; the target is `planTarget` (loading: Initial + nomination; discharging: Initial − nomination, blank nomination = discharge all) (`condFor` builds the condition; fuel, lub oil, FW and misc tanks come from the Tanks tab). "Open this condition in Results" copies a stage into `S` for the Results tab and the old PDF.
- Loading plan data (date, port, terminal, cargo, density, temperature, ROB density, stowage tank) is stored in the operation (`PLs()`) and edited in the Info tab (cargo quantity, density and temperature live in `PLs().parcels[0]`; for discharging, Terminal is the receiving vessel).
- Crew and signatures are **not** in `S`: they live in `localStorage` under `lc_crew` (names, ranks, signature PNG data URLs, watch selections) and the Excel templates in IndexedDB (`lc_files`, key `xlsx` for loading, `xlsx_d` for discharging). Nothing personal goes into the repo or into exported condition JSON. Signatures come from `signatureFromPhoto` (removes the paper background; `SIGN_FROM_CAMERA` switches the button from a file picker to the camera).
- Export flow (`exportPlan`): `planData` collects values from `planSeq`/`planRob` and the crew → `xlEdits` (cell values) and `xlFills` (green boxes = tanks that change in a stage) → `PlanXlsx.fill` → Excel blob; `buildSheetPdf` prints the plan sheet (A4 portrait, 2-in-1 on landscape) and HOURLY (landscape) from the same filled sheets. Rows 64-90 and HOURLY 33/70 are the same in both templates; the addresses that differ (sheet name `Sheet1`/`PLAN`, watch, Navtex, inspection, agreement, signature rows and picture anchors, page numbers) are in `XL_MAP.load` / `XL_MAP.disch`. Check them if a template layout changes. Discharging uses `tplFor('disch')` and hides the ISGOTT/Pre-Arrival checklists.
- The Saved tab has two buttons: **Template** (loads the Excel template and the checklist templates into IndexedDB, nothing is stored in the repo) and **Export** (a dialog with checkboxes, then `exportPlan(sel)` builds the chosen files and `xpDeliver` saves them in one tap: download bridge, share sheet on phones, else sequential downloads). Sheet PDFs rotate back sheets 180° (`P.flipBack`) for short-edge duplex printing.
- Checklist PDFs (ISGOTT D-01 and Pre-Arrival D-34) are not rendered from Word in the app: a template pack (`.json`, page images made from the user's Word file with the sample values removed, kept outside git) is loaded once, and `isgFill`/`preFill` print only the date, berth (the Info Terminal box; the terminal name is the part before the number/#), Ch. Officer/Master names and dates on top. ISGOTT is 2-in-1 landscape; Pre-Arrival is one A4 page. Never commit these packs or the Excel template (they hold crew names).
- Length unit (`S.lenUnit`, `mm` by default, switched with the dropdown in the Initial/Seq SDG header via `setLU`) is a display/input concern only. Convert with `toCm`/`fromCm`/`fL`; internal values are cm for soundings and metres elsewhere. Cargo SDG goes to Excel/PDF in mm, ballast SDG stays cm. `toMM` migrates old cm states once.

## Sensor sync

The **Sync sensor** button (Plan → Initial and Tanks tab, always shown) fills tanks from data pasted from the companion **Titania Sync** page (kept in a separate private repo, not here). GitHub Pages is https and cannot fetch from a local http page, so the data goes over the clipboard as `SENSOR_TAG` + JSON `{ok,time,cargo[{tank,ullage_mm,temp_c,pressure_raw}],resid[{tank,temp_c}],other[{tank,sounding_cm}]}`. `sensorSync` reads the clipboard (`sensText`, iPhone shows a Paste bubble) or falls back to the paste box `#spModal`, then `sensorParse` and `sensorMap` (both PLAN-CORE, tested) map sensor names to `SHIP.tanks` ids (`SENSOR_ALIAS`; `MGO.SER.TK2 (P)` on the sensor is `MGOSERTK2S`, confirmed by the user). Cargo ullage → Initial sounding (ref height − ullage), ballast → Initial (SDG cm), FO/LO/FW → Tanks tab; ROB temperature only when Info → Temperature from = Online (`P.rob.tempSrc`, volume-weighted). Filled inputs get class `sens` until edited (`P.rob.sync.ids`, `S.tkSync`). Tested on an iPhone with a mock server; not yet on board.

This repo is public. Never put the ship's network details (IP addresses, ports, WiFi names, register maps), the PC-side programs, or vendor files here; they belong in the private sensor repo.

## Releasing changes

The service worker ([sw.js](sw.js)) serves the app page network-first and everything else cache-first. When `index.html` or any other cached asset changes, bump the cache name constant `C` in `sw.js` (currently `titania-lc-v3-28`) so installed phones drop the old cache. Add any new asset files to the `CORE` list in `sw.js`.

Because the data tables are inlined in `index.html`, edits to calibration or hydrostatic data are single-line edits to the huge `SHIP` line. Use targeted scripted edits (e.g. a Python script that parses and rewrites the JSON) rather than the Edit tool on that line.
