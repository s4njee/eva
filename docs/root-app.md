# Root App

This doc covers the homepage shell that swaps between Monolith, Matrix, and Atom.

## Key Files

- `src/App.jsx`
- `src/main.jsx`
- `src/style.css`

## Behavior

- `ArrowUp` and `ArrowDown` switch scenes
- the `+` button toggles the lower-left overlay
- the root overlay is the only navigation UI for switching between Monolith, Matrix, and Atom

## Architecture Notes

- the root app is the canonical production entrypoint
- the root app imports visualization source directly instead of embedding published builds
- scene-switcher changes should stay isolated to `src/App.jsx` when possible
- root UI styling should stay in `src/style.css`

## Current Scene Imports

`src/App.jsx` currently imports:

- `../visualizations/monolith/src/MonolithCanvas.jsx`
- `../visualizations/matrix/src/text-rain/App.tsx`
- `../visualizations/atom/src/App.jsx`

If you change any imported visualization source, run the root build.

## Editing Guidance

- keep scene-switcher changes isolated to `src/App.jsx` when possible
- keep root styles in `src/style.css`
- remember that visualizations are loaded from submodule source, not prebuilt bundles
- use [docs/special-effects.md](special-effects.md) if the change touches post-processing, x-ray, hotkeys, shader passes, or chromatic aberration behavior
