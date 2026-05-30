# Planes

The **Planes** scene is the `visualizations/planes` submodule (`git@github.com:s4njee/3js-planes.git`):
a geospatial flight visualization that renders **Cesium Ion terrain** with aircraft flying over it. It
is both a switcher scene and the standalone `/planes` route (both import the submodule's `src/App.jsx`).

This replaced an older stale *vendored* copy (`src/planes/`, aircraft-only, no terrain) that has been
removed.

## Architecture (`visualizations/planes/src/App.jsx`)

A multi-layer composition — the Planes scene therefore has **~3 canvases**, not one:
- `TilesBackgroundCanvas.jsx` — **Cesium Ion 3D-tiles terrain** via `3d-tiles-renderer` +
  `CesiumIonAuthPlugin` (asset 2275207), plus `@takram/three-atmosphere` / `@takram/three-clouds`.
- `MonolithCanvas.jsx` — the aircraft R3F scene (reuses the `/set3/Meshy_AI_*.glb` models), overlaid
  full-screen with `pointer-events:none`.
- `Minimap.jsx` — a `maplibre-gl` minimap (OpenStreetMap raster tiles; no API key). Cleans itself up
  with `map.remove()` on unmount.
- `CitySearch.jsx` + `FpsCounter` overlays.

## Access & controls (click-only scene)

Planes binds **ArrowUp/ArrowDown to fly the aircraft** (see `MonolithCanvas.jsx` and
`TilesBackgroundCanvas.jsx`), which collides with the shell's keyboard scene switching. So in
`src/App.jsx` the Planes `SCENES` entry is flagged **`clickOnly: true`**:
- It is **excluded from the ArrowUp/ArrowDown scene cycle** (`ARROW_SCENE_INDEXES`) — arrows cycle only
  Monolith/Matrix/Atom/Bocchi and never land on Planes.
- While Planes is active, the shell's keydown handler **ignores arrows** (no switch, no `preventDefault`)
  so the scene's own fly controls work.
- Reach Planes by **clicking its overlay tab**; leave it the same way.

To make any other scene click-only, add `clickOnly: true` to its `SCENES` entry — no other change needed.

## Required: Cesium Ion token (secret)

Terrain auth needs **`VITE_CESIUM_ION_TOKEN`** (read in `TilesBackgroundCanvas.jsx`,
`monolith/globe-tiles.js`, `monolith/CesiumTilesBackground.jsx`). Without it, terrain fails to load.

- **Local:** set it in `eva/.env.local` (already created; `*.local` is gitignored so the secret is
  never committed). Vite loads `.env.local` automatically.
- **Production (Cloudflare Pages):** the same `VITE_CESIUM_ION_TOKEN` must be set in the Pages project's
  build environment variables — **the deploy renders no terrain until this is done.**

## Root build wiring (already in place)

- `package.json`: deps `3d-tiles-renderer`, `@takram/three-atmosphere|clouds|geospatial|geospatial-effects`,
  `maplibre-gl`; `three` bumped to `^0.184.0` and `@react-three/fiber` to `^9.6.0` to match v2.
  (`postprocessing@6.39` warns about a `three < 0.184` peer range — harmless in practice; all R3F scenes
  verified rendering on 0.184.)
- `vite.config.js`: `define.__ASSET_VERSION__` (required by `monolith/asset-url.js`), a `/opensky-api`
  dev proxy (live flights), and `optimizeDeps.include` for the takram/3d-tiles libs.

## Live flights (OpenSky)

`monolith/opensky.js` polls `/opensky-api` in dev (proxied to `opensky-network.org/api`) and
`opensky-network.org/api` directly in prod. Best-effort — prod calls may be CORS-blocked; the scene
still renders without live flights.

## ⚠️ Submodule pin / deploy note

The submodule is pinned at the v2 commit **`2309611`** (reachable from `origin/main`; there is no `v2`
branch on the remote). On top of that commit, this repo carries **uncommitted working-tree edits**
overlaid from the local `projects/planes` v2 working copy (`src/MonolithCanvas.jsx`,
`src/TilesBackgroundCanvas.jsx`, `src/monolith/lighting.js`; the `… 2.jsx`/`… 2.js` sync-conflict dupes
removed).

Those overlaid edits exist only in the working tree. A clean `git submodule update --init` (CI /
Cloudflare Pages) checks out `2309611` **without** them. **Before deploy:** commit those edits to
`3js-planes.git` (push a branch/commit) and update the eva gitlink to the pushed commit, or the deploy
will render the pre-overlay version.

## Standalone

```bash
npm --prefix visualizations/planes run dev      # needs its own .env.local token in the submodule
npm --prefix visualizations/planes run build
```

A standalone build does not prove the homepage build — run the root `npm run build` after touching
planes source.
