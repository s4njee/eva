# CLAUDE.md

Short entrypoint for humans and coding agents working in this repository. Read this first, then
open only the linked docs that match the task.

---

## Project Structure

```
eva/                          ← root app (s8njee.com homepage)
├── src/
│   ├── App.jsx               ← scene switcher and overlay
│   ├── main.jsx              ← React entrypoint
│   ├── atom/                 ← React wrapper for the vanilla-JS atom2 submodule
│   ├── bocchi/               ← React wrapper for the vanilla-JS bocchi submodule
│   ├── shared/performance/   ← frame-rate monitor, adaptive quality, SafeCanvas
│   └── style.css             ← root UI styles
├── public/                   ← runtime assets for the root site
├── visualizations/
│   ├── monolith/             ← Three.js / R3F character showcase (Git submodule)
│   ├── matrix/               ← Matrix rain scene, TypeScript (Git submodule)
│   ├── atom/                 ← atom2: vanilla Three.js PubChem molecule viewer (Git submodule)
│   ├── bocchi/               ← vanilla Three.js GLB + starfield showcase (Git submodule)
│   └── planes/               ← Cesium-terrain flight viz, R3F (Git submodule; needs VITE_CESIUM_ION_TOKEN)
├── docs/                     ← detailed per-topic documentation
├── .github/workflows/        ← CI/CD (deploy-cloudflare-pages.yml triggers on push to main)
└── ToDo.md                   ← consolidated project roadmap
```

The root app imports submodule source **directly** — it does not consume their build output.
Editing submodule source changes the root build immediately.

---

## Scene Routing

When the user mentions one of these, open the matching doc:

| Topic | Doc | Key file |
|-------|-----|----------|
| **Monolith** | [docs/monolith.md](docs/monolith.md) | `visualizations/monolith/src/MonolithCanvas.jsx` |
| **Matrix** | [docs/matrix.md](docs/matrix.md) | `visualizations/matrix/src/text-rain/App.tsx` |
| **Atom** | [docs/atom.md](docs/atom.md) | `src/atom/AtomCanvas.jsx` (wraps the vanilla-JS `atom2` submodule) |
| **Bocchi** | [docs/bocchi.md](docs/bocchi.md) | `src/bocchi/BocchiCanvas.jsx` (wraps the vanilla-JS `bocchi` submodule) |
| **Planes** | [docs/planes.md](docs/planes.md) | `visualizations/planes/src/App.jsx` (submodule; **Cesium Ion terrain** — needs `VITE_CESIUM_ION_TOKEN`; switcher scene **and** `/planes` route) |
| **Effects / post-processing** | [docs/special-effects.md](docs/special-effects.md) | `src/shared/special-effects/` |
| **Deploy / assets** | [docs/assets-and-deploy.md](docs/assets-and-deploy.md) | `.github/workflows/deploy-s3.yml` |
| **Architecture / submodules** | [docs/repo-workflow.md](docs/repo-workflow.md) | — |

---

## Common Tasks

### Local development

```bash
npm install          # install root deps
npm run dev          # start root dev server
```

> The **Planes** scene needs a Cesium Ion token in `eva/.env.local`
> (`VITE_CESIUM_ION_TOKEN=…`). `*.local` is gitignored, so it is never committed.
> Production (Cloudflare Pages) needs the same var set in the Pages build env.

To run a visualization standalone:

```bash
npm --prefix visualizations/monolith run dev
npm --prefix visualizations/matrix run dev
npm --prefix visualizations/atom run dev
npm --prefix visualizations/bocchi run dev
npm --prefix visualizations/planes run dev
```

### Building

```bash
npm run build                                        # root app (always run this after any change)
npm --prefix visualizations/monolith run build       # standalone Monolith
npm --prefix visualizations/matrix run build         # standalone Matrix
npm --prefix visualizations/matrix run lint          # Matrix TypeScript lint (run alongside build)
npm --prefix visualizations/atom run build           # standalone Atom
npm --prefix visualizations/bocchi run build         # standalone Bocchi
npm --prefix visualizations/planes run build         # standalone Planes
```

Run `npm run build` at the root whenever root code **or** any imported visualization source changes.
A standalone submodule build passing does not mean the root build is fine.

### Matrix visual check

```bash
npm run check:matrix-visible    # from repo root — opens Chromium, verifies green rain glyphs
```

### Deploying

Root site (s8njee.com):

- **Automatic:** push or merge to `main` → GitHub Actions runs `.github/workflows/deploy-cloudflare-pages.yml`
- **Manual fallback:** `./deploy-pages.sh` (requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_PAGES_PROJECT_NAME`)
- **S3 deploy (disabled):** `./deploy.sh` — only via `workflow_dispatch` on `deploy-s3.yml`, not triggered by push

Matrix standalone (rain.s8njee.com):
- `visualizations/matrix/deploy.sh`

> Do not run `visualizations/monolith/deploy.sh` unless the user explicitly wants the standalone
> Monolith shell to replace the homepage. It writes to the same S3 bucket as the root site.

---

## Core Rules

- Always check `git status` at the repo root before editing. If you touch a submodule, also check
  `git -C visualizations/<name> status`.
- Assets that must work in both the homepage and a standalone submodule build need to exist in
  both the root `public/...` and that submodule's `public/...` (e.g. `visualizations/monolith/public/...`,
  and `visualizations/bocchi/public/bocchi.glb` + `public/bocchi.glb`).
- Preserve the style of the package you touch:
  - root and Monolith: semicolons, more explicit imperative style
  - Matrix: mostly no semicolons, looser hooks style
  - atom2 and bocchi submodules: vanilla Three.js, semicolons (match the file you edit)
- Make the smallest coherent diff that solves the problem. No formatting-only rewrites across
  package boundaries.
- Do not hand-edit `dist/`. It is build output.

## Common Traps

- Assuming a submodule build proves the homepage still works
- Adding a Monolith/Bocchi asset in only one `public/` tree
- Running the standalone Monolith deploy and unintentionally replacing the homepage shell
- Checking only root git status and missing dirty submodule work
- Uploading `.DS_Store` files during deploy

## Documentation Rule

If a change introduces or changes workflow, architecture, hotkeys, asset behavior, verification
steps, or deployment behavior, update the relevant doc above along with this file if the routing
itself changed.
