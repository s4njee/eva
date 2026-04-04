# Performance: Older Hardware

> Created: 2026-04-03

This file tracks performance work focused on making the site usable on older or lower-end
devices — integrated graphics, mobile GPUs, older Mac laptops, and hardware that caps out
around 30 fps on the current default settings. Items are ordered from lowest-effort /
highest-impact to most invasive.

All three visualizations share `SafeCanvas` (WebGL 2 probe + renderer fallback) and
`SharedEffectStack` (the fullscreen post-processing composer). Changes to those shared
modules affect every scene.

---

## Cross-Cutting (Shared Infrastructure)

These affect all three scenes and should be done before scene-specific tuning.

### 1. FPS monitor and adaptive quality hook  *(done)*

`FrameRateMonitor.tsx` — rolling EMA over the last 90 frames, published every 400 ms.
`FrameRateMonitorProvider` / `FrameRateMonitorBridge` are mounted by `SafeCanvas` so
every scene is covered. `useFrameRate()` exposes the snapshot.

Adaptive responses wired up (threshold switching currently disabled — re-enable
per-file when ready to test on real low-end hardware):
- **DPR** (`SafeCanvas` → `AdaptiveDprBridge`): steps `gl.setPixelRatio()` down to
  ≤ 1.5 (medium) or 1 (low), using the canvas's initial DPR as the ceiling.
- **Effects** (`SharedEffectStack`): scanlines off at medium+; bloom off + chromatic
  aberration off at low; bloom radius reduced at medium.
- **Matrix columns** (`MatrixRain`): active-column count capped at 1500 (medium) or
  800 (low) in the frame loop via `qualityTierRef`.

Thresholds: ≥ 50 fps → high, 35–49 → medium, < 35 → low.

### 2. DPR reduction at runtime  *(not started)*

`SafeCanvas` currently passes a static `dpr` prop from each scene's top-level
component. Monolith passes `[1, Math.min(devicePixelRatio, 2)]` (R3F clamped range);
Matrix manually caps at `1.5` in `MatrixRain.tsx`. Neither adjusts at runtime.

On a struggling GPU, reducing DPR from 2 → 1 cuts fill rate by 75% with minimal
visible impact at typical viewing distances.

**What to build:** Wire the FPS monitor into a dynamic DPR value. R3F accepts a
reactive `dpr` prop — passing a lower value mid-session is supported. Start at the
device's natural DPR and step down (e.g., 2 → 1.5 → 1) if FPS stays below threshold
for several seconds. Do not step back up until FPS recovers for an equally long window
(hysteresis prevents thrashing).

### 3. Automatic post-processing tier selection  *(not started)*

`SharedEffectStack` always mounts the full `EffectComposer` even when most effects
are disabled. The composer itself costs a render-target ping-pong even with no
active effects.

**What to build:** A quality-tier system with three levels:

| Tier | Condition | Stack |
|------|-----------|-------|
| High | FPS ≥ 50 and DPR ≥ 1.5 | All effects available |
| Medium | FPS 35–49 or DPR < 1.5 | Bloom off, scanlines off, chromatic off; composer still mounted |
| Low | FPS < 35 | `EffectComposer` unmounted entirely; render direct |

The tier should be readable by any scene. Consider a shared `QualityContext` or a
simple exported signal.

### 4. `failIfMajorPerformanceCaveat` probe leg  *(not started)*

`SafeCanvas.probeRendererOptions()` already tries multiple `WebGLRendererParameters`
candidates (antialias off, powerPreference default, alpha off) but never sets
`failIfMajorPerformanceCaveat: true` to detect software-rendered or severely
throttled contexts.

**What to build:** Add a probe leg that queries the context with
`failIfMajorPerformanceCaveat: true` first. If it fails, that signals a software
renderer or severe GPU caveat — immediately drop to "Low" quality tier without
waiting for FPS data to accumulate.

---

## Monolith

### 5. Smarter model transitions — skip fade for cached loads  *(partially done)*

Cached model switches currently still wait 200 ms in `loadModel()` (L289–293,
`MonolithCanvas.jsx`) before swapping. That delay exists solely to let the canvas
fade out and back in, but on older hardware this adds jank without benefit because
the model was already parsed.

**What to do:** Track whether the load came from the in-memory cache. If cached,
call `swapModel()` + `revealScene()` synchronously on the next `requestAnimationFrame`
instead of after a `setTimeout`. Only network-loaded models need the fade.

### 6. Bound the session model cache  *(not started)*

`modelCacheRef` in `MonolithScene` is an unbounded `Map`. On older hardware with
limited VRAM, accumulating parsed GLTF scenes (geometries + textures still on the
GPU) can push the driver to evict other resources or cause stuttering.

**What to do:** Cap the Map at N entries (suggested: 6). On eviction, call
`geometry.dispose()` and `material.dispose()` on every mesh in the evicted scene,
then `remove()` it from the scene if it is not currently displayed.

### 7. Lighting mode default for low-end devices  *(not started)*

Lighting mode B (Particles) animates a dynamic point light every frame, which
re-triggers shadow/lighting recalculation. Mode A (Scene) uses a static rig that
Three.js can cache between frames.

