# AGENTS.md

This file is a working guide for humans and coding agents operating in this repository.

It is intentionally opinionated and specific to the current shape of the project. Read it before making structural, asset, deploy, or submodule changes.

## Purpose

This repository is the current homepage app for `s8njee.com`.

The root app is a Vite + React shell that switches between three visualizations:

- `Monolith`
- `Matrix`
- `Atom`

The important architectural detail is that the root app does not embed published builds from those visualizations. It imports their source code directly from the `visualizations/*` directories.

That means:

- editing submodule source changes the root build immediately
- standalone submodule builds are not the same thing as the root build
- runtime asset paths matter twice: once for the standalone visualization, and once for the root site

## Repo Map

Root app:

- `src/App.jsx`: root scene switcher and overlay
- `src/main.jsx`: root React entrypoint
- `src/style.css`: root UI styles
- `public/`: runtime assets served by the root site
- `deploy.sh`: root production deploy script
- `vite.config.js`: root build config and manual chunking

Visualization submodules:

- `visualizations/monolith/`: large Three.js / React Three Fiber character showcase
- `visualizations/matrix/`: Matrix rain scene, TypeScript
- `visualizations/atom/`: molecular visualization scene, large single-file React Three Fiber app

Submodule reminder:

- these are real Git submodules, not just folders
- `.gitmodules` is present at the repo root
- each visualization directory has its own `.git`

## Canonical Architecture

The root app is the canonical production entrypoint right now.

`src/App.jsx` currently imports:

- `../visualizations/monolith/src/MonolithCanvas.jsx`
- `../visualizations/matrix/src/text-rain/App.tsx`
- `../visualizations/atom/src/App.jsx`

Implications:

- the root site compiles submodule source directly
- if a change only builds inside a submodule but breaks the root build, it is not done
- if a submodule uses runtime assets, the root site still needs access to those assets through the root `public/` tree

## Git And Submodule Rules

The three visualization folders are tracked as submodules:

- `visualizations/atom`
- `visualizations/matrix`
- `visualizations/monolith`

Practical rules:

- always check `git status` at the root before editing
- if you touch a submodule, also check `git -C visualizations/<name> status`
- before running `git commit`, re-evaluate whether `README.md` and `AGENTS.md` should be updated to reflect any workflow, architecture, hotkey, asset, or verification changes introduced by the diff
- a root commit does not contain the submodule file diff itself; it only records the submodule pointer
- if the user wants commits, submodule edits may require:
  - a commit inside the submodule
  - then a root commit updating the gitlink
- never assume submodule changes are safe to rewrite; they may contain unpushed or user-owned work

If the user only wants a local change and does not ask for commits, it is fine to leave submodules dirty.

## Local Development Commands

Root app:

```bash
npm install
npm run dev
npm run build
npm run preview
```

Monolith:

```bash
cd visualizations/monolith
npm install
npm run dev
npm run build
npm run preview
```

Matrix:

```bash
cd visualizations/matrix
npm install
npm run dev
npm run build
npm run lint
npm run preview
```

Atom:

```bash
cd visualizations/atom
npm install
npm run dev
npm run build
npm run preview
```

## Verification Expectations

There is no real automated test suite checked into this repo right now.

Notes:

- `playwright` exists as a dependency in some packages, but there are no committed Playwright tests or config files at the root
- Matrix has lint configured; the others do not
- the main safety check is a production build

Expected verification flow:

- if you change root code or any imported visualization source, run root `npm run build`
- if you change a submodule and it is meant to remain runnable standalone, also run that submodule's own build
- if you change Matrix TypeScript, run both `npm run build` and `npm run lint` inside `visualizations/matrix`

Large bundle warnings from Vite are currently normal in this repo and are not by themselves a release blocker.

## Deployment Matrix

Root deploy:

- script: `./deploy.sh`
- target: `s3://s8njee.com/`
- CloudFront distribution: `E1AQDGH3QM4XK1`
- effect: deploys the full root `dist/` site

Monolith deploy:

- script: `visualizations/monolith/deploy.sh`
- target: also writes to `s3://s8njee.com/`
- effect: uploads a standalone monolith shell to the same homepage bucket

Important warning:

- the standalone monolith deploy can overwrite the homepage shell
- do not run it unless the user explicitly wants to deploy the standalone monolith experience as the main site

Matrix deploy:

- script: `visualizations/matrix/deploy.sh`
- target bucket: `rain.s8njee.com`
- separate CloudFront distribution from the root app

Atom deploy:

- there is no deploy script checked in for `visualizations/atom`
- do not invent a deployment path unless the user asks for one

All deploy scripts assume AWS CLI credentials and config are already available in the environment.

## Asset Management Rules

This repo contains a large amount of binary content:

- `.glb`
- `.hdr`
- `.png`
- `.jpg`
- `.svg`
- `.mp3`
- fonts
- Draco decoder assets

### Root vs submodule public assets

This is the most important asset rule in the repo:

- the root site serves assets from root `public/`
- the standalone monolith app serves assets from `visualizations/monolith/public/`

