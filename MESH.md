# GLB Remeshing Guide

> Last reviewed: 2026-04-12

This document explains how to make lighter `.glb` model variants for the performance branch,
especially for Raspberry Pi 5 testing.

Use this when a model has too many vertices, too many draw calls, or too much texture weight for
smooth real-time rendering.

## Goal

Create lower-cost model variants without replacing the original assets.

Recommended naming:

- `model.glb` — original, highest fidelity
- `model.medium.glb` — moderate reduction
- `model.low.glb` — low-end fallback
- `model.pi.glb` — Raspberry Pi / integrated GPU fallback

For a first pass, `model.low.glb` is enough.

## Important Repo Rule

Monolith assets used by both the homepage and standalone Monolith must exist in both public trees:

- `public/...`
- `visualizations/monolith/public/...`

Example:

```text
public/set4/bomber.low.glb
visualizations/monolith/public/set4/bomber.low.glb
```

Do not add only one copy unless the model is intentionally available in only one runtime.

## Recommended CLI Tool

Use `gltf-transform` for repeatable command-line simplification and optimization.

Install it in the root repo:

```bash
npm install --save-dev @gltf-transform/cli
```

Inspect a model before changing it:

```bash
npx gltf-transform inspect public/set4/bomber.glb
```

Create a low-poly copy:

```bash
npx gltf-transform simplify public/set4/bomber.glb public/set4/bomber.low.glb --ratio 0.45 --error 0.002
```

Optimize the simplified copy:

```bash
npx gltf-transform optimize public/set4/bomber.low.glb public/set4/bomber.low.glb
```

Try a more aggressive Pi variant:

```bash
npx gltf-transform simplify public/set4/bomber.glb public/set4/bomber.pi.glb --ratio 0.25 --error 0.005
npx gltf-transform optimize public/set4/bomber.pi.glb public/set4/bomber.pi.glb
```

## Suggested Ratios

- `0.60`: light reduction, usually visually safe
- `0.45`: good first low-end target
- `0.35`: stronger reduction for heavy models
- `0.25`: Pi fallback candidate
- `< 0.20`: only if the model still reads clearly

Use the least aggressive ratio that fixes performance.

## Compression Note

Draco and Meshopt compression reduce download size, but they do not necessarily reduce runtime
vertex cost after decode.

Use simplification / decimation for fewer vertices.

Use compression for smaller files.

Both are useful, but they solve different problems.

## Blender Workflow

Use Blender when the CLI simplifier damages the silhouette, face, weapons, wings, or other
recognizable details.

Steps:

1. Open Blender.
2. Import the original `.glb`.
3. Select the mesh object.
4. Add a `Decimate` modifier.
5. Use `Collapse` mode.
6. Try ratios like `0.5`, `0.35`, or `0.25`.
7. Inspect the result from the camera angles used in Monolith.
8. Apply the modifier.
9. Export as `.glb`.

Export settings:

- Format: `glTF Binary (.glb)`
- Include selected objects if you isolated the model
- Keep materials enabled
- Keep animations enabled if the model is animated

## Batch Candidate List

Start with large or recently added assets:

```text
public/set4/bomber.glb
public/set4/mf.glb
public/set4/avenger.glb
public/set5/power.glb
```

Then inspect other heavy files:

```bash
find public -name '*.glb' -exec ls -lh {} \;
```

## Mirroring A Variant

After creating a root variant, mirror it into the Monolith submodule:

```bash
cp public/set4/bomber.low.glb visualizations/monolith/public/set4/bomber.low.glb
```

Then verify both files exist:

```bash
ls -lh public/set4/bomber.low.glb visualizations/monolith/public/set4/bomber.low.glb
```

## Wiring Variants Into Monolith

Model entries live in:

```text
visualizations/monolith/src/monolith/set-defs.js
```

Keep the original path and add optional lower-cost paths:

```js
{
  key: '...',
  name: 'Bomber',
  path: '/set4/bomber.glb',
  lowPath: '/set4/bomber.low.glb',
  piPath: '/set4/bomber.pi.glb',
}
```

