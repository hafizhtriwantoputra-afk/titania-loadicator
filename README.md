# Titania Loadicator

Loading condition calculator for **MT TITANIA** (IMO 9987469): drafts and trim (CAMEL method), GM, IS Code 2008 intact stability and weather criterion, SF/BM, propeller immersion, bridge visibility, trim-corrected cargo soundings and PDF report. It also builds the loading plan (Initial, Seq 1-3, Final with draft, SF and BM per stage) and exports it to PDF and to the user's own Excel template.

> Planning aid only. The approved CAMEL loading computer remains the official reference.

## Publish on GitHub Pages
1. Create a repository and upload all files in this folder (including `.nojekyll`).
2. Settings → Pages → Build and deployment → Source: *Deploy from a branch* → Branch: `main` / `(root)` → Save.
3. Open `https://<username>.github.io/<repository>/` on the phone once while online.
4. Add to Home Screen (Chrome: menu → *Add to Home screen*; Safari: Share → *Add to Home Screen*). It then works offline.

## Updating
Replace `index.html` and change the cache name in `sw.js` (e.g. `titania-lc-v3-1`) so phones fetch the new version.

## Privacy
Crew names, signatures and the Excel template stay on the phone (browser storage). They are never part of this repository. Use *Export crew* / *Import crew* in the Info tab to move them between devices, and keep that file private.

## Data sources
CAMEL Stored Data Rev.A (BV), Test Loading Conditions Rev.A (BV), Loading Manual OM-GFW52118-050-002JS, Bonjean's Table OM-GFW52118-100-005, SGS cargo tank calibration tables COWONB2401371-02 Rev.0.
