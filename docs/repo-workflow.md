# Repo Workflow

This doc covers the repository-wide rules that apply before you get into any single visualization.

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
- runtime asset paths matter twice when the homepage imports source directly

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
- `visualizations/atom/`: molecular visualization scene

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

## Styling And Editing Conventions

Preserve the style of the file or package you are touching.

Current style split:

- root and Monolith code use semicolons and a more explicit imperative style
- Matrix and Atom code mostly omit semicolons and use a looser React/hooks style

Rules of thumb:

- do not do formatting-only rewrites across package boundaries
- do not normalize every file to one style
- make the smallest coherent diff that solves the problem

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
- Forgetting to mirror Monolith assets into root `public/`
- Running `visualizations/monolith/deploy.sh` and accidentally replacing the homepage shell
- Losing submodule work because only the root repo status was checked
- Making formatting-only changes across packages with different style conventions
- Uploading `.DS_Store` files during deploy

## When In Doubt

Default assumptions that are usually safest here:

- the root app is the product that matters most
- Monolith asset additions usually need to exist in both public trees
- build verification is more important than stylistic cleanup
- submodule status matters just as much as root status
- minimal diffs are better than broad refactors unless the user explicitly asks for architectural work
