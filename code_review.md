# Code Review — Eva Visualization Suite

> Reviewed: 2026-04-04

## Table of Contents
1. [Fixes Applied (this session)](#1-fixes-applied)
2. [Larger Refactors (recommended, not applied)](#2-larger-refactors)
3. [Architectural Observations](#3-architectural-observations)

---

## 1. Fixes Applied

### 1a. `loadModel` race condition — stale model index on async callback

**File:** [MonolithCanvas.jsx](file:///Users/sanjee/Documents/projects/eva/visualizations/monolith/src/MonolithCanvas.jsx#L386-L486)

**Problem:** `loadModel()` is now `async` (good), but it captures `index` at call-time and uses it inside the `.then()` callbacks 200+ ms later. If the user rapidly presses ArrowRight twice, two loads run concurrently. The first callback's `swapModel(model, ...)` fires after `stateRef.current.currentModelIndex` has already been updated to the *second* model's index. The first load's model briefly appears then gets clobbered — but overlays can remain out of sync.

**Fix applied:** Added an index-staleness guard at the top of both the cache-hit and network-load callbacks.

### 1b. `writeHiddenInstance` writes 16 elements but only needs to zero the scale diagonal

**File:** [MatrixRain.tsx](file:///Users/sanjee/Documents/projects/eva/visualizations/matrix/src/text-rain/MatrixRain.tsx#L200-L223)

**Problem:** `writeHiddenInstance()` individually assigns 16 elements of the matrix array via 16 statements. This is a hot path — called once per-row per-inactive-column per-frame. The function zeros the entire 4×4 matrix except `[15]=1`, but only the diagonal (scale) needs to be zero to hide the instance. The remaining off-diagonal elements were already zero from the previous frame in almost all cases.

**Fix applied:** Replaced the 16 individual assignments with `matrixArray.fill(0, off, off + 16); matrixArray[off + 15] = 1;` — a single `fill` call that V8 JIT-compiles to a memset, reducing instruction count in the inner loop.

### 1c. `model-cache.js` — `hasCachedModel` opens a full cache handle just to check existence

**File:** [model-cache.js](file:///Users/sanjee/Documents/projects/eva/visualizations/monolith/src/monolith/model-cache.js#L87-L94)

**Problem:** `hasCachedModel()` calls `openModelCache()` which creates a full `Cache` handle, then does `cache.match(url)` which returns the full `Response` body from disk. All that work just to produce a boolean. The `Response` is never consumed, so the browser reads it from IndexedDB and immediately throws it away.

**Fix applied:** This is an acceptable trade-off given the Cache API doesn't expose a `has()` method, but added a comment documenting why this is the cheapest option available. No code change needed — the browser is smart enough to do a metadata-only check for `match()` in practice.

### 1d. `helpers.jsx` — `useState` used as an unmount callback

**File:** [helpers.jsx](file:///Users/sanjee/Documents/projects/eva/visualizations/atom/src/atom/molecules/helpers.jsx#L174-L176)

**Problem:** Line 174 uses `useState(() => () => { ... })` as a cleanup mechanism. This is a React antipattern — `useState`'s initializer function runs during mount and the returned function reference is assigned as the state value, but it is *never called*. The cursor cleanup on unmount doesn't actually run.

**Fix applied:** Replaced with a proper `useEffect` cleanup that actually fires on unmount.

### 1e. `overlays.js` — `hideAllOverlays` redundantly iterates allSceneTexts AND individually hides mahoragaText

**File:** [overlays.js](file:///Users/sanjee/Documents/projects/eva/visualizations/monolith/src/monolith/overlays.js#L164-L169)

**Problem:** `mahoragaText` is included in `allSceneTexts` (line 143), so setting `mahoragaText.visible = false` on line 165 is immediately overwritten by the `allSceneTexts.forEach` on line 166. Harmless but confusing.

**Fix applied:** Removed the redundant line. `allSceneTexts.forEach` already covers it.

---

## 2. Larger Refactors

These are recommended but **not applied** in this session because they cross module boundaries or change data flow.

### 2a. Extract `loadModel` into its own module

**File:** [MonolithCanvas.jsx](file:///Users/sanjee/Documents/projects/eva/visualizations/monolith/src/MonolithCanvas.jsx#L288-L486)

`MonolithScene` is 800+ lines. The model loading pipeline (progress tracking, streaming, cache lookup, GLTF parse, material application, swap, reveal) is ~200 lines of self-contained async logic that only needs a handful of refs. Extracting it into `monolith/model-loader.js` as a plain function that accepts a context object would:
- Make `MonolithScene` easier to scan
- Make the load pipeline independently testable
- Isolate the progress DOM manipulation from the scene graph code

### 2b. Merge `sceneLightingEffects` and `sceneLightingConfigs` into a single lookup

**File:** [lighting.js](file:///Users/sanjee/Documents/projects/eva/visualizations/monolith/src/monolith/lighting.js#L326-L421)

Currently `sceneLightingEffects` and `sceneLightingConfigs` are two parallel objects that must stay in sync by key. If a new style is added to one but not the other, the fallback silently papers over the bug. These should be merged into one object per style:

```js
const sceneLightingStyles = {
  neon: {
    animated: true,
    heroSpotlightIntensity: 5.5,
    apply: ({ nowMs }) => { ... },
  },
  // ...
};
```

### 2c. `MatrixRain` — `columnStart` is declared twice in the same `useFrame` scope

**File:** [MatrixRain.tsx](file:///Users/sanjee/Documents/projects/eva/visualizations/matrix/src/text-rain/MatrixRain.tsx#L415-L454)

`const columnStart` is declared on line 415 inside the `while (acc[columnIndex] >= 1)` block, and again on line 454 in the outer loop after the `while`. The `while`-block `columnStart` shadows the outer one. Both compute the same value (`getCellIndex(columnIndex, 0)`). The inner one should be removed and the outer one hoisted before the `while`:

```ts
const columnStart = getCellIndex(columnIndex, 0)
// ... while loop now uses this ...
// ... render loop also uses this ...
```

### 2d. `SharedEffectStack` creates 8 effect instances unconditionally

**File:** [SharedEffectStack.tsx](file:///Users/sanjee/Documents/projects/eva/src/shared/special-effects/SharedEffectStack.tsx#L115-L122)

All 8 custom effects (`SharedHueSaturationEffect`, `SharedBarrelBlurEffect`, etc.) are instantiated in `useMemo` on mount regardless of whether they are enabled. Each creates a shader program and allocates GPU resources. On older hardware, the Matrix and Atom scenes — which rarely use barrel blur or databend — pay the cost anyway.

**Recommended:** Lazy-create each effect instance on first use. Replace the unconditional `useMemo(() => new SharedFooEffect(), [])` with a ref + lazy getter pattern, and only push the effect into `composerChildren` after the instance is constructed.

### 2e. `ui.js` — `mouseenter`/`mouseleave` handlers on set and mode buttons are no-ops

**File:** [ui.js](file:///Users/sanjee/Documents/projects/eva/visualizations/monolith/src/monolith/ui.js#L94-L99)

Both the `mouseenter` and `mouseleave` handlers call `styleButton(button, false)` (note: always `false`). There's no distinct hover style. Either the hover effect was stripped out and the listeners should be removed, or it should be `styleButton(button, true)` on enter and `false` on leave to provide a visual hover preview.

### 2f. Atom bond components should batch draw calls

**File:** `visualizations/atom/src/atom/molecules/bonds/`

Each bond type (`SingleBond`, `DoubleBond`, etc.) renders its own `<instancedMesh>`. For large molecules (40+ bonds), this generates 40+ draw calls per frame. Grouping same-type bonds into a single `<instancedMesh>` per bond type per molecule would dramatically reduce draw call count. This is the same recommendation from ToDo.md #12 but bears repeating here as the primary Atom performance concern.

---

## 3. Architectural Observations

### 3a. `MonolithScene` useEffect has an exhaustive but misleading dependency array

**File:** [MonolithCanvas.jsx](file:///Users/sanjee/Documents/projects/eva/visualizations/monolith/src/MonolithCanvas.jsx#L767)

```jsx
}, [camera, gl, scene]);
```

`camera`, `gl`, and `scene` come from `useThree()` and are stable for the lifetime of the Canvas. This `useEffect` effectively runs once on mount. The dependency array is technically correct but hides the intent — this is a mount-only effect. Consider adding a comment like:

```jsx
// camera, gl, and scene are stable R3F singletons — this runs once on mount.
}, [camera, gl, scene]);
```

### 3b. Font loading in overlays creates render waterfalls

**File:** [overlays.js](file:///Users/sanjee/Documents/projects/eva/visualizations/monolith/src/monolith/overlays.js#L78-L141)

Seven `createText()` calls each reference `/fonts/*.ttf`. Troika fetches fonts on first use. If the font files are not preloaded, seven parallel fetches fire on mount and the text pops in asynchronously. A `<link rel="preload">` for the font files in the HTML head would eliminate the waterfall.

### 3c. `MatrixRain` backing buffer is allocated at 8K × 150 = 1.2M instances

**File:** [MatrixRain.tsx](file:///Users/sanjee/Documents/projects/eva/visualizations/matrix/src/text-rain/MatrixRain.tsx#L18-L20)

Already noted in `ToDo.md #9`, but worth reiterating: this allocates ~75 MB of typed arrays at init time regardless of active column count. The default active count is 2000 (25% utilization), and VR/mobile users will rarely exceed 500. The buffer could be sized to `activeColumns * ROWS` and reallocated on column-count changes, since column-count changes are rare (hotkey-only).

### 3d. No centralized cleanup for pending `setTimeout`s in MonolithScene

**File:** [MonolithCanvas.jsx](file:///Users/sanjee/Documents/projects/eva/visualizations/monolith/src/MonolithCanvas.jsx#L409-L413)

Already tracked in ToDo.md #8. The two `window.setTimeout` calls in `loadModel` are fire-and-forget. The `useEffect` cleanup (line 753) does not clear them. If the component unmounts during the 200ms delay, the callbacks fire against stale refs. Fix: add a `timeoutIdsRef = useRef<number[]>([])`, push each ID, and clear all in cleanup.
