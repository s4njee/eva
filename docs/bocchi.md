# Bocchi

The **Bocchi** scene is the `bocchi` submodule: a vanilla **Three.js** showcase that renders a GLB
character (`bocchi.glb`) lit by orbiting colored spotlights, over a cursor-reactive, twinkling starfield
with an UnrealBloom + RGB-shift post pipeline. The `visualizations/bocchi` submodule tracks
`git@github.com:s4njee/bocchi.git`.

Like Atom (atom2), bocchi is **not** React, so a thin root-side wrapper bridges it into the eva shell.

## Key Files

- `src/bocchi/BocchiCanvas.jsx` — **root-side React wrapper** that `src/App.jsx` lazy-imports for the
  Bocchi scene. Renders a `<div className="bocchi-app" ref>` and calls `start(container)` on mount /
  the returned teardown on unmount. `src/bocchi/BocchiCanvas.css` sizes the host element.
- `visualizations/bocchi/src/scene.js` — the whole scene as `export function start(container)`, returning
  a teardown that cancels the RAF loop, removes the `window` listeners (`pointermove`/`pointerleave`/
  `keydown`/`resize`), destroys the lil-gui, and disposes the renderer / composers / controls / PMREM.
- `visualizations/bocchi/src/main.js` — thin standalone entry: `start(document.getElementById('app'))`.

## Assets (must exist in both public trees)

bocchi loads assets by absolute path, so the homepage build needs them in the **root** `public/` tree
*and* the standalone build needs them in the **submodule** `public/` tree (same trap as Monolith):

- `public/bocchi.glb` — the model (also in `visualizations/bocchi/public/bocchi.glb`).
- `public/textures/*.png` — star sprites listed in `STAR_TEXTURES` (`circle_02`, `flare_01`, `star_04`,
  `spark_01`, `twirl_01`, … ). These already exist in the root `public/textures/` particle set.
- The DRACO decoder is loaded from the gstatic CDN at runtime (no local asset needed).

If you change which textures bocchi uses, make sure the new names exist under both `public/textures/`
trees.

## Hotkeys

- `ArrowLeft` / `ArrowRight` — cycle the star sprite texture.
- `ArrowUp` / `ArrowDown` are **owned by the eva shell** for switching scenes; bocchi does not bind them,
  so there is no conflict.
- A lil-gui "Render Controls" panel (Model Exposure) exists but is hidden by default.

## Integration / Cautions

- The wrapper passes its ref'd element to `start()`; bocchi appends its `<canvas>` there. It does **not**
  rely on `id="app"` (that id is the eva React mount).
- bocchi sizes off `window.innerWidth/innerHeight` (the scene is full-viewport in the shell). It resolves
  `three` + `three/examples/jsm/*` (incl. the bundled lil-gui) from the **root** node_modules (three 0.183).
- Teardown is essential — the scene switcher mounts/unmounts scenes. Verified: switching away and back
  leaves exactly one `<canvas>` (no RAF/listener/GL-context leak). If you add new global listeners,
  timers, or GPU resources to `scene.js`, extend the teardown it returns.

## Standalone

```bash
npm --prefix visualizations/bocchi run dev      # vite dev (uses visualizations/bocchi/index.html)
npm --prefix visualizations/bocchi run build    # standalone build
```

A passing standalone build does **not** prove the homepage build is fine — always run the root
`npm run build` after touching bocchi source.
