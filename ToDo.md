# Project Roadmap

> Last reviewed: 2026-04-05

This file consolidates all open work across the root app and each visualization. Performance items,
roadmap items, and fresh ideas are grouped by scope. Cross-cutting items should be completed before
scene-specific work that depends on them.

---

## Cross-Cutting (Shared Infrastructure)

These affect all scenes and should be done first.

### 1. FPS monitor and adaptive quality hook *(done)*

`FrameRateMonitor.tsx` — rolling EMA, published every 400 ms. `useFrameRate()` exposes a shared
binary quality tier: `high` (≥ 30 fps) / `low` (< 30 fps). Adaptive DPR and effect-stack switching
are implemented but threshold switching is disabled pending real low-end hardware validation.

### 2. DPR reduction at runtime *(implemented; needs low-end hardware validation)*

`SafeCanvas` derives an adaptive DPR ladder from each scene's existing `dpr` prop and drives
`<Canvas dpr={...}>` reactively. 3-second sustain window before stepping down or back up.

### 3. Automatic post-processing tier selection *(implemented; needs low-end hardware validation)*

`SharedEffectStack` unmounts the full `EffectComposer` on low tier and falls back to direct
scene rendering.

### 4. `failIfMajorPerformanceCaveat` probe leg *(not started)*

Add a probe leg in `SafeCanvas.probeRendererOptions()` that queries with
`failIfMajorPerformanceCaveat: true` first. If it fails, immediately drop to "Low" quality tier
without waiting for FPS data to accumulate.

### 5. Keyboard shortcut reference overlay *(not started)*

Highest-visibility, lowest-risk UX gap. Build once in the shared effects stack so Monolith, Matrix,
and Atom can all use it.

---

## Monolith

### Suggested Next Order

1. **Persist last-used set/model in `localStorage`** — small surface area, immediate benefit on
   repeat visits. Store `{ setIndex, modelIndex }` under a single key.
2. **Smarter model transitions — skip fade for cached loads** — cached switches still wait the
   200 ms `setTimeout` fade (L297–302 `MonolithCanvas.jsx`). Track whether the load came from cache;
   if so, call `swapModel()` + `revealScene()` synchronously on the next `requestAnimationFrame`.
3. **Clean up pending `setTimeout` lifecycles** — two fire-and-forget `window.setTimeout` calls in
   `loadModel` (L289, L339). Collect IDs in a `ref` array, clear them in the `useEffect` cleanup
   (L592–604).
4. **Bound the session model cache** — `modelCacheRef` is an unbounded `Map`. Cap at ~6–10 entries.
   On eviction call `geometry.dispose()` / `material.dispose()` on every mesh, then `remove()` from
   scene if not currently displayed.

### Remaining Work — P1

- Make overlays fully data-driven from `SET_DEFS` (move text visibility rules out of hardcoded
  set/model checks in `updateTextVisibility`)
- Replace `materialOverrides[].match(...)` predicates with declarative criteria objects
  (e.g., `{ nameContains: "glass", meshIndex: [2, 3] }`) so overrides are pure data
- Improve model-load failure UX: retry button, clearer recovery path
- Move UI styling away from inline `cssText` toward a component/style system

### Remaining Work — P2

- Decompose `MonolithScene` (~540 lines) into focused hooks: `useModelLoader()`,
  `useHotkeyHandler()`, `useLightingMode()`
- Scope effect snapshot updates so they don't re-render the full scene subtree
- Move particle animation further toward GPU-driven behavior

### Performance (low-end hardware)

- **Tiered particle count:** drop from 5000 → 1000 on low-tier devices. `particleCount` is already
  a constant in `lighting.js` — make it a function of GPU tier.
- **Reduce glow light count:** 6 dynamic `PointLight`s are expensive. On low tier, drop to 2–3 or
  replace with a single ambient approximation.
- **Skip color/light updates more aggressively:** currently every 4 frames; push to 8–12 on low-end,
  or freeze when frame budget is tight.
- **Level of Detail (LOD):** ship 2–3 decimated GLB variants per model, swap via `THREE.LOD` based
  on GPU tier or camera distance.
- **Half-resolution effect passes:** run bloom and chromatic aberration at half canvas resolution on
  low-tier devices.
- **KTX2 / Basis compressed textures:** DRACO compresses geometry but textures are still
  uncompressed. KTX2 reduces VRAM usage and upload time significantly.
- **Cap texture anisotropy on low-end:** `applyModelTextureFiltering` currently sets to
  `getMaxAnisotropy()`. Cap at 4× or 2× on low-tier devices.
- **Lighting mode default for low-end:** default to lighting mode A (Scene, static rig) on first
  visit for detected low-end hardware, even for sets that prefer mode B (Particles).
- **Lazy-load post-processing:** import the effect composer and passes only when first activated.

### Fresh Ideas

- URL deep links: open directly to a specific set, model, lighting mode, or effect preset
- Per-model metadata cards: subtitle, franchise, notes, artist/source callouts from `SET_DEFS`
- Set intro cards: short transitional text when entering a hidden or themed set
- Music memory: persist BGM on/off state via `localStorage`
- Photo mode: hide UI chrome, export a clean high-resolution still
- Camera bookmarks: front, low-angle, orbit-ready, and poster-composition presets
- Small diagnostics overlay: current set, model, lighting mode, cache size, approximate FPS
- Asset validation script: check mirrored public paths, missing files, duplicate keys in `SET_DEFS`

---

## Matrix

### Suggested Next Order