Then update the model loader path selection so low-end devices can prefer `piPath` or `lowPath`
when available.

Suggested selection order:

```text
low tier + piPath -> piPath
low tier + lowPath -> lowPath
otherwise -> path
```

## Device-Aware Variants

Device-aware variants are the simplest way to reduce vertex count without changing scene logic.
Instead of loading the same `.glb` everywhere, each model definition can expose cheaper paths.

Recommended data shape:

```js
{
  key: 'bomber',
  name: 'Bomber',
  path: '/set4/bomber.glb',
  mediumPath: '/set4/bomber.medium.glb',
  lowPath: '/set4/bomber.low.glb',
  piPath: '/set4/bomber.pi.glb',
}
```

Recommended resolver:

```js
function getModelPathForQuality(entry, qualityTier) {
  if (qualityTier === 'low') {
    return entry.piPath ?? entry.lowPath ?? entry.mediumPath ?? entry.path;
  }

  return entry.path;
}
```

Where to wire it:

```text
visualizations/monolith/src/MonolithCanvas.jsx
visualizations/monolith/src/monolith/model-loader.js
visualizations/monolith/src/monolith/set-defs.js
```

Implementation shape:

1. Add `lowPath` or `piPath` to expensive models in `set-defs.js`.
2. Read `qualityTier` from the shared performance context near the Monolith scene.
3. Resolve the runtime model path before calling the loader.
4. Keep the cache key aligned with the resolved path, not only the original `path`.
5. Keep the original `path` as the default so high-end devices still get full quality.

Cache warning:

If `cacheKey` stays as `entry.path` while the loader fetches `entry.lowPath`, the session cache can
serve the wrong model. Use the resolved path for both fetch and cache identity.

Suggested loader entry shape:

```js
const resolvedPath = getModelPathForQuality(entry, qualityTier);

await executeModelLoad({
  entry: {
    ...entry,
    path: resolvedPath,
  },
  cacheKey: resolvedPath,
  // remaining loader args...
});
```

## Runtime LODs

Runtime LODs let Three.js switch between multiple mesh versions based on camera distance. This is
useful when a model stays visible at multiple distances, but it costs more upfront because multiple
variants may need to be loaded.

Use LODs when:

- the camera can move far away from the model
- a model has very high detail that is invisible at distance
- the device has enough memory for multiple variants

Prefer device-aware variants when:

- the Pi 5 should only ever load the cheaper model
- memory is tight
- startup time matters more than distance-based fidelity

Basic Three.js shape:

```js
const lod = new THREE.LOD();
lod.addLevel(highModel, 0);
lod.addLevel(mediumModel, 10);
lod.addLevel(lowModel, 18);
scene.add(lod);
```

Monolith-specific implementation notes:

- `swapModel()` currently expects one loaded model group.
- A true LOD path should build one `THREE.LOD` group and pass that group into `swapModel()`.
- Material overrides must be applied to every LOD level.
- Transform normalization should happen consistently across all variants before adding levels.
- Animation is harder with LODs. For animated models, prefer device-aware variants first.

Suggested LOD entry shape:

```js
{
  key: 'bomber',
  name: 'Bomber',
  path: '/set4/bomber.glb',
  lodPaths: [
    { path: '/set4/bomber.glb', distance: 0 },
    { path: '/set4/bomber.medium.glb', distance: 10 },
    { path: '/set4/bomber.low.glb', distance: 18 },
  ],
}
```

Suggested rollout:

1. Implement device-aware variants first.
2. Add true `THREE.LOD` only for static models that remain expensive after device-aware loading.
3. Avoid LODs for animated models until animation retargeting and mixer behavior are tested.

## KTX2 / Basis Texture Compression

KTX2 / Basis compression reduces texture download size, upload time, and VRAM usage. It is
especially useful for GLBs with large embedded textures.

This is separate from mesh simplification:

