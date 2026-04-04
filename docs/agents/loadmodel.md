# Extract `loadModel` into `monolith/model-loader.js`

> Implementation plan for code review item 2a

## Goal

Move the ~200-line model loading pipeline out of `MonolithScene` (the 825-line
React component in `MonolithCanvas.jsx`) into a standalone module
`monolith/model-loader.js`. The component keeps a thin `loadModel()` wrapper
that delegates to the new module.

## Why

- **MonolithScene is too large.** At 825 lines, scanning through lighting mode
  toggles, set switching, hotkeys, and model loading in one function is slow.
- **The load pipeline is self-contained.** It reads a few refs, does async work,
  and writes back to refs. It has no dependency on React rendering — it could be
  a plain function.
- **Testability.** A function that accepts an explicit context object can be
  unit tested without mounting a Canvas. Currently it's untestable.
- **Timeout cleanup.** The pending `setTimeout` IDs (ToDo.md #8) need a
  centralised tracker. A module-level `Set<number>` in the loader is the natural
  place for it.

## Current loadModel responsibilities

All of these currently live in `MonolithCanvas.jsx` L288–492:

| Responsibility | Lines | Reads | Writes |
|---|---|---|---|
| **Progress bar DOM** (`showLoadError`, `resetLoadProgress`, `hideLoadProgress`, `updateLoadProgress`) | 294–343 | `progressRef` | `progressRef` DOM nodes |
| **Streaming reader** (`readModelArrayBuffer`) | 345–383 | — | calls `updateLoadProgress` |
| **Cache check + session cache** | 397–418 | `modelCacheRef`, `stateRef` | `modelCacheRef` |
| **Network fetch + GLTF parse** | 421–491 | `loaderRef`, `stateRef` | `modelCacheRef` |
| **Material application** | 400–405, 459–467 | `materialManagerRef`, `stateRef` | model meshes |
| **Model swap into scene** | calls `swapModel` | `monolithRef`, `mixerRef`, `uiRef` | scene graph |
| **Overlay visibility** | calls `overlaysRef.current.updateTextVisibility` | `overlaysRef` | overlay meshes |
| **Canvas opacity fade** | 390, 482, 489 | `gl.domElement` | DOM style |
| **Effect snapshot sync** | 389 | — | calls `syncEffectSnapshot` |
| **Reveal / lighting mode** | calls `revealScene` | `stateRef` | scene state |

## Design

### New file: `visualizations/monolith/src/monolith/model-loader.js`

```
                         MonolithCanvas.jsx
                               │
                    loadModel(index, opts)
                               │
                    ┌───────────▼───────────────┐
                    │    model-loader.js         │
                    │                           │
                    │  executeModelLoad(ctx)     │  ← pure async function
                    │  createLoadProgressUI(ref) │  ← progress bar helpers
                    │  readModelArrayBuffer(…)   │  ← stream reader
                    │  pendingTimeouts: Set      │  ← timeout tracker
                    │  clearPendingTimeouts()    │  ← cleanup hook
                    └───────────────────────────┘
```

### Context object

`executeModelLoad` receives a single `ctx` object assembled by the caller:

```js
/**
 * @typedef {Object} ModelLoadContext
 * @property {number} index — model index within the current set
 * @property {boolean} showProgressIfUncached — show load bar for network fetches
 * @property {Object} entry — { key, name, path } from currentModels()[index]
 * @property {Object} def — the full SET_DEFS entry for the current set
 * @property {number} setIndex — stateRef.current.currentSetIndex
 * @property {boolean} xrayMode — stateRef.current.xrayMode
 * @property {string} cacheKey — entry.path
 *
 * @property {Map} modelCache — modelCacheRef.current
 * @property {Object} loader — loaderRef.current (GLTFLoader)
 * @property {Object|null} progress — progressRef.current ({ bar, container })
 * @property {Object|null} materialManager — materialManagerRef.current
 *
 * @property {() => number} getCurrentModelIndex — reads stateRef.current.currentModelIndex
 * @property {(model, name, animations) => void} onSwapModel — swapModel
 * @property {(setIndex, modelIndex) => void} onUpdateOverlays — overlaysRef.current.updateTextVisibility
 * @property {() => void} onRevealScene — revealScene
 * @property {(name) => void} onLoadError — callback for error state
 * @property {HTMLElement} canvasDom — gl.domElement (for opacity fade)
 */
```

### Steps

#### Step 1 — Create `model-loader.js` with progress helpers

Move these four functions verbatim:
- `showLoadError`
- `resetLoadProgress`
- `hideLoadProgress`
- `updateLoadProgress`

Change them from closures over `progressRef.current` to functions that receive
`progress` (the `{ bar, container }` object) as the first argument.

Also move `readModelArrayBuffer`, changing its `updateLoadProgress` call to
accept `progress` via closure in the wrapping function.

Export a `pendingTimeouts` Set and a `clearPendingTimeouts()` function.

**Verification:** `npm run build` at root still passes. No behaviour change.

#### Step 2 — Move `executeModelLoad` 

Create `executeModelLoad(ctx)` as an async function that:

1. Sets `ctx.canvasDom.style.opacity = '0'`
2. Calls `ctx.onUpdateOverlays(ctx.setIndex, -1)` (hide overlays during load)
3. Checks `ctx.modelCache` for a cache hit → applies materials → schedules
   swap via `setTimeout` (tracked in `pendingTimeouts`)
4. On cache miss: calls `cachedFetch`, streams the response if progress is
   tracked, parses via `ctx.loader.parse()`, normalises the model, caches it,
   and schedules the swap
5. Both paths use the stale-index guard (`ctx.getCurrentModelIndex() !== ctx.index`)

All error paths call `ctx.onLoadError(entry.name)` and restore canvas opacity.

**Verification:** `npm run build` at root still passes. Manual test: arrow
through models, switch sets, verify progress bar and overlays still work.

#### Step 3 — Wire `MonolithScene.loadModel` to the new module

Replace the 200-line `loadModel` body with:

```js
const loadModel = async (index, { showProgressIfUncached = false } = {}) => {
  if (!loaderRef.current || index === stateRef.current.currentModelIndex) return;
  stateRef.current.currentModelIndex = index;
  syncEffectSnapshot({ triggerGlitch: true });

  await executeModelLoad({
    index,
    showProgressIfUncached,
    entry: currentModels()[index],
    def: currentSetDef(),
    setIndex: stateRef.current.currentSetIndex,
    xrayMode: stateRef.current.xrayMode,
    cacheKey: currentModels()[index].path,
    modelCache: modelCacheRef.current,
    loader: loaderRef.current,
    progress: progressRef.current,
    materialManager: materialManagerRef.current,
    getCurrentModelIndex: () => stateRef.current.currentModelIndex,
    onSwapModel: swapModel,
    onUpdateOverlays: (si, mi) => overlaysRef.current?.updateTextVisibility(si, mi),
    onRevealScene: revealScene,
    onLoadError: (name) => {
      gl.domElement.style.opacity = '1';
      showLoadError(name, progressRef.current);
    },
    canvasDom: gl.domElement,
  });
};
```

**Verification:** Full root build. Manual regression test.

#### Step 4 — Wire `clearPendingTimeouts` into useEffect cleanup

In the `useEffect` cleanup (L753–766), add:

```js
clearPendingTimeouts();
```

This completes ToDo.md item #8 (track and clear pending setTimeout IDs).

**Verification:** Mount/unmount by switching scenes via the overlay. No console
errors about accessing detached DOM.

#### Step 5 — Remove dead imports

Remove `cachedFetch`, `hasCachedModel` from the `MonolithCanvas.jsx` import
since they'll now be consumed only by `model-loader.js`.

**Verification:** `npm run build`. Confirm no unused-import warnings.

## Files changed

| File | Change |
|---|---|
| `monolith/model-loader.js` | **New** — all load logic, progress UI, timeout tracker |
| `MonolithCanvas.jsx` | **Shrinks** ~200 lines. Thin `loadModel` wrapper. Cleanup calls `clearPendingTimeouts`. |
| `MonolithCanvas.jsx` imports | Drop `cachedFetch`, `hasCachedModel`; add `executeModelLoad`, `clearPendingTimeouts` |

## Out of scope

- **Bounding the model cache** (ToDo.md #6) — separate task, not needed for
  the extraction.
- **Skipping fade for cached loads** (ToDo.md #5) — can be done inside
  `executeModelLoad` after the extraction lands, but is a separate behaviour
  change.
- **Converting to TypeScript** — follow the existing Monolith style (plain JS).

## Rollback

If the extraction introduces a regression, revert the single commit. The old
`loadModel` body is preserved in git history and can be inlined back.
