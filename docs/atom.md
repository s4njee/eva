# Atom

The **Atom** scene is the `atom2` project: a stylized, vanilla **Three.js** PubChem molecule viewer.
The `visualizations/atom` submodule tracks `git@github.com:s4njee/atom2.git` (it previously tracked the
older React / R3F `atom.git` viewer — that is gone from this app).

Unlike Monolith/Matrix, atom2 is **not** React. Its entry is `src/main.js → startApp()` (in
`src/app.js`): it drives the DOM directly via `document.getElementById(...)`, expects a specific HTML
scaffold, and returns a teardown function. The eva shell renders React, so a thin wrapper bridges the two.

## Key Files

- `src/atom/AtomCanvas.jsx` — **root-side React wrapper** that owns the integration. Renders the DOM
  scaffold atom2 expects (mirrors `visualizations/atom/index.html`) and calls `startApp()` on mount /
  the returned teardown on unmount. This is the file `src/App.jsx` lazy-imports for the Atom scene.
- `visualizations/atom/src/app.js` — atom2 entry; `startApp()` wires UI + scene and returns teardown.
- `visualizations/atom/src/scene/viewer.js` — Three.js renderer/scene/controls/composer; `dispose()`.
- `visualizations/atom/src/styles/registry.js` — visual style registry (`STYLE_LIST`).
- `visualizations/atom/src/pubchem/client.js` — PubChem fetch (molecules, properties, similar, search).
- `visualizations/atom/src/styles.css` — atom2 layout + cosmetics, scoped under `.atom2-app`.

## Integration Contract (how atom2 lives in the React shell)

- **Scaffold:** `AtomCanvas.jsx` renders `<div className="atom2-app">` containing the ids atom2 looks up:
  `#search-container`, `#style-container`, `#measurements-container`, `#random-container` (in `#topbar`);
  `#groups-container`, `#sidebar-lists` (in `#sidebar`); `#canvas-container`; `#status`. The wrapper does
  **not** set `id="app"` — that id is the eva React mount.
- **Lifecycle / teardown:** `startApp()` returns a teardown function. The wrapper calls it on unmount so
  the RAF loop, the `window` `keydown`/`resize` listeners, the WebGL context, and molecule meshes are all
  released. Verified: switching scenes away and back leaves exactly one `<canvas>` (no leak).
- **CSS scoping:** atom2's old global `#app { display:grid; … }` rule is now `.atom2-app`, and the body
  cosmetics (background/font/color) were moved onto `.atom2-app`, so embedding does not restyle the eva
  homepage. Only the structural `html, body { margin/height/overflow }` rule stays global (harmless — the
  root already sets those). The standalone `visualizations/atom/index.html` carries `class="atom2-app"` so
  the standalone build keeps its layout.

## Hotkeys

- `[` / `]` — cycle to the previous / next visual style (the style dropdown in the topbar also works).
- `ArrowUp` / `ArrowDown` are **owned by the eva shell** for switching scenes. atom2 deliberately does
  **not** bind them (it used to); the style-cycling keys were remapped to `[` / `]` to avoid the conflict.

## Cautions

- atom2 has **no local assets** — it is procedural geometry + live PubChem network calls. Nothing needs to
  be mirrored into the root `public/` tree.
- atom2 resolves `three` and `three/addons/*` from the **root** node_modules (three 0.183) when imported by
  the homepage. Its environment styles already use the modern `pmrem.fromScene(new RoomEnvironment())` API,
  which is compatible. Watch for three API drift if styles are added that use older signatures.
- Keep the wrapper scaffold ids in sync with the `getElementById` calls in `visualizations/atom/src/app.js`.
- If `startApp()` gains new global listeners/timers/GPU resources, extend the teardown it returns and (if
  needed) `viewer.dispose()` so the scene stays leak-free across mount/unmount.

## Standalone

```bash
npm --prefix visualizations/atom run dev      # vite dev (uses visualizations/atom/index.html)
npm --prefix visualizations/atom run build    # standalone build
npm --prefix visualizations/atom run test     # vitest
```

A passing standalone build does **not** prove the homepage build is fine — always run the root
`npm run build` after touching atom2 source.
