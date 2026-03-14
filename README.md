# s8njee

This repo is the current homepage app for `s8njee.com`.

It is a Vite + React project built around React Three Fiber. The root site is a scene switcher that swaps between three WebGL experiences:

- `Monolith`
- `Matrix`
- `Atom`

The important architectural detail is that the root app imports source code directly from the visualization submodules instead of embedding their built output. That makes the root app the canonical production build.

## How It Is Built

The root app lives in `src/` and renders the active scene from `src/App.jsx`.

- The root app uses React for UI and scene switching.
- Each visualization renders through its own React Three Fiber `<Canvas>` setup.
- `Monolith` is imported directly from `visualizations/monolith/src/MonolithCanvas.jsx`.
- `Matrix` is imported from `visualizations/matrix/src/text-rain/App.tsx`.
- `Atom` is imported from `visualizations/atom/src/App.jsx`.

Implications:

- A root build must succeed for a change to be considered done.
- A submodule build only proves that the standalone version works.
- Monolith runtime assets may need to exist in both the root `public/` folder and `visualizations/monolith/public/` because the root app imports Monolith source directly.

## Repo Layout

- `src/`: root app entrypoint, scene switcher, and root UI styles.
- `visualizations/monolith/`: standalone Monolith package and source.
- `visualizations/matrix/`: standalone Matrix package and source.
- `visualizations/atom/`: standalone Atom package and source.
- `public/`: root runtime assets.
- `deploy.sh`: root production deploy script.

## Install Dependencies

Install only the root app:

```bash
npm install
```

Install all submodule packages from the repo root:

```bash
npm run install:submodules
```

Install root and all submodules in one shot:

```bash
npm run install:all
```

## Run Dev Servers From The Repo Root

Parent homepage app:

```bash
npm run dev:root
```

Monolith standalone:

```bash
npm run dev:monolith
```

Matrix standalone:

```bash
npm run dev:matrix
```

Atom standalone:

```bash
npm run dev:atom
```

The default `npm run dev` command is the same as `npm run dev:root`.

## Run Dev Servers Inside Each Package

Root app:

```bash
npm run dev
```

Monolith:

```bash
cd visualizations/monolith
npm run dev
```

Matrix:

```bash
cd visualizations/matrix
npm run dev
```

Atom:

```bash
cd visualizations/atom
npm run dev
```

Use the root dev server when you want to test the actual homepage experience with scene switching. Use a submodule dev server when you want to work on a single visualization in isolation.

## Build Commands

Build the parent homepage app:

```bash
npm run build:root
```

Build Monolith:

```bash
npm run build:monolith
```

Build Matrix:

```bash
npm run build:matrix
```

Build Atom:

```bash
npm run build:atom
```

Build everything:

```bash
npm run build:all
```

Run the main verification pass from the repo root:

```bash
npm run check
```

That runs:

- root build
- Monolith standalone build
- Matrix standalone build
- Matrix lint
- Atom standalone build

## Preview Commands

From the repo root you can preview any built package:

```bash
npm run preview:root
npm run preview:monolith
npm run preview:matrix
npm run preview:atom
```

## Runtime Notes

Monolith is the most asset-sensitive package in the repo.

- Use `resolveAssetUrl(...)` for Monolith runtime asset references.
- If you add a Monolith asset that must work in both the root app and standalone Monolith, mirror it into both `public/` trees.

Matrix uses the `src/text-rain/` implementation as its active scene. The older top-level `src/App.tsx` and `src/MatrixRain.tsx` files are not the root-imported experience.

Atom is a React Three Fiber scene with a large molecule catalog. The app shell is now small, while scene helpers and molecule definitions live under `visualizations/atom/src/atom/`.

## Deployment

Root homepage deploy:

```bash
./deploy.sh
```

Monolith standalone deploy:

```bash
visualizations/monolith/deploy.sh
```

Important: that Monolith deploy writes to the homepage bucket and can replace the main site shell. Only run it if you intentionally want the standalone Monolith experience to become the homepage.

Matrix deploy:

```bash
visualizations/matrix/deploy.sh
```

Atom currently does not have a checked-in deploy script.

## Recommended Workflow

1. Run `npm run dev:root` when working on the homepage experience.
2. Run a submodule dev server when you want a faster standalone loop for one visualization.
3. If you change root code or imported visualization source, run `npm run build:root`.
4. If you change a visualization and want its standalone package to stay healthy too, run that submodule build as well.
5. Use `npm run check` before shipping cross-package changes.
