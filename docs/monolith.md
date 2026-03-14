# Monolith

Monolith is the most complex visualization in the repo.

## Primary Files

- `visualizations/monolith/src/MonolithCanvas.jsx`
- `visualizations/monolith/src/monolith/set-defs.js`
- `visualizations/monolith/src/monolith/lighting.js`
- `visualizations/monolith/src/monolith/materials.js`
- `visualizations/monolith/src/monolith/overlays.js`
- `visualizations/monolith/src/monolith/ui.js`
- `visualizations/monolith/src/monolith/gui.js`
- `src/shared/special-effects/SharedEffectStack.tsx`

## Ownership Map

- `MonolithCanvas.jsx`: orchestration, loaders, state machine, hotkeys, render loop, and Monolith-to-shared-effect wiring
- `set-defs.js`: model lists, hidden sets, lighting defaults, per-set overrides
- `lighting.js`: animated scene lighting and particle lighting rigs
- `materials.js`: transform normalization, material overrides, x-ray shader behavior
- `overlays.js`: Troika text and DOM/image overlays
- `ui.js`: DOM buttons and labels rendered over the canvas
- `gui.js`: lil-gui mirror of runtime controls
- `SharedEffectStack.tsx`: fullscreen post-processing shared with Matrix and Atom

## Current Interaction Surface

- `ArrowLeft` / `ArrowRight`: cycle models in the active set
- `Tab`: cycle model sets
- number keys: select models within the current set
- hidden set hotkeys currently include `7`, `8`, and `0`
- `g`: toggle GUI
- `4`: cinematic FX toggle
- `z`: databend / glitch-style FX toggle
- `x`: x-ray toggle
- `c`: chromatic aberration toggle
- `v`: hue cycle toggle
- `b`: pixel mosaic toggle
- `n`: thermal vision toggle
- `6`: white mode toggle

## Monolith-Specific Cautions

- `scene.background` is touched in multiple places, including shared-effect-driven scene appearance updates
- `scene.environment` and background changes should be done carefully
- model appearance changes are usually better placed in `materials.js` or `lighting.js` than jammed into the render loop
- new models usually belong in `set-defs.js`, not hardcoded directly in `MonolithCanvas.jsx`
- when adding UI controls, keep `gui.js`, `MonolithCanvas.jsx`, and the actual behavior in sync

For post-processing and shared effect rules, start with [docs/special-effects.md](special-effects.md).

## Recipe: Add `x.glb` In `setY`

Treat a request like "add `foo.glb` in `set3`" as a Monolith asset plus `SET_DEFS` change.

Default interpretation:

- the model should become selectable inside the existing Monolith set
- the asset should be available in both the root app and the standalone Monolith app
- the new model should be appended to that set unless the user asks for a specific order

Follow this workflow:

1. Confirm the target set exists in `visualizations/monolith/src/monolith/set-defs.js`.
2. Place the `.glb` in both:
   - `public/setY/<filename>.glb`
   - `visualizations/monolith/public/setY/<filename>.glb`
3. Add a new model entry to the matching set's `models` array in `visualizations/monolith/src/monolith/set-defs.js`.
4. Use the next available numeric string for `key`.
5. Use a clean human-readable `name` derived from the filename unless the user provided a better display name.
6. Set `path` to the root-style runtime path, for example `'/set3/foo.glb'`.
7. Do not hardcode the model anywhere else unless the user also asked to make it default, hidden, lit differently, or specially transformed.
8. Run the root build.
9. Run the standalone Monolith build if the standalone app should still work too.

Additional rules:

- if the request names a set that does not already exist, stop and confirm before inventing a new set
- if the user gives you a file path outside the repo, copy the file into both public trees rather than referencing the original location directly
- if the model appears with bad scale, rotation, or placement, the next place to look is `materials.js` transform normalization and the per-set overrides in `set-defs.js`
- if the model should be the first/default model shown for that set, update `defaultModel`
- if the model needs different lighting than the rest of its set, add or extend `lightingOverrides`
- if the model needs different material handling, add or extend `materialOverrides`

What not to do:

- do not add the asset only under `visualizations/monolith/public/`
- do not add the asset only under root `public/`
- do not modify `MonolithCanvas.jsx` just to register a normal new model in an existing set
- do not edit `dist/`

## Standalone Monolith Config Note

- `visualizations/monolith/vite.config.js` builds with base `/s8njee/`
- this is different from the root app's base behavior
- do not assume standalone Monolith routing or asset behavior matches the root site
