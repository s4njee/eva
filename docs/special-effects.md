# Special Effects Architecture

This repo has two effect systems:

- a shared cross-scene layer used by Matrix and Atom
- a Monolith-specific composer pipeline that reuses some shared shader factories but still owns its own render orchestration

If you are new to the code, start here before editing post-processing, x-ray, hotkeys, or shader-driven color treatments.

## Start Here

Shared entrypoints:

- `src/shared/special-effects/index.ts`
- `src/shared/special-effects/shared-special-effects.ts`
- `src/shared/special-effects/SharedEffectStack.tsx`

Scene-specific entrypoints:

- `visualizations/monolith/src/MonolithCanvas.jsx`
- `visualizations/monolith/src/monolith/postprocessing.js`
- `visualizations/matrix/src/text-rain/App.tsx`
- `visualizations/matrix/src/text-rain/MatrixEffects.tsx`
- `visualizations/atom/src/App.jsx`
- `visualizations/atom/src/atom/scene.jsx`

## Shared Effect Layer

The shared layer exists so Matrix and Atom do not have to reimplement the same state machine and effect stack.

### File map

- `index.ts`
  - barrel export for the shared effect API
  - use this as the default import surface when wiring new shared effect code
- `shared-special-effects.ts`
  - shared hotkey mapping
  - state transitions for chromatic aberration vs x-ray
  - hue-cycle state helpers
- `SharedEffectStack.tsx`
  - declarative React composer used by Matrix and Atom
  - turns booleans and numeric settings into actual post-processing passes
- `react-postprocessing-effects.ts`
  - custom `postprocessing` `Effect` subclasses used by `SharedEffectStack`
  - this is the right place for a new Matrix-and-Atom effect built on `@react-three/postprocessing`
- `postprocessing-shaders.ts`
  - shader factories for `three` `ShaderPass`
  - currently shared with Monolith's custom composer

### Shared hotkeys

These keys are defined in `shared-special-effects.ts` and are meant to behave the same way across scenes that opt into them:

- `4`: toggle cinematic mode
- `z`: toggle databend mode
- `x`: toggle x-ray mode
- `c`: toggle chromatic aberration
- `v`: toggle hue cycle
- `b`: toggle pixel mosaic
- `n`: toggle thermal vision

Important state rule:

- x-ray and chromatic aberration are intentionally coupled
- enabling x-ray disables chromatic aberration
- disabling x-ray restores chromatic aberration only if it was active before x-ray took over

Do not reimplement that logic ad hoc inside a scene. Reuse the helpers in `shared-special-effects.ts`.

## Monolith

Monolith keeps a custom post-processing pipeline because it needs more than a simple declarative stack.

### Main files

- `visualizations/monolith/src/MonolithCanvas.jsx`
  - owns hotkeys, GUI sync, runtime flags, and render-loop integration
- `visualizations/monolith/src/monolith/postprocessing.js`
  - builds the `EffectComposer`
  - owns pass enablement, animated uniforms, glitch lifetime, resize handling, and isolated render targets
- `visualizations/monolith/src/monolith/gui.js`
  - mirrors the runtime effect controls in lil-gui
- `visualizations/monolith/src/monolith/materials.js`
  - owns material mutation and the mesh-level x-ray shader work
- `src/shared/special-effects/postprocessing-shaders.ts`
  - shared shader factories used by Monolith's custom composer
  - includes fullscreen passes such as crosshatch and god rays

### Why Monolith is different

Matrix and Atom can stack effects directly on the scene output.

Monolith cannot, because some effects need extra render targets:

- crosshatch needs isolated model and mask textures
- god rays need an isolated occlusion/emissive render and screen-space light position
- glitch is a timed burst, not a simple on/off pass

That is why Monolith still owns `createPostProcessing(...)` instead of using `SharedEffectStack`.

### If you are adding a Monolith-only effect

1. Decide whether it is a plain fullscreen pass or needs isolated renders.
2. Add the shader factory in `src/shared/special-effects/postprocessing-shaders.ts` unless there is a strong reason to keep the shader definition inline.
3. Keep Monolith-only orchestration such as isolated render targets and pass ordering inside `visualizations/monolith/src/monolith/postprocessing.js`.
4. Keep `gui.js`, `MonolithCanvas.jsx`, and any UI labels in sync if the effect is user-toggleable.

## Matrix

Matrix now uses the shared effect layer for most post-processing.

### Main files

- `visualizations/matrix/src/text-rain/App.tsx`
  - owns shared special-effect state and hotkeys
- `visualizations/matrix/src/text-rain/MatrixEffects.tsx`
  - owns lil-gui controls
  - maps Matrix settings plus shared state into `SharedEffectStack`
- `visualizations/matrix/src/text-rain/matrix-effects-config.ts`
  - defaults for Matrix-specific tuning values
- `visualizations/matrix/src/text-rain/MatrixRain.tsx`
  - owns the rain renderer and the `[` / `]` active-column hotkeys

### Legacy file worth knowing about

- `visualizations/matrix/src/text-rain/MonolithPixelGlitchEffect.ts`
  - custom effect class
  - currently not wired into the active `text-rain/App.tsx` scene
  - check usage before assuming changes here affect production

## Atom

Atom now splits effect orchestration from the scene shell, even though most of the actual scene behavior still lives in the `atom/` folder.

### Main files

- `visualizations/atom/src/App.jsx`
  - owns shared special-effect state and hotkeys
- `visualizations/atom/src/atom/scene.jsx`
  - composes two effect paths:
    - `AtomXrayController` for mesh/material mutation
    - `SharedEffectStack` for post-processing
- `visualizations/atom/src/atom/core.jsx`
  - owns the x-ray material controller and shader injection
- `visualizations/atom/src/atom/gui.jsx`
  - mirrors effect settings in lil-gui

## Common Edit Recipes

### Add a shared Matrix-and-Atom effect

1. Add the implementation in `src/shared/special-effects/react-postprocessing-effects.ts` if it is a custom `Effect`, or in `src/shared/special-effects/postprocessing-shaders.ts` if it belongs in a `ShaderPass`.
2. Thread new props through `src/shared/special-effects/SharedEffectStack.tsx`.
3. Add defaults/config where needed:
   - `visualizations/matrix/src/text-rain/matrix-effects-config.ts`
   - `visualizations/atom/src/atom/config.js`
4. Expose controls in scene-specific GUI files if the effect should be tweakable.
5. Update this doc and `AGENTS.md` if the effect changes hotkeys or ownership expectations.

### Add a shared hotkey

1. Update the hotkey map in `src/shared/special-effects/shared-special-effects.ts`.
2. Add the corresponding handler in each scene that opts into `createSharedEffectHotkeyListener(...)`.
3. Document the key in:
   - `docs/special-effects.md`
   - `AGENTS.md`
   - any local README that lists scene hotkeys

### Debug an effect that works standalone but not in the homepage

1. Confirm whether the scene is imported directly into the root app.
2. Run the root build, not just the submodule build.
3. For Monolith assets, verify the asset exists in both `public/` trees.
4. If the issue is a post-processing shader, check whether the effect is coming from the shared layer or the Monolith-only pipeline.

## Verification

When you touch effect code, the safest verification pass is:

```bash
npm run build
npm --prefix visualizations/monolith run build
npm --prefix visualizations/matrix run build
npm --prefix visualizations/matrix run lint
npm --prefix visualizations/atom run build
```