- mesh simplification reduces vertices
- KTX2 reduces texture memory and bandwidth
- Draco / Meshopt compression reduces transfer size for geometry

Install support tooling:

```bash
npm install --save-dev @gltf-transform/cli @gltf-transform/extensions
```

Compress textures in a GLB:

```bash
npx gltf-transform uastc public/set4/bomber.low.glb public/set4/bomber.low.ktx2.glb
```

Smaller but lower-quality ETC1S-style compression:

```bash
npx gltf-transform etc1s public/set4/bomber.low.glb public/set4/bomber.low.ktx2.glb
```

Recommended defaults:

- Use `uastc` for hero models where visual quality matters.
- Use `etc1s` for background or small models where file size matters more.
- Compare both on the Pi 5 before choosing a default.

Inspect texture savings:

```bash
npx gltf-transform inspect public/set4/bomber.low.glb
npx gltf-transform inspect public/set4/bomber.low.ktx2.glb
```

Runtime loader requirement:

Three.js needs a `KTX2Loader` wired into `GLTFLoader` before it can load KTX2-compressed textures.

Expected loader setup:

```js
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const ktx2Loader = new KTX2Loader();
ktx2Loader.setTranscoderPath(resolveAssetUrl('/basis/'));
ktx2Loader.detectSupport(renderer);

loader.setKTX2Loader(ktx2Loader);
```

Asset requirement:

The Basis transcoder files must be available at runtime, usually under:

```text
public/basis/
visualizations/monolith/public/basis/
```

Files commonly needed:

```text
basis_transcoder.js
basis_transcoder.wasm
```

Teardown requirement:

Dispose the KTX2 loader alongside the Draco loader:

```js
ktx2Loader.dispose();
```

Recommended rollout:

1. Start with `.low.glb` mesh variants.
2. Create `.low.ktx2.glb` copies from those variants.
3. Add `ktx2Path` or replace `lowPath` only after KTX2 loading works locally.
4. Mirror compressed variants and Basis transcoder files into both public trees.
5. Test root build and standalone Monolith build.
6. Test on Pi 5 because texture support paths vary by GPU/browser.

Naming options:

```text
bomber.low.glb
bomber.low.ktx2.glb
bomber.pi.glb
bomber.pi.ktx2.glb
```

Path selection can prefer KTX2 only when support is confirmed:

```text
low tier + supports KTX2 + piKtx2Path -> piKtx2Path
low tier + piPath -> piPath
low tier + supports KTX2 + lowKtx2Path -> lowKtx2Path
low tier + lowPath -> lowPath
otherwise -> path
```

## Verification Checklist

After generating a variant:

- Run `npx gltf-transform inspect` on the original and variant
- Compare vertex count, primitive count, texture sizes, and file size
- Check the model in the root app
- Check the model in standalone Monolith if it is mirrored there
- Confirm animation still works if the original was animated
- Confirm scale, rotation, material style, x-ray mode, and lighting still look acceptable
- If using KTX2, confirm the model loads in both root and standalone Monolith
- If using LODs, confirm transitions do not pop too visibly during camera movement

Required builds after wiring a variant:

```bash
npm run build
npm --prefix visualizations/monolith run build
```

## What Not To Do

- Do not overwrite the original `.glb` until the variant has been tested
- Do not rely on Draco alone when the problem is vertex count
- Do not hand-edit `dist/`
- Do not add a Monolith runtime asset to only one public tree
- Do not simplify animated models without checking that the animation still binds correctly

## Practical First Pass

For the performance branch, the fastest useful experiment is:

1. Generate `bomber.low.glb` with `--ratio 0.45 --error 0.002`
2. Generate `mf.low.glb` with `--ratio 0.45 --error 0.002`
3. Mirror both variants into `visualizations/monolith/public/set4/`
4. Add `lowPath` entries in `set-defs.js`
5. Teach the loader to prefer `lowPath` on low quality tier
6. Deploy the `performance` branch to Cloudflare Pages
7. Test on the Raspberry Pi 5 with `?perf=1`
