# Atom

Atom is more monolithic than Monolith, but the app shell and scene composition have been split more cleanly than before.

## Key Files

- `visualizations/atom/src/App.jsx`
- `visualizations/atom/src/atom/scene.jsx`
- `visualizations/atom/src/atom/core.jsx`
- `visualizations/atom/src/atom/gui.jsx`
- `visualizations/atom/src/atom/molecules/helpers.jsx`
- `visualizations/atom/src/styles.css`

## Current Structure

Important detail:

- `visualizations/atom/src/App.jsx` is now mostly the app shell and shared-effect state owner
- scene composition lives in `visualizations/atom/src/atom/scene.jsx`
- x-ray shader mutation lives in `visualizations/atom/src/atom/core.jsx`

## Current Hotkeys

- `g`: toggle the GUI
- `4`: toggle cinematic mode
- `z`: toggle databend mode
- `c`: chromatic aberration toggle
- `v`: hue cycle toggle
- `b`: pixel mosaic toggle
- `n`: thermal vision toggle
- `x`: x-ray toggle

## Atom-Specific Cautions

- prefer surgical edits over broad refactors
- behavior is split across `App.jsx`, `atom/scene.jsx`, `atom/core.jsx`, and `atom/gui.jsx`, so keep those in sync when changing effect behavior
- shared atom instancing and the lower-allocation trail buffers live in `atom/molecules/helpers.jsx` and `atom/core.jsx`
- x-ray behavior is partly material-level and partly post-processing-level; check both layers before assuming a bug is in only one place

For post-processing and shared effect rules, start with [docs/special-effects.md](special-effects.md).

## Standalone Config Note

- `visualizations/atom/vite.config.js` uses `/` for local Vite dev, `'/atom/'` for production builds, and dedupes React plus the R3F stack so the root-shared effect code does not trip hook mismatches
