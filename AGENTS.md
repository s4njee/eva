# AGENTS.md

This file is the short entrypoint for humans and coding agents working in this repository.

Read this first, then open only the linked docs that match the task. The goal is to keep the top-level guidance cheap to rehydrate while preserving the repo-specific rules that matter most.

## Core Rules

- The root app is the canonical production entrypoint for `s8njee.com`.
- The root app imports source directly from `visualizations/monolith`, `visualizations/matrix`, and `visualizations/atom`. A submodule build alone is not enough if the root build breaks.
- Always check `git status` at the repo root before editing. If you touch a submodule, also check `git -C visualizations/<name> status`.
- If you change root code or any imported visualization source, run the root build: `npm run build`.
- If you change Matrix TypeScript, run both `npm run build` and `npm run lint` in `visualizations/matrix`.
- Monolith assets that must work in both the homepage and standalone Monolith need to exist in both:
  - `public/...`
  - `visualizations/monolith/public/...`
- Do not run `visualizations/monolith/deploy.sh` unless the user explicitly wants the standalone Monolith shell to replace the homepage shell.
- Preserve the style of the package you touch:
  - root and Monolith use semicolons and a more explicit imperative style
  - Matrix and Atom mostly omit semicolons and use a looser hooks style
- Make the smallest coherent diff that solves the problem. Do not do formatting-only rewrites across package boundaries.

## Task Routing

Open the smallest doc that matches the task:

- [docs/repo-workflow.md](docs/repo-workflow.md)
  - architecture, submodules, commands, verification, editing conventions, safe change checklist
- [docs/assets-and-deploy.md](docs/assets-and-deploy.md)
  - asset mirroring rules, deploy targets, `.DS_Store` hygiene, `dist/` handling
- [docs/root-app.md](docs/root-app.md)
  - scene switcher, overlay, root-only UI behavior
- [docs/monolith.md](docs/monolith.md)
  - Monolith ownership map, hotkeys, cautions, model-add recipe
- [docs/matrix.md](docs/matrix.md)
  - active `text-rain` implementation, hotkeys, TypeScript/lint expectations
- [docs/atom.md](docs/atom.md)
  - Atom scene split, hotkeys, cautions
- [docs/special-effects.md](docs/special-effects.md)
  - shared effects architecture, hotkeys, post-processing ownership

## Fast Mental Model

- `src/App.jsx` is the homepage shell and scene switcher.
- `src/App.jsx` currently imports:
  - `../visualizations/monolith/src/MonolithCanvas.jsx`
  - `../visualizations/matrix/src/text-rain/App.tsx`
  - `../visualizations/atom/src/App.jsx`
- Runtime asset paths matter twice for Monolith:
  - standalone Monolith serves from `visualizations/monolith/public/`
  - the homepage serves from root `public/`

## Quick Verification Defaults

- Root app or imported visualization source changed: `npm run build`
- Monolith changed and should remain runnable standalone: `npm --prefix visualizations/monolith run build`
- Matrix changed:
  - `npm --prefix visualizations/matrix run build`
  - `npm --prefix visualizations/matrix run lint`
- Atom changed and should remain runnable standalone: `npm --prefix visualizations/atom run build`

Large Vite bundle warnings are currently normal in this repo and are not by themselves a release blocker.

## Common Traps

- Assuming a submodule build proves the homepage still works
- Adding a Monolith asset in only one `public/` tree
- Running the standalone Monolith deploy and unintentionally replacing the homepage shell
- Checking only root git status and missing dirty submodule work
- Hand-editing `dist/` instead of rebuilding

## Documentation Rule

If a change introduces or changes workflow, architecture, hotkeys, asset behavior, verification steps, or deployment behavior, update the relevant doc above along with this router if the routing itself changed.
