# Matrix

Matrix is TypeScript and the clearest "active implementation" note lives in the `text-rain` path.

## Key Files

- `visualizations/matrix/src/main.tsx`
- `visualizations/matrix/src/text-rain/App.tsx`
- `visualizations/matrix/src/text-rain/MatrixEffects.tsx`
- `visualizations/matrix/src/text-rain/matrix-effects-config.ts`
- `visualizations/matrix/src/text-rain/MatrixRain.tsx`
- `visualizations/matrix/src/text-rain/MonolithPixelGlitchEffect.ts`

## Active Implementation

Important detail:

- `visualizations/matrix/src/main.tsx` currently imports `./text-rain/App`
- the active scene is the `text-rain` implementation, not the older top-level `src/App.tsx`
- the active `text-rain` path now simulates rain state in flat typed arrays and feeds a single atlas-backed instanced mesh
- only the active column prefix is drawn and uploaded each frame; inactive columns stay outside the current draw/upload range

Check usage before changing older top-level files and assuming they affect production.

## Current Hotkeys

- `g`: toggle the effects GUI
- `4`: toggle cinematic mode
- `z`: toggle databend mode
- `x`: toggle x-ray mode
- `c`: toggle chromatic aberration
- `v`: toggle hue cycle
- `b`: toggle pixel mosaic
- `n`: toggle thermal vision
- `ArrowLeft`: reduce active rain columns
- `ArrowRight`: increase active rain columns

## Matrix-Specific Cautions

- this scene is performance-sensitive
- the `text-rain` implementation is tuned around typed arrays, active-slice buffer updates, and in-place column resets; preserve those patterns when editing the simulation
- avoid unnecessary React state churn in per-frame behavior
- the canvas DPR is capped at `1.5` to keep the instanced scene smoother on Retina displays
- `MatrixEffects.tsx` uses a mutable params mirror so lil-gui can stay mounted while React state changes
- preserve TypeScript types when editing
- `MonolithPixelGlitchEffect.ts` is currently not wired into the active scene, so changes there may have no visible effect

For post-processing and shared effect rules, start with [docs/special-effects.md](special-effects.md).

## Verification

If you change Matrix TypeScript:

```bash
cd visualizations/matrix
npm run build
npm run lint
```

If the root app imports the code you changed, also run the root build.

## Deployment Note

- Matrix has its own deploy target and should not be treated as the root homepage deploy
- `visualizations/matrix/vite.config.ts` now dedupes React plus the R3F stack so the standalone dev server avoids hook-mismatch crashes when it imports shared repo code