**What to do:** On first visit, detect low-end hardware (via the `failIfMajorPerformanceCaveat`
probe or the FPS monitor) and default to lighting mode A even for sets that prefer B.

### 8. Track and clear pending `setTimeout` IDs in `loadModel`  *(not started)*

Two `window.setTimeout` calls in `loadModel` (L289, L339, `MonolithCanvas.jsx`) are
fire-and-forget. If the component unmounts during the delay (navigation, tab switch),
the callback fires against a detached scene and causes stale DOM mutations and
potential errors.

**What to do:** Collect timeout IDs in a `ref` array and call `clearTimeout` on each
one inside the `useEffect` cleanup (L592–604). This is a correctness fix with a
secondary perf benefit: eliminated stale renders.

---

## Matrix

### 9. Shrink the maximum backing buffer  *(not started)*

`MAX_INSTANCES = COLUMN_COUNT * ROWS = 8,000 * 150 = 1,200,000`. The backing typed
arrays (`mat: Float32Array(MAX_INSTANCES * 16)`, etc.) are allocated at startup
regardless of how many columns are active. On a 32-bit GPU or a device with a
strict VRAM budget, this allocation alone (~75 MB for the matrix buffer + 4 attribute
arrays) can cause the page to stall or be killed.

**What to do:**
- Replace the compile-time cap with a device-aware default. Query `COLUMN_COUNT`
  from a config object (see item 10 below) and set it at init time based on available
  GPU memory hints or a conservative fallback.
- Immediately reduce `DEFAULT_ACTIVE_COLUMNS` from 2000 to 800 on devices that
  fail the `failIfMajorPerformanceCaveat` probe.

### 10. Centralize simulation constants into one typed config object  *(not started)*

`COLUMN_COUNT`, `ROWS`, `DEFAULT_ACTIVE_COLUMNS`, `MIN_ACTIVE_COLUMNS`,
`ACTIVE_COLUMN_STEP`, `ROW_SPACING`, `BASE_Y`, and `CELL_PX` are bare `const`
declarations scattered at the top of `MatrixRain.tsx`. This makes device-adaptive
overrides impossible without threaded prop drilling.

**What to do:** Extract them into a `SimulationConfig` interface + a
`createSimulationConfig(deviceClass)` factory in a new `simulation-config.ts`
file. `MatrixRain` receives the config as a prop. The parent `App.tsx` constructs
it once using the device-class detection result.

### 11. Move atlas construction off the critical path  *(not started)*

`buildAtlas()` runs synchronously in a `useMemo` during the initial render. It
creates a canvas, draws ~90 large glyphs into it, and uploads a `CanvasTexture` to
the GPU. On a slow device this can block the first frame by 50–150 ms.

**What to do:** Move `buildAtlas()` into a `useEffect` that fires after the first
paint, or into a Web Worker (which would require posting the canvas bitmap back via
`OffscreenCanvas`). While the atlas loads, render with zero active instances and
show the existing loading state.

---

## Atom

### 12. Bond shader draw call count on complex molecules  *(not started)*

Atom uses instanced rendering for atom spheres (`AtomInstances`) but each electron
trail bond is a separate draw call — `SingleBond`, `DoubleBond`, `StructuralBond`,
and `AromaticRingPair` all render individual `instancedMesh` objects per bond.
Larger molecules (Atropine: 22 bonds, Empagliflozin: 40+ bonds) generate 20–50+
draw calls per frame on older hardware.

**What to do:** Batch same-type bonds into a single instanced draw call per bond
type per molecule. Pass bond parameters as instance attributes rather than as
per-component uniforms. This is a larger refactor — track it as a dedicated item
before migrating legacy molecule wrappers.

### 13. PubChem molecule complexity guard  *(not started)*

There is no limit on the size of molecule a user can search via PubChem. Very large
molecules (e.g., proteins or polymers with hundreds of atoms) will instantiate
thousands of `Instance` elements and hundreds of bond components, which will
overwhelm older hardware immediately.

**What to do:** After schema compilation in `pubchem.js`, check atom count against
a configurable `MAX_ATOMS` constant (suggested starting value: 150). If exceeded,
surface a clear error message ("This molecule is too large to render in your browser")
rather than attempting to render it.

### 14. Reduce cinematic bond lights on low-end devices  *(not started)*

Cinematic mode enables `bondLightIntensityScale: 1` in the render mode, which
powers moving point lights near each bond. On older hardware these per-frame light
updates are expensive.

**What to do:** In `AtomScene.jsx`, conditionally set `bondLightIntensityScale: 0`
(effectively disabling the moving bond lights) when the device is in Low or Medium
quality tier, even in cinematic mode.

---

## Notes

- All cross-cutting items (1–4) should be done first. Scene-specific items build on
  top of them.
- The `SafeCanvas` renderer probe (item 4) is the cheapest way to detect low-end
  hardware before any frame is rendered. Prefer it over FPS-based detection where
  possible so the initial experience is already correct.
- Do not aggressively strip effects on medium-tier hardware. Users on a 3-year-old
  laptop still expect a good-looking site. DPR reduction (item 2) is the best
  single knob — it is nearly invisible but cuts GPU load significantly.
- Test on an actual low-end machine, not just Chrome DevTools CPU throttle. Throttle
  simulates CPU load, not VRAM pressure or GPU fill rate limits.
