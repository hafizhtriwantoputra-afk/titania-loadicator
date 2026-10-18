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

Everything lives in the single ~560 KB [index.html](index.html) (no modules, no bundler). Do not read it whole; use `grep -n` / ranged reads. Lines 822 and 823 are enormous (~414 KB and ~9 KB of JSON) and will blow up any full-line output, so cut them (`cut -c1-300`). The file has these parts, in order:

1. **CSS and markup** (top to ~line 483): five tab sections: `t-tanks`, `t-plan`, `t-res`, `t-save`, `t-set`.
2. **Engine** (`<script>` at ~484, an IIFE exposing `LC`): pure calculation with no DOM access. Interpolation helpers, cargo volume correction (`vcf`), per-tank properties from calibration tables (`tankProps`, `trimCorr`), hydrostatic equilibrium (`equilibrium`, `hydAt`), KN cross-curves, `compute(S, cond)` (weights/moments, GM, stability, weather criterion, propeller/visibility) and `strength` (SF/BM from Bonjean data).
3. **MiniPDF** (`<script>` at ~748): a dependency-free multi-page PDF writer (Helvetica/WinAnsi with hardcoded width tables). The report must stay free of external libraries so it works offline.
4. **App script** (`<script>` at ~821): starts with the data constants `SHIP` (ship particulars, load lines, and every tank's calibration table), `EXAMPLES`, and label maps, followed by UI logic: state, `solve`/`update` and render functions, charts (hand-built SVG), `buildPdf`, saved conditions, import/export, and the loading planner (`renderPlan`, `planLoad`, etc.).

### State and data flow

- Global `S` is the current condition, persisted to `localStorage` under `lc_current` (saved conditions under `lc_saved`). `S.v` is the schema version (currently 2); a mismatch resets to `exampleState(0)`. Saved or imported state goes through `loadState` / `importText`.
- `SHIP` is immutable reference data (from CAMEL Stored Data, BV test conditions, Loading Manual, Bonjean table, SGS calibration). Each tank is run through `LC.prep` at startup.
- Typical flow: UI input → mutate `S` → `buildCond` (cargo `vol`/`rho`/temperature → tank volumes via `cargoCalc`) → `solve` → `LC.compute` → `update` → render functions. Rendering is by `innerHTML` string templates, not a framework.
- The planner (`S.plan`, `PLs()`) builds arrival (ROB) and load conditions through `condFor`/`planRob`/`planLoad`, then hands the result back to the Tanks tab.
- Length unit (`S.lenUnit`, cm or mm) is a display/input concern only. Convert with `toCm`/`fromCm`/`fL`; internal values are cm for soundings and metres elsewhere.

## Releasing changes

The service worker ([sw.js](sw.js)) serves the app page network-first and everything else cache-first. When `index.html` or any other cached asset changes, bump the cache name constant `C` in `sw.js` (currently `titania-lc-v3-0`) so installed phones drop the old cache. Add any new asset files to the `CORE` list in `sw.js`.

Because the data tables are inlined in `index.html`, edits to calibration or hydrostatic data are single-line edits to the huge `SHIP` line. Use targeted scripted edits (e.g. a Python script that parses and rewrites the JSON) rather than the Edit tool on that line.
