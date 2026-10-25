# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Titania Loadicator: an offline-capable PWA loading-condition calculator for MT TITANIA (IMO 9987469). It computes drafts/trim (CAMEL method), GM, IS Code 2008 intact stability and weather criterion, SF/BM, propeller immersion, bridge visibility, trim-corrected cargo soundings, and a PDF report. It is a planning aid only; the approved CAMEL loading computer is the official reference.

## Sebelum mengubah kode
- Baca graphify-out/GRAPH_REPORT.md dulu untuk memahami struktur proyek. Folder itu hanya ada di komputer ini dan tidak ikut git; kalau tidak ada atau usang, jalankan /graphify dulu.
- Setelah perubahan yang menambah atau mengubah fungsi, fitur, atau file, dan hasilnya sudah dicek serta di-commit, jalankan /graphify . --update atau ingatkan user.

## Build / test / run

There is no build system, package manager, linter, or test suite. The whole app is static files served as-is (GitHub Pages, `.nojekyll`). To run locally, serve the directory over HTTP (the service worker only registers on https or localhost):

```bash
python3 -m http.server 8000
```

## Architecture

Everything lives in the single ~1.1 MB [index.html](index.html) (no modules, no bundler). Do not read it whole; use `grep -n` / ranged reads. Lines 1364 and 1365 are enormous (~414 KB and ~9 KB of JSON) and will blow up any full-line output, so cut them (`cut -c1-300`). Line numbers drift as the file grows; find parts with `grep -n "^<script>"`. The file has these parts, in order:

1. **CSS and markup** (top to ~line 570): six tab sections: `t-info` (default), `t-tanks`, `t-plan`, `t-res`, `t-save`, `t-set`.
2. **Engine** (first `<script>`, an IIFE exposing `LC`): pure calculation with no DOM access. Interpolation helpers, cargo volume correction (`vcf`), per-tank properties from calibration tables (`tankProps`, `trimCorr`), hydrostatic equilibrium (`equilibrium`, `hydAt`), KN cross-curves, `compute(S, cond)` (weights/moments, GM, stability, weather criterion, propeller/visibility) and `strength` (SF/BM from Bonjean data).
3. **MiniPDF** (`const MiniPDF`): a dependency-free multi-page PDF writer (Helvetica and Times, WinAnsi, hardcoded width tables). Supports per-page sizes, clipping, images (PNG/JPEG decoded through a canvas, with alpha) and "slots" (several logical pages on one physical sheet, used for 2-in-1). The PDFs must stay free of external libraries so they work offline.
4. **PlanXlsx** (`const PlanXlsx`): fills the user's own `.xlsx` template without a library (reads/writes the zip, edits sheet XML, copies every other part byte for byte). Also writes cached values for formula cells, swaps cell styles (green boxes), fixes borders and adds signature pictures to the drawings.
5. **SheetCalc** and **XlsxPdf**: `SheetCalc` evaluates the template's simple formulas (refs, `SUM`, `ROUND`, arithmetic) so values are right without Excel. `XlsxPdf` prints the filled sheets to PDF the way Excel would (styles, merges, borders, diagonal borders, logos, hull shapes, page breaks, 2-in-1, full-width landscape).
6. **App script** (the big one after the engine): starts with the data constants `SHIP` (ship particulars, load lines, and every tank's calibration table), `EXAMPLES`, and label maps, followed by UI logic: state, `solve`/`update` and render functions, charts (hand-built SVG), `buildPdf` (the old condition report), saved conditions, import/export, the loading planner (`renderPlan`, `planUpdate`, `planSeq`), the Info tab (loading plan data, ROB density, crew onboard and saved crew with signatures) and the export code (`planData`, `xlEdits`, `xlFills`, `buildSheetPdf`, `exportPlan`).
7. **Service worker registration** (last `<script>`): registers `sw.js` on https or localhost only.

### State and data flow

- Global `S` is the current condition, persisted to `localStorage` under `lc_current` (saved conditions under `lc_saved`). `S.v` is the schema version (currently 2); a mismatch resets to `exampleState(0)`. Saved or imported state goes through `loadState` / `importText`.
- `SHIP` is immutable reference data (from CAMEL Stored Data, BV test conditions, Loading Manual, Bonjean table, SGS calibration). Each tank is run through `LC.prep` at startup.
- Typical flow: UI input → mutate `S` → `buildCond` (cargo `vol`/`rho`/temperature → tank volumes via `cargoCalc`) → `solve` → `LC.compute` → `update` → render functions. Rendering is by `innerHTML` string templates, not a framework.
- The planner (`S.plan`, `PLs()`) has an Initial condition (ROB soundings, `planRob`) and four stages `S.plan.seq[0..3]` (Seq 1, Seq 2, Seq 3, Final). A blank cell means "same as the previous stage". `planSeq` resolves the chain and runs `LC.compute` for every stage (`condFor` builds the condition; fuel, lub oil, FW and misc tanks come from the Tanks tab). "Open this condition in Results" copies a stage into `S` for the Results tab and the old PDF.
- Loading plan data (date, port, terminal, cargo, density, temperature, ROB density, stowage tank) is stored in `S.plan` and edited in the Info tab (cargo quantity, density and temperature live in `S.plan.parcels[0]`).
- Crew and signatures are **not** in `S`: they live in `localStorage` under `lc_crew` (names, ranks, signature PNG data URLs, watch selections) and the Excel template in IndexedDB (`lc_files`). Nothing personal goes into the repo or into exported condition JSON. Signatures come from `signatureFromPhoto` (removes the paper background; `SIGN_FROM_CAMERA` switches the button from a file picker to the camera).
- Export flow (`exportPlan`): `planData` collects values from `planSeq`/`planRob` and the crew → `xlEdits` (cell values) and `xlFills` (green boxes = tanks that change in a stage) → `PlanXlsx.fill` → Excel blob; `buildSheetPdf` prints Sheet1 (A4 portrait, 2-in-1 on landscape) and HOURLY (landscape) from the same filled sheets. The workbook's cell/slot addresses (rows 64-90, 102-109, 181-195, HOURLY 33/70) are hardcoded to the user's template; check them if the template layout changes.
- Length unit (`S.lenUnit`, cm or mm) is a display/input concern only. Convert with `toCm`/`fromCm`/`fL`; internal values are cm for soundings and metres elsewhere.

## Releasing changes

The service worker ([sw.js](sw.js)) serves the app page network-first and everything else cache-first. When `index.html` or any other cached asset changes, bump the cache name constant `C` in `sw.js` (currently `titania-lc-v3-4`) so installed phones drop the old cache. Add any new asset files to the `CORE` list in `sw.js`.

Because the data tables are inlined in `index.html`, edits to calibration or hydrostatic data are single-line edits to the huge `SHIP` line. Use targeted scripted edits (e.g. a Python script that parses and rewrites the JSON) rather than the Edit tool on that line.