Because the root app imports monolith source directly, monolith code running inside the root app still expects the assets to exist at runtime.

So when adding a new monolith asset that must work in both places:

- add it to `public/...`
- also add it to `visualizations/monolith/public/...`

If you only add the file in the submodule's `public/`, the standalone monolith app may work while the root site fails.

### Asset path conventions

Monolith runtime asset resolution goes through:

- `visualizations/monolith/src/monolith/asset-url.js`

Use `resolveAssetUrl(...)` for new monolith asset references rather than building paths ad hoc.

### Asset hygiene

There are stray `.DS_Store` files in the repository, including under `public/`.

This matters because the current deploy flow has already shown that nested `.DS_Store` files can get uploaded.

Before deploys involving asset tree changes:

- check for `.DS_Store` files with `find . -name '.DS_Store'`
- remove them if the user wants a clean deploy

Do not hand-edit `dist/`.

`dist/` is build output and should be regenerated, not manually maintained.

## Styling And Editing Conventions

Preserve the style of the file or package you are touching.

Current style split:

- root and monolith code use semicolons and a more explicit imperative style
- matrix and atom code mostly omit semicolons and use a looser React/hooks style

Rules of thumb:

- do not do formatting-only rewrites across package boundaries
- do not normalize every file to one style
- make the smallest coherent diff that solves the problem

## Root App Notes

Key files:

- `src/App.jsx`
- `src/style.css`

Behavior:

- `ArrowUp` and `ArrowDown` switch scenes
- the `+` button toggles the lower-left overlay
- the root overlay is the only navigation UI for switching between Monolith, Matrix, and Atom

When editing the root app:

- keep scene-switcher changes isolated to `src/App.jsx` when possible
- keep root styles in `src/style.css`
- remember that visualizations are loaded from submodule source, not prebuilt bundles

## Special Effects Map

Start with `docs/special-effects.md` if a task mentions post-processing, x-ray, hotkeys, shader passes, chromatic aberration, or "special effects."

Current ownership split:

- `src/shared/special-effects/index.ts`: barrel export for the shared effect API
- `src/shared/special-effects/shared-special-effects.ts`: shared hotkeys and state transitions
- `src/shared/special-effects/SharedEffectStack.tsx`: shared React composer used by Matrix and Atom
- `src/shared/special-effects/react-postprocessing-effects.ts`: custom `Effect` classes for Matrix and Atom
- `src/shared/special-effects/postprocessing-shaders.ts`: shared `ShaderPass` factories used by Monolith, including crosshatch and god rays
- `visualizations/monolith/src/monolith/postprocessing.js`: Monolith-only composer orchestration

Important rule:

- do not reimplement chromatic-aberration/x-ray state coupling inside a visualization if `shared-special-effects.ts` already models it
- if a new effect should exist in both Matrix and Atom, start in `src/shared/special-effects/` before adding scene-specific glue

## Monolith Notes

Monolith is the most complex visualization in the repo.

Primary files:

- `visualizations/monolith/src/MonolithCanvas.jsx`
- `visualizations/monolith/src/monolith/set-defs.js`
- `visualizations/monolith/src/monolith/lighting.js`
- `visualizations/monolith/src/monolith/materials.js`
- `visualizations/monolith/src/monolith/overlays.js`
- `visualizations/monolith/src/monolith/postprocessing.js`
- `visualizations/monolith/src/monolith/ui.js`
- `visualizations/monolith/src/monolith/gui.js`

What each module owns:

- `MonolithCanvas.jsx`: orchestration, loaders, state machine, hotkeys, render loop
- `set-defs.js`: model lists, hidden sets, lighting defaults, per-set overrides
- `lighting.js`: animated scene lighting and particle lighting rigs
- `materials.js`: transform normalization, material overrides, x-ray shader behavior
- `overlays.js`: Troika text and DOM/image overlays
- `postprocessing.js`: EffectComposer pipeline and isolated render passes
- `ui.js`: DOM buttons and labels rendered over the canvas
- `gui.js`: lil-gui mirror of runtime controls

Current interaction surface:

- `ArrowLeft` / `ArrowRight`: cycle models in the active set
- `Tab`: cycle model sets
- number keys: select models within the current set
- hidden set hotkeys currently include `7`, `8`, and `0`
- `g`: toggle GUI
- `z`: databend / glitch-style FX toggle
- `x`: x-ray toggle
- `c`: chromatic aberration toggle
- `v`: hue cycle toggle
- `b`: tilt shift toggle
- `6`: white mode toggle

Monolith-specific cautions:

- `scene.background` is touched in multiple places, including postprocessing passes
- `scene.environment` and background changes should be done carefully
- model appearance changes are usually better placed in `materials.js` or `lighting.js` than jammed into the render loop
- new models usually belong in `set-defs.js`, not hardcoded directly in `MonolithCanvas.jsx`
- when adding UI controls, keep `ui.js`, `gui.js`, and the actual behavior in sync

