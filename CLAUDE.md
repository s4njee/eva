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
│   ├── planes/               ← planes scene (standalone route: /planes)
│   ├── shared/performance/   ← frame-rate monitor, adaptive quality, SafeCanvas
│   └── style.css             ← root UI styles
├── public/                   ← runtime assets for the root site
├── visualizations/
│   ├── monolith/             ← Three.js / R3F character showcase (Git submodule)
│   ├── matrix/               ← Matrix rain scene, TypeScript (Git submodule)
│   └── atom/                 ← molecular visualization scene (Git submodule)
├── docs/                     ← detailed per-topic documentation
├── .github/workflows/        ← CI/CD (deploy-s3.yml triggers on push to main)
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
| **Atom** | [docs/atom.md](docs/atom.md) | `visualizations/atom/src/App.jsx` |
| **Planes** | — | `src/planes/App.jsx` |
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

To run a visualization standalone:

```bash
npm --prefix visualizations/monolith run dev
npm --prefix visualizations/matrix run dev
npm --prefix visualizations/atom run dev
```

### Building

```bash
npm run build                                        # root app (always run this after any change)
npm --prefix visualizations/monolith run build       # standalone Monolith
npm --prefix visualizations/matrix run build         # standalone Matrix
npm --prefix visualizations/matrix run lint          # Matrix TypeScript lint (run alongside build)
npm --prefix visualizations/atom run build           # standalone Atom
```

Run `npm run build` at the root whenever root code **or** any imported visualization source changes.
A standalone submodule build passing does not mean the root build is fine.

### Matrix visual check

```bash
npm run check:matrix-visible    # from repo root — opens Chromium, verifies green rain glyphs
```

### Deploying

Root site (s8njee.com):
- **Automatic:** push or merge to `main` → GitHub Actions runs `.github/workflows/deploy-s3.yml`
- **Manual fallback:** `./deploy.sh` (requires AWS credentials in environment)
- **Cloudflare Pages branch:** push to `cloudflare` → GitHub Actions runs `.github/workflows/deploy-cloudflare-pages.yml`
- **Cloudflare manual fallback:** `./deploy-pages.sh` (requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, and `CLOUDFLARE_PAGES_PROJECT_NAME`)

Matrix standalone (rain.s8njee.com):
- `visualizations/matrix/deploy.sh`

> Do not run `visualizations/monolith/deploy.sh` unless the user explicitly wants the standalone
> Monolith shell to replace the homepage. It writes to the same S3 bucket as the root site.

---

## Core Rules

- Always check `git status` at the repo root before editing. If you touch a submodule, also check
  `git -C visualizations/<name> status`.
- Monolith assets that must work in both the homepage and standalone Monolith need to exist in
  both `public/...` and `visualizations/monolith/public/...`.
- Preserve the style of the package you touch:
  - root and Monolith: semicolons, more explicit imperative style
  - Matrix and Atom: mostly no semicolons, looser hooks style
- Make the smallest coherent diff that solves the problem. No formatting-only rewrites across
  package boundaries.
- Do not hand-edit `dist/`. It is build output.

## Common Traps

- Assuming a submodule build proves the homepage still works
- Adding a Monolith asset in only one `public/` tree
- Running the standalone Monolith deploy and unintentionally replacing the homepage shell
- Checking only root git status and missing dirty submodule work
- Uploading `.DS_Store` files during deploy

## Documentation Rule

If a change introduces or changes workflow, architecture, hotkeys, asset behavior, verification
steps, or deployment behavior, update the relevant doc above along with this file if the routing
itself changed.