1. **Keyboard shortcut overlay** — deferred; revisit with a redesign for a production-ready version.
2. **Adaptive active-column scaling** — add rolling frame-time–based column reduction.
3. **Shrink the maximum backing buffer** — `MAX_INSTANCES = 8,000 × 150 = 1,200,000`. Replace the
   compile-time cap with a device-aware default. Immediately reduce `DEFAULT_ACTIVE_COLUMNS` from
   2000 to 800 on devices that fail the `failIfMajorPerformanceCaveat` probe.
4. **Centralize simulation constants** — extract `COLUMN_COUNT`, `ROWS`, `DEFAULT_ACTIVE_COLUMNS`,
   `MIN_ACTIVE_COLUMNS`, `ACTIVE_COLUMN_STEP`, `ROW_SPACING`, `BASE_Y`, and `CELL_PX` into a
   `SimulationConfig` interface + `createSimulationConfig(deviceClass)` factory in a new
   `simulation-config.ts`. `MatrixRain` receives the config as a prop.
5. **Move atlas construction off the critical path** — `buildAtlas()` runs synchronously in a
   `useMemo` during initial render. Move it into a `useEffect` after first paint, or into a Web
   Worker using `OffscreenCanvas`. Show zero active instances while the atlas loads.

### Remaining Work — P1

- Replace raw trail color literals with named palette constants
- Add adaptive active-column scaling based on rolling frame time

### Remaining Work — P2

- Automatic hardware-aware render-mode switching (canvas fallback vs. instanced 3D)
- URL-driven render mode or preset selection
- Dynamic DPR or cross-display quality adaptation when displays change

### Fresh Ideas

- Camera preset buttons: default, close, wide, shallow-angle views
- Screenshot mode: hide GUI, export a clean still at a larger render size
- Shareable URL presets: encode rain density, palette, bloom, and camera mode
- Glyph set packs: classic kana, alphanumeric-only, custom symbols, user-provided glyph strings
- CRT preset bundles: phosphor green, amber terminal, cold blue, monochrome
- Depth layering presets: curated compositions using different fog, spacing, and camera ranges
- Lightweight benchmark readout: FPS and active column count in a hidden debug overlay
- Device class presets: desktop, laptop, and integrated-GPU starting profiles
- Small test harness for simulation invariants: column reset behavior, active count, typed-array bounds

---

## Atom

### Suggested Next Order

1. **In-scene molecule name/formula label** — use `<Html>` from drei (already imported in
   `helpers.jsx`). Low risk, visible immediately.
2. **Migrate remaining legacy molecule wrappers to `PresetMolecule`** — 3 remaining without JSON
   data files: **Buckminsterfullerene, Ethylene, Oxygen**. Extract atom/bond definitions into
   `.json` under `molecules/data/`, then delete the JSX wrappers and update `index.jsx` /
   `visualizations.jsx`.
3. **Bond hover/select tooltip data** — builds naturally on the existing atom-selection system in
   `AtomInstances`.
4. **Measurement mode for distances and angles** — high educational value, uses same selection
   primitives.
5. **Smooth molecule transitions** — when switching presets or search results.

### Remaining Work — P1

- Build true ball-and-stick rendering (extend `useAtomRenderMode` to drive atom scale from van der
  Waals vs. fixed radius)
- Build true space-filling rendering from van der Waals radii
- Build a lightweight wireframe / stick renderer for larger compounds
- Add algorithmic bond inference for raw coordinate inputs (needed for SDF/XYZ imports)
- Add lone pair visual overlays for common atoms (O, N)
- Add partial-charge color mode using electronegativity heuristics
- Unify the `core.jsx` nucleus material cache with the `AtomInstances` batch materials

### Remaining Work — P2

- Add excitation and relaxation interactions with photon-emission visuals
- Add volumetric or instanced-point orbital cloud rendering
- Add reaction animation support with atom mapping between reactants and products
- Normalize imported structures to Ångström-scale coordinates

### Performance (low-end hardware)

- **Bond shader draw call count** — batch same-type bonds into a single instanced draw call per
  bond type per molecule. Pass bond parameters as instance attributes instead of per-component
  uniforms. Larger molecules (Atropine: 22 bonds, Empagliflozin: 40+ bonds) generate 20–50+ draw
  calls per frame.
- **PubChem molecule complexity guard** — after schema compilation in `pubchem.js`, check atom count
  against a configurable `MAX_ATOMS` constant (suggested: 150). Surface a clear error rather than
  attempting to render an oversized molecule.
- **Reduce cinematic bond lights on low-end** — in `AtomScene.jsx`, conditionally set
  `bondLightIntensityScale: 0` when the device is in Low quality tier, even in cinematic mode.

### Fresh Ideas

- Guided molecule tour mode: step through notable atoms, bonds, rings, and functional groups
- Functional-group highlighting: detect rings, hydroxyls, amines, carbonyls, aromatics
- Compare mode: two molecules side by side with synchronized camera controls
- Screenshot / poster mode: high-resolution still export with clean labels
- Import local `.mol`, `.sdf`, or `.xyz` files through the browser
- Small molecule metadata panel: formula, PubChem CID, atom count, bond count, ring count, mass
- Functional-group-specific glow accents instead of only element-based coloring
- Camera bookmark presets: top, side, ring-normal, and detail views
- Environment-light presets matched to chemistry themes: clinical, neon lab, amber spectroscopy

---

## Notes

- All cross-cutting items (1–5) should be done before scene-specific items that depend on them.
- The `failIfMajorPerformanceCaveat` probe (item 4) is the cheapest way to detect low-end hardware
  before any frame is rendered.
- Do not aggressively strip effects on medium-tier hardware — DPR reduction is the best single knob.
- Test on actual low-end hardware, not just Chrome DevTools CPU throttle. Throttle simulates CPU
  load, not VRAM pressure or GPU fill rate limits.