### Recipe: "add x.glb in setY"

If a user asks for something like:

- "add `foo.glb` in `set3`"
- "put `bar.glb` into `set8`"
- "add this model to set 2 in monolith"

Treat that as a Monolith asset + `SET_DEFS` change.

Default interpretation:

- the model should become selectable inside the existing Monolith set
- the asset should be available in both the root app and the standalone Monolith app
- the new model should be appended to that set unless the user asks for a specific order

Follow this exact workflow:

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

Example:

If the user says "add `rei.glb` in `set3`", add files at:

- `public/set3/rei.glb`
- `visualizations/monolith/public/set3/rei.glb`

Then append something like this to the `set3` model list:

```js
{ key: '8', name: 'Rei', path: '/set3/rei.glb' }
```

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

Standalone monolith config note:

- `visualizations/monolith/vite.config.js` builds with base `/s8njee/`
- this is different from the root app's base behavior
- do not assume standalone monolith routing/asset behavior matches the root site

## Matrix Notes

Matrix is TypeScript and has the clearest "active implementation" note in its own docs.

Key files:

- `visualizations/matrix/src/main.tsx`
- `visualizations/matrix/src/text-rain/App.tsx`
- `visualizations/matrix/src/text-rain/MatrixEffects.tsx`
- `visualizations/matrix/src/text-rain/matrix-effects-config.ts`
- `visualizations/matrix/src/text-rain/MatrixRain.tsx`
- `visualizations/matrix/src/text-rain/MonolithPixelGlitchEffect.ts`

Important detail:

- `visualizations/matrix/src/main.tsx` currently imports `./text-rain/App`
- the active scene is the `text-rain` implementation, not the older top-level `src/App.tsx`

Current hotkeys:

- `g`: toggle the effects GUI
- `4`: toggle cinematic mode
- `z`: toggle databend mode
- `x`: toggle x-ray mode
- `c`: toggle chromatic aberration
- `v`: toggle hue cycle
- `b`: toggle pixel mosaic
- `n`: toggle thermal vision
- `[`: reduce active rain columns
- `]`: increase active rain columns

Matrix-specific cautions:

- this scene is performance-sensitive
- the `text-rain` implementation creates many text objects / instances
- avoid unnecessary React state churn in per-frame behavior
- preserve TypeScript types when editing
- `MonolithPixelGlitchEffect.ts` is currently not wired into the active scene, so changes there may have no visible effect

Deployment note:

- Matrix has its own deploy target and should not be treated as the root homepage deploy

## Atom Notes

Atom is much more monolithic than Monolith.

Key files:

- `visualizations/atom/src/App.jsx`
- `visualizations/atom/src/atom/scene.jsx`
- `visualizations/atom/src/atom/core.jsx`
- `visualizations/atom/src/atom/gui.jsx`
- `visualizations/atom/src/styles.css`

Important detail:

- `visualizations/atom/src/App.jsx` is now mostly the app shell and shared-effect state owner
- scene composition lives in `visualizations/atom/src/atom/scene.jsx`
- x-ray shader mutation lives in `visualizations/atom/src/atom/core.jsx`

Current hotkeys include:

- `g`: toggle the GUI
- `4`: toggle cinematic mode
- `z`: toggle databend mode
- `c`: chromatic aberration toggle
- `v`: hue cycle toggle
- `b`: pixel mosaic toggle
- `n`: thermal vision toggle
- `x`: x-ray toggle

Atom-specific cautions:

- prefer surgical edits over broad refactors
- behavior is split across `App.jsx`, `atom/scene.jsx`, `atom/core.jsx`, and `atom/gui.jsx`, so keep those in sync when changing effect behavior
- x-ray behavior is partly material-level and partly post-processing-level; check both layers before assuming a bug is in only one place

Standalone config note:

- `visualizations/atom/vite.config.js` uses `base: '/atom/'`

## Safe Change Strategy

When working in this repo, use this checklist:

1. Decide whether the change belongs in root, a submodule, or both.
2. Check root git status.
3. If touching a submodule, check that submodule's git status too.
4. If the change involves runtime assets, verify which `public/` tree must contain them.
5. Make the smallest targeted change.
6. Run the root build if any imported visualization source changed.
7. Run the standalone build too if that visualization must still work independently.
8. Before deploy, check for stray `.DS_Store` files in asset trees.
9. Only run the deploy script that matches the user's actual target.

## Common Traps

- Thinking a submodule build is enough for the root site
- Forgetting to mirror monolith assets into root `public/`
- Running `visualizations/monolith/deploy.sh` and accidentally replacing the homepage shell
- Losing submodule work because only the root repo status was checked
- Making formatting-only changes across packages with different style conventions
- Uploading `.DS_Store` files during deploy

## When In Doubt

Default assumptions that are usually safest here:

- the root app is the product that matters most
- monolith asset additions usually need to exist in both public trees
- build verification is more important than stylistic cleanup
- submodule status matters just as much as root status
- minimal diffs are better than broad refactors unless the user explicitly asks for architectural work
