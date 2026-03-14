# Assets And Deploy

This doc covers the repo's runtime asset rules and deployment targets.

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

## Root vs Submodule Public Assets

This is the most important asset rule in the repo:

- the root site serves assets from root `public/`
- the standalone Monolith app serves assets from `visualizations/monolith/public/`

Because the root app imports Monolith source directly, Monolith code running inside the root app still expects the assets to exist at runtime.

So when adding a new Monolith asset that must work in both places:

- add it to `public/...`
- also add it to `visualizations/monolith/public/...`

If you only add the file in the submodule's `public/`, the standalone Monolith app may work while the root site fails.

## Asset Path Conventions

Monolith runtime asset resolution goes through:

- `visualizations/monolith/src/monolith/asset-url.js`

Use `resolveAssetUrl(...)` for new Monolith asset references rather than building paths ad hoc.

## Asset Hygiene

There are stray `.DS_Store` files in the repository, including under `public/`.

This matters because the current deploy flow has already shown that nested `.DS_Store` files can get uploaded.

Before deploys involving asset tree changes:

- check for `.DS_Store` files with `find . -name '.DS_Store'`
- remove them if the user wants a clean deploy

Do not hand-edit `dist/`.

`dist/` is build output and should be regenerated, not manually maintained.

## Deployment Matrix

Root deploy:

- script: `./deploy.sh`
- target: `s3://s8njee.com/`
- CloudFront distribution: `E1AQDGH3QM4XK1`
- effect: deploys the full root `dist/` site

Monolith deploy:

- script: `visualizations/monolith/deploy.sh`
- target: also writes to `s3://s8njee.com/`
- effect: uploads a standalone Monolith shell to the same homepage bucket

Important warning:

- the standalone Monolith deploy can overwrite the homepage shell
- do not run it unless the user explicitly wants to deploy the standalone Monolith experience as the main site

Matrix deploy:

- script: `visualizations/matrix/deploy.sh`
- target bucket: `rain.s8njee.com`
- separate CloudFront distribution from the root app

Atom deploy:

- there is no deploy script checked in for `visualizations/atom`
- do not invent a deployment path unless the user asks for one

All deploy scripts assume AWS CLI credentials and config are already available in the environment.
