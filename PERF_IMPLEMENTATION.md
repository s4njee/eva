# Matrix Rain — Performance Implementation Plan

**Goal:** bring the Matrix scene to smooth frame rates on non-Mac hardware (Linux dGPU,
Windows + GTX 1060). On Apple Silicon the scene already runs well because unified
memory hides the per-frame upload cost. On discrete GPUs that cost is the dominant
bottleneck, followed by fragment shader cost on the `discard` + transparent path.

**Scope:** the five "Biggest Wins" from the review.

**Files in play:**
- `visualizations/matrix/src/text-rain/MatrixRain.tsx` — the simulation + render loop
- `visualizations/matrix/src/text-rain/App.tsx` — Canvas / DPR / renderer options
- `src/shared/performance/FrameRateMonitor.tsx` — quality tier source used by the rain
- `src/shared/webgl/SafeCanvas.tsx` — wraps the R3F `<Canvas>` for the scene

**Ordering:** apply items 1 → 4 in order. Each is independently measurable and
reversible. Item 5 (full-screen fragment shader rewrite) is a parallel track and
should only start after 1–4 are measured.

---

## Measurement harness (do this first)

Before changing anything, establish a repeatable measurement so wins are provable.

1. Add a `?perf=1` URL flag in `App.tsx` that forces a fixed quality tier and logs
   a JSON summary every ~2s: fps, tier, active column count, JS heap, uploaded
   bytes/frame (see item 3 for how to count uploads). Route it through the existing
   `FrameRateMonitorProvider` by passing `config={{ forcedQualityTier: 'high' }}`.
2. Capture baselines on three machines:
   - Apple Silicon (sanity check / regression guard)
   - Linux dGPU
   - Windows + GTX 1060
3. For each machine record: median fps, 1% low fps, GPU time per frame (Spector.js
   or `chrome://gpu-internals`), CPU time per frame (Performance panel), and total
   VRAM (chrome://gpu).
4. Confirm `powerPreference: "high-performance"` is actually resolving to the dGPU
   on the Windows machine before benchmarking. Chrome can silently pick the iGPU
   even when the flag is set; verify via `chrome://gpu`.

Keep these numbers in a small table appended at the bottom of this doc as each win
lands.

---

## Win 1 — Cap `devicePixelRatio` on non-Mac hardware

**Hypothesis:** fragment shader cost scales with DPR². On a 1440p Linux desktop at
DPR 2, the shader runs ~4× as many fragments as it does at DPR 1. Combined with
`discard` and transparent blending (see Win 4), this is a large chunk of the
Windows/Linux regression.

**Current state:** `App.tsx:84` passes `dpr={[0.75, 2]}`. The upper bound of 2 is
the problem on HiDPI Linux and Windows laptops.

**Change:**

1. Read the current tier from `useFrameRate()` (already used in `MatrixRain.tsx`)
   at the shell level and compute a dynamic DPR cap:
   - `high` → cap at `1.5`
   - `medium` → cap at `1.25`
   - `low`   → cap at `1`
2. Pass `dpr={[0.75, cap]}` into `SafeCanvas`.
3. Gate the cap behind platform detection as a safety net: if
   `navigator.userAgent` does not include `Mac OS X` / `Macintosh`, clamp the upper
   bound to `1.5` regardless of tier. Apple Silicon can afford the full DPR.
4. Make sure the DPR value surfaces to the existing `FrameRateHud` (`dpr` field in
   the snapshot is currently stubbed to `1` at `FrameRateMonitor.tsx:196`). Wire
   `gl.getPixelRatio()` from a `useThree()` call in `FrameRateMonitorBridge` so
   the HUD reflects reality.

**Risk:** noticeable softness on HiDPI Macs if the heuristic is wrong. Keep
Apple-detection path unchanged at `[0.75, 2]`. DPR change triggers a full
renderer resize — verify `OrbitControls` and `MatrixEffects` still render after the
change.

**Exit criteria:** on the Windows/Linux rigs the GPU frame time drops by >30% at
equal column count; Mac numbers unchanged.

---

## Win 2 — Eliminate the per-instance 4×4 matrix upload

**Hypothesis:** the dominant CPU→GPU transfer is `instanceMatrix` — 16 floats × 4
bytes × active instances × 60 Hz. At 3200 columns × 150 rows = 480k instances,
that's ~30 MB/frame. On UMA this is free; on a GTX 1060 over PCIe it is not.

**Current state:** `MatrixRain.tsx:399` writes `matArr` from
`m.instanceMatrix.array` every frame via `writeVisibleInstanceMatrix` and
`writeHiddenInstance`. Cells live on a fixed grid; the only truly per-cell
variability is which row is "hidden" (opacity 0) vs visible. Column position
wobbles via `sinLUT(t*0.25 + phase)` — that's per-column, not per-cell.

**Change:** stop writing an instance matrix at all. Replace with a
`ShaderMaterial` that computes world position from `gl_InstanceID` split into
column/row indices, plus a small per-column data buffer.

1. Replace the `<instancedMesh>` with a raw `<instancedMesh>` backed by a
   `THREE.InstancedBufferGeometry` that **does not** set `instanceMatrix`. Three
   only uploads an `instanceMatrix` buffer when it exists; explicitly override
   it with a zero-length attribute or subclass to skip the default.
2. Add a per-column `InstancedBufferAttribute` holding a `vec4(cx, cz, size,
   phase)`. Width = COLUMN_COUNT × 4 floats. Keyed per instance via
   `meshPerAttribute: ROWS` so all rows in a column see the same value.
3. Compute the cell's grid row from `gl_InstanceID` in the vertex shader:
   ```glsl
   // JS-side: pass uRows as a uniform
   int rowIdx = gl_InstanceID - int(floor(float(gl_InstanceID) / uRows) * uRows);
   ```
   Or equivalently carry a tiny per-instance `aRow` attribute (1 byte per cell;
   an 8-bit unsigned) that the vertex shader reads. The attribute path is more
   portable than fiddling with `gl_InstanceID` maths across drivers.
4. Vertex shader produces world position as:
   ```glsl
   vec3 worldPos = vec3(
       aColumn.x + sin(uTime * 0.25 + aColumn.w) * 0.03,
       uBaseY - float(rowIdx) * uRowSpacing,
       aColumn.y
   );
   gl_Position = projectionMatrix * viewMatrix * vec4(worldPos + position * aColumn.z, 1.0);
   ```
   `position` is the quad geometry; `aColumn.z` is per-column size.
5. Delete `bufs.mat`, `writeVisibleInstanceMatrix`, `writeHiddenInstance`,
   and the `matArr.fill` call.
6. "Hidden" cells now have to be signalled via the existing `aOpa` attribute
   being 0 (and the shader already `discard`s when `vOpa < 0.001`). Keep the
   discard in place for this step — Win 4 will revisit it.
7. The per-column `vec4` attribute only changes when a column resets or when
   `phase` updates (it doesn't). So it's effectively write-once — upload it on
   reset via `addUpdateRange` and don't touch it on the happy path.

**Expected savings:** 16 floats → 0 floats per cell per frame. Upload drops from
~30 MB/frame to ~2 MB/frame (uv + col + opa only).

**Risk:** highest-surface-area change in this plan. Keep a `?legacy=1` flag that
flips back to the old matrix path for quick A/B.

**Exit criteria:** `bufferSubData` time in Spector.js drops by >80%; fps on
Windows improves meaningfully even before Win 4 lands.

---

## Win 3 — Skip per-cell attribute rewrites when nothing changed

**Hypothesis:** in the steady state most cells either are off, or are mid-trail
with no glyph change this frame. The current loop at `MatrixRain.tsx:471` writes
uv + col + opa for every active cell unconditionally, then marks one giant update
range spanning all active instances. That forces Three to re-upload the full
range, defeating the point of partial updates.

**Change:** track dirtiness per column and upload only dirty column slices.

1. Add a `Uint8Array(COLUMN_COUNT)` `dirtyColumns` bitmap to `SimulationState`.
2. A column is dirty on any of:
   - A head advance tick this frame (`while (acc >= 1)` entered at least once)
   - A `resetColumn` call
   - A glyph scramble tick (the `k < 2` scramble loop)
   - First frame (initial flush)
3. Skip the `for rowIndex` write loop entirely when `dirtyColumns[columnIndex]`
   is 0 — the previous frame's values are still correct for that column slice.
4. Replace the single `addUpdateRange(0, activeInstances * X)` call with one
   range per contiguous run of dirty columns. Coalesce adjacent dirty columns
   into a single range before calling `addUpdateRange` (keeps upload calls to a
   handful even when the whole screen is animating).
5. Clear `dirtyColumns` at the end of the frame.

**Expected savings:** on a typical frame, only ~1/speed fraction of columns
advance their head. At speed ∈ [10, 22], that's roughly ~25–35% of columns per
frame. So per-cell write work and upload volume both drop ~3×.

**Risk:** easy to miss a mutation site and leave stale data on screen. Guard
with an assertion in dev builds: if a column mutates in `simulate()` without
setting `dirty`, log and bail. Remove in production.

**Exit criteria:** median CPU frame time in the Performance panel drops; no
visual regressions (compare against a recording from before the change).

---

## Win 4 — Remove `transparent:true`, drop `DoubleSide`, and switch to `alphaTest`

**Hypothesis:** `transparent: true` puts the mesh in the sorted transparent
queue and disables hierarchical-Z / early-Z optimizations on NVIDIA. Combined
with `discard` in the fragment shader, the GPU must run the fragment shader for
every covered pixel regardless of whether the alpha test would pass. `DoubleSide`
also doubles fragment work for the back face. Both are unnecessary here.

**Current state:** `MatrixRain.tsx:315–326` sets `transparent: true`,
`depthWrite: false`, `side: THREE.DoubleSide`. The fragment shader discards when
`a < 0.08 || vOpa < 0.001`.

**Change:**

1. Set `side: THREE.FrontSide` (default). Back face is never visible because the
   quads are billboards facing the camera, and even if not, invisible back faces
   cost nothing.
2. Switch to an opaque-ish path:
   - `transparent: false`
   - `depthWrite: true`
   - Add `alphaTest: 0.08` on the material (but we're using a raw
     `ShaderMaterial`, so mirror this in the fragment shader: `if (a * vOpa <
     0.08) discard; gl_FragColor = vec4(vCol, 1.0);`).
   - Also set `blending: THREE.NoBlending` explicitly.
3. Trails fade by color, not by alpha — lerp the color toward the fog color
   (`palette.fog`) by `(1 - fade)` instead of reducing opacity. This preserves
   the visual trail while letting us draw fully opaque fragments.
4. Head cell stays at full `palette.headColor`. Dim trail becomes a mix of
   `trailColor` → `fog` as `age` grows. `opa` is no longer needed as a uniform;
   the attribute can be deleted (this also reduces upload size, compounding
   with Win 3).
5. Because billboards overlap at shallow camera angles, enabling depth write may
   produce small z-fighting near the fog plane. Nudge `polygonOffset` to a tiny
   positive value per column (e.g. based on column index) if needed, or accept
   the sort order as "whichever column drew first wins" — visually indistinct
   at this density.

**Expected savings:** on GTX 1060 this typically recovers 20–40% of fragment
cost when combined with lower DPR (Win 1). Also eliminates the transparent-queue
sort cost entirely.

**Risk:** the "fade via color, not alpha" change is visible. Compare palettes
side by side. If the trail looks too harsh, add a second gradient stop so the
last 4–5 trail cells fade further toward fog color (still no alpha blending).

**Exit criteria:** GPU frame time drops; no transparent-queue entries for the
rain mesh in Spector.js; HUD still looks like Matrix rain on all four palettes.

---

## Win 5 — Full-screen fragment shader rewrite (detailed)

**Hypothesis:** the cheapest possible rendering of this effect is 1 draw call,
1 fullscreen quad, 1 fragment shader. Classic ShaderToy Matrix-rain demos run
at 60 fps on integrated graphics. By moving the scene from "480k world-space
billboards" to "1 fullscreen pixel program", we eliminate essentially all
CPU→GPU bandwidth, all geometry cost, the transparent queue, and the
instancing overhead in one shot. This is the approach that delivers Mac-class
performance on any WebGL2-capable GPU.

**When to start:** after Wins 1–4 are measured. If those fall short of ≥50 fps
on the GTX 1060 reference machine, this becomes the path forward. Either way,
land it behind a flag and A/B.

---

## Measurement log

Remote Linux benchmark captured on `mars.local` with the `?perf=1` harness,
Playwright Chromium headless, `deviceScaleFactor: 2`, and a non-Mac user agent.
The scene stayed in the `high` tier in both runs. This environment did not
surface separate GPU/CPU/VRAM metrics, so the log here tracks the harness
values that were available.

| Run | DPR | Sample count | Median FPS | 1% low FPS | Active columns | Uploaded bytes/frame | JS heap bytes |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Before Win 1 | 2.00 | 1 | 0 | 0 | 3200 | 42,240,000 | 199,000,000 |
| After Win 1 | 1.50 | 1 | 0 | 0 | 3200 | 42,240,000 | 199,000,000 |

Wins 2-4 are now implemented in code. Re-run the table on the real reference
machines when we have them available, since the headless browser sample is only
useful as a harness smoke test.

**Core idea:** the rain is a 2D grid of glyphs where each cell's state is a
pure function of `(columnIndex, rowIndex, columnHeadPosition, time)`. The
only state that must persist frame-to-frame is the head position per column
(and the column's x/z wobble phase, speed, size). That's a few floats per
column — at 1000 columns, <16 kB total — trivially uploadable as a single
small data texture. Everything else (which glyph, what color, how opaque)
is computed per-fragment from those inputs plus a deterministic hash.

### 5.1 File layout

Create two new files alongside the existing ones:

- `visualizations/matrix/src/text-rain/MatrixRainShader.tsx` — React component,
  same prop surface as `MatrixRain.tsx` (`palette`, `rainBoost`). Drop-in
  replacement behind a flag.
- `visualizations/matrix/src/text-rain/matrix-rain-shader.glsl.ts` — exports
  `VS` and `FS` as template-literal strings. Keep shader source separate so
  it's greppable and diffable independent of the React wrapper.

Reuse the existing `buildAtlas()` verbatim from `MatrixRain.tsx` — extract it
to a new shared module `matrix-atlas.ts` and import from both files. This
guarantees visual parity for glyph rendering and avoids duplicate atlas
uploads if both engines mount simultaneously during A/B.

### 5.2 Engine selection flag

In `App.tsx`:

1. Read a `?engine=shader` / `?engine=instanced` URL param on mount. Default to
   `instanced` initially; flip to `shader` once validation passes.
2. Also honor a tier-based auto-selection once confident: e.g. `low` tier →
   shader engine automatically, on the theory that the shader engine is
   strictly faster, so devices that can't hit high tier with the instanced
   engine should default to the cheaper path.
3. Render `<MatrixRain>` or `<MatrixRainShader>` based on the choice. Both
   accept `palette` and `rainBoost`.
4. Persist the choice to `localStorage` so a user who finds the instanced
   version prettier can pin it.

### 5.3 Geometry and draw

The shader engine draws exactly one primitive per frame:

1. Use a fullscreen triangle (not a quad) to avoid the diagonal overdraw
   penalty. Positions `[-1,-1], [3,-1], [-1,3]` in clip space; the vertex
   shader passes them straight through and computes `vUv` from
   `position.xy * 0.5 + 0.5`. One triangle, three vertices, covers the whole
   viewport.
2. Render this *before* `MatrixEffects` so post-processing still composes on
   top. Disable depth test and depth write on the material — the scene is 2D.
3. Remove `OrbitControls` behavior for this engine. Pan/zoom does not make
   sense for a 2D full-screen effect. If we want the subtle column wobble the
   current scene has, it lives in the fragment shader, not in camera motion.
   Document this tradeoff in the README.

### 5.4 Grid and coordinate system

Define a logical grid:

- `uGridCols: float` — number of columns visible, e.g. 80 on a wide monitor,
  40 on a phone. Scale with viewport aspect so cells stay roughly square:
  `cols = round(baseRows * aspect * cellAspect)`.
- `uGridRows: float` — number of rows visible, e.g. 60.
- These two uniforms are updated on resize in a `useThree()` subscriber.

In the fragment shader:

```glsl
vec2 gridUv   = vUv * vec2(uGridCols, uGridRows);  // [0, cols] × [0, rows]
vec2 cellIdx  = floor(gridUv);                      // integer cell coords
vec2 cellUv   = fract(gridUv);                      // [0,1] within the cell
int  col      = int(cellIdx.x);
int  row      = int(cellIdx.y);
```

`cellUv` is the glyph-local UV used to sample the atlas. `col` / `row` select
which column's head to query and which glyph to draw.

### 5.5 Per-column state texture

One small texture holds all per-column state:

- Format: `RGBA32F` (four floats per texel, WebGL2 required — confirm via
  `gl.capabilities.isWebGL2`; fall back to `RGBA16F` or two `RGBA8` textures
  packed if not).
- Dimensions: `uGridCols × 1`.
- Channels:
  - `.r` — head row position (float, can be negative while the head is
    "above" the screen, and can exceed `uGridRows` while the tail finishes)
  - `.g` — trail length (float, 22..38 range matching current behavior)
  - `.b` — wobble phase (float, 0..2π)
  - `.a` — speed (float, 10..22)
- The JS simulation writes to a `Float32Array(uGridCols * 4)` each frame and
  uploads via `texture.needsUpdate = true` with a `DataTexture`. That's
  `80 cols × 16 bytes = 1.28 kB per frame`. Negligible.

Simulation per frame in JS:

1. For each column, advance head by `speed * dt`. When the tail end
   (`head - trailLength`) exceeds `uGridRows + resetBuffer`, reset head to
   a negative value (above the screen), roll new `trailLength`, `speed`,
   `phase`.
2. `rainBoost` still doubles the active column count by driving columns
   `baseCount..boostCount` from "above screen" on the rising edge, same as
   the current `seedColumn` path.
3. Write the updated row of floats into the Float32Array and mark the
   DataTexture dirty. Don't use `addUpdateRange` — the texture is 1 row tall,
   a full upload is cheap.

### 5.6 Fragment shader: per-cell logic

```glsl
// Uniforms
uniform sampler2D uAtlas;      // glyph atlas (reused from instanced path)
uniform sampler2D uColState;   // RGBA32F, cols × 1
uniform vec2      uAtlasSize;  // (ATLAS_COLS, ATLAS_ROWS)
uniform float     uCharCount;
uniform float     uGridCols;
uniform float     uGridRows;
uniform float     uTime;
uniform vec3      uHeadColor;
uniform vec3      uTrailColor;
uniform vec3      uDimTrailColor;
uniform vec3      uFogColor;
uniform float     uWobbleAmp;   // e.g. 0.03, matches current sin offset
uniform float     uWobbleFreq;  // e.g. 0.25

varying vec2 vUv;

// Deterministic hash — Inigo Quilez style.
float hash11(float p) {
    p = fract(p * 0.1031);
    p *= p + 33.33;
    p *= p + p;
    return fract(p);
}
float hash21(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

void main() {
    // 1. Find cell
    vec2 gridUv  = vUv * vec2(uGridCols, uGridRows);
    vec2 cellIdx = floor(gridUv);
    vec2 cellUv  = fract(gridUv);
    float col    = cellIdx.x;
    float row    = cellIdx.y;

    // 2. Fetch column state
    vec2  colStateUv = vec2((col + 0.5) / uGridCols, 0.5);
    vec4  colState   = texture2D(uColState, colStateUv);
    float head       = colState.r;
    float trailLen   = colState.g;
    float phase      = colState.b;
    // speed unused in FS but kept for future tweaks

    // 3. Column wobble — shift cellUv.x by a tiny sin so columns sway
    float wobble = sin(uTime * uWobbleFreq + phase) * uWobbleAmp;
    cellUv.x -= wobble;  // may push outside [0,1] — handle below

    // 4. Age of this row within the trail. Discard if outside.
    float age = head - row;
    if (age < 0.0 || age > trailLen) { discard; }

    // 5. Pick a glyph. Deterministic hash so it's stable across frames.
    //    Scramble cadence: include floor(uTime * 6.0) to re-roll 6× per second
    //    on a subset of cells, matching the existing scramble loop.
    float scrambleSlot = floor(uTime * 6.0);
    float scrambleKey  = hash21(vec2(col, row) + scrambleSlot * 17.0);
    float baseKey      = hash21(vec2(col, row + floor(head)));
    float glyphKey     = mix(baseKey, scrambleKey, step(0.75, scrambleKey));
    float glyphIdx     = floor(glyphKey * uCharCount);

    // 6. Map glyphIdx → atlas UV
    float atlasCol = mod(glyphIdx, uAtlasSize.x);
    float atlasRow = floor(glyphIdx / uAtlasSize.x);
    vec2  atlasUv  = (vec2(atlasCol, atlasRow) + cellUv) / uAtlasSize;
    // Note: flip Y to match the instanced path's `1 - (row+1)/rows` formula.
    atlasUv.y = 1.0 - atlasUv.y;

    // 7. Sample atlas
    //    Early-out: if cellUv strayed outside [0,1] due to wobble, clamp or
    //    discard. Cheapest is discard — it's a 2-3% border.
    if (cellUv.x < 0.0 || cellUv.x > 1.0) { discard; }
    float a = texture2D(uAtlas, atlasUv).r;
    if (a < 0.08) { discard; }

    // 8. Color: head bright, trail fades toward fog.
    float fade = 1.0 - age / trailLen;
    vec3  trail = mix(uDimTrailColor, uTrailColor, fade);
    vec3  color = mix(trail, uHeadColor, step(age, 0.5));  // head cell
    color = mix(uFogColor, color, fade * 0.84 + 0.16);     // preserve existing opacity→brightness mapping

    gl_FragColor = vec4(color * a, 1.0);
}
```

Notes on the shader above:

- All discards happen before the atlas sample to keep early-Z friendly. On
  GTX 1060 this matters even for a fullscreen quad because hierarchical-Z can
  still reject tiles.
- The scramble cadence (6 Hz) can be tuned to match the current
  `pickIdx` scramble frequency. The intent is that ~25% of cells swap glyphs
  per scramble tick, same as the current `if (Math.random() < 0.5)` gate run
  on 2 random cells per column per tick.
- `step(age, 0.5)` highlights only the head row in `uHeadColor`. Matches the
  `if (age === 0)` branch in `writeCellColorAndOpacity` at line 276.
- Fog/brightness math is a single-line substitute for the existing
  `0.16 + fade * 0.84` opacity curve. Keep it as `mix(fogColor, trailColor,
  brightness)` so the final render is still fully opaque
  (`transparent: false`).

### 5.7 React component skeleton

```tsx
export default function MatrixRainShader({ palette, rainBoost }: MatrixRainProps) {
  const { qualityTier } = useFrameRate()
  const { size } = useThree()

  // Grid derived from viewport + tier
  const grid = useMemo(() => {
    const rows = qualityTier === 'low' ? 40 : qualityTier === 'medium' ? 55 : 70
    const cols = Math.round(rows * (size.width / size.height) * 0.55) // 0.55 ≈ cell aspect
    return { cols, rows }
  }, [qualityTier, size.width, size.height])

  const atlas = useMemo(() => buildAtlas(), [])

  const stateTexture = useMemo(() => {
    const data = new Float32Array(grid.cols * 4)
    const tex = new THREE.DataTexture(data, grid.cols, 1, THREE.RGBAFormat, THREE.FloatType)
    tex.needsUpdate = true
    return tex
  }, [grid.cols])

  const columns = useMemo(() => initColumnState(grid.cols), [grid.cols])

  const material = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: VS,
    fragmentShader: FS,
    uniforms: {
      uAtlas:         { value: atlas },
      uColState:      { value: stateTexture },
      uAtlasSize:     { value: new THREE.Vector2(ATLAS_COLS, ATLAS_ROWS) },
      uCharCount:     { value: CHAR_COUNT },
      uGridCols:      { value: grid.cols },
      uGridRows:      { value: grid.rows },
      uTime:          { value: 0 },
      uHeadColor:     { value: new THREE.Color(...palette.headColor) },
      uTrailColor:    { value: new THREE.Color(...palette.trailColor) },
      uDimTrailColor: { value: new THREE.Color(...palette.dimTrailColor) },
      uFogColor:      { value: new THREE.Color(palette.fog) },
      uWobbleAmp:     { value: 0.03 },
      uWobbleFreq:    { value: 0.25 },
    },
    transparent: false,
    depthTest:   false,
    depthWrite:  false,
  }), [atlas, stateTexture, grid, palette])

  useFrame((_, dt) => {
    const cappedDt = Math.min(dt, 1 / 30)
    stepColumns(columns, cappedDt, grid.rows, rainBoost)
    writeColumnsToTexture(columns, stateTexture)
    material.uniforms.uTime.value += cappedDt
  })

  return (
    <mesh frustumCulled={false}>
      <bufferGeometry>{/* fullscreen triangle */}</bufferGeometry>
      <primitive object={material} attach="material" />
    </mesh>
  )
}
```

Helpers (`initColumnState`, `stepColumns`, `writeColumnsToTexture`) live in
the same file and operate entirely on typed arrays — same spirit as the
current `SimulationState` but reduced to ~4 scalars per column.

### 5.8 Palette changes

`MatrixEffects` already drives palette switching via the `palette` prop. For
the shader engine:

1. When `paletteName` changes, `App.tsx` hands the new `palette` object down
   as a prop. `useMemo` in `MatrixRainShader` recomputes the material's color
   uniforms.
2. The `fog` / background color is still set via `<color attach="background">`
   in `App.tsx` — no shader change needed.

### 5.9 `rainBoost` handling

Space-bar boost currently doubles the column count and drops the new columns
in from above. In the shader engine:

1. Keep a `baseActiveCols` and `boostActiveCols` and only simulate that many
   entries in the state array. The shader still draws the full grid, but
   inactive columns have `head = -9999` so every row fails the `age > 0`
   test and gets discarded.
2. On boost rising edge, seed `baseActiveCols..boostActiveCols` with
   `head = -trailLength - rand(5, 30)`, matching the existing behavior at
   line 405.
3. Trailing edge: columns beyond `baseActiveCols` naturally run off the
   bottom and get parked with `head = -9999` on reset.

### 5.10 Parity checklist

Before swapping defaults:

- [ ] Visual side-by-side on all four palettes (phosphor and others) — record
      10s loops of both engines, diff in a video editor.
- [ ] Space-bar boost doubles density and new columns enter from top
- [ ] `T` cycles palettes and colors change immediately
- [ ] Arrow keys (if we keep them) still adjust column count
- [ ] Resize still works — grid cols/rows recompute, aspect stays square
- [ ] `MatrixEffects` post-processing composites correctly on top
- [ ] `check:matrix-visible` Chromium test passes
- [ ] No WebGL errors or warnings in console
- [ ] Fallback path when `isWebGL2 === false`: either render
      `MatrixRain` (instanced engine) or show a static "Matrix" logo. Do
      not ship a broken shader path on old hardware.

### 5.11 Performance targets

- Windows + GTX 1060 at 1440p DPR 1.25: ≥60 fps sustained
- Linux dGPU at 1440p DPR 1.5: ≥60 fps sustained
- Apple Silicon at 2560×1600 DPR 2: ≥60 fps sustained
- Integrated Intel UHD 620 (thinkpad baseline): ≥40 fps at `low` tier

Measure with the `?perf=1` harness from the top of this doc.

### 5.12 Risks and mitigations

- **Visual drift from the instanced original.** The shader engine is
  deterministic per `(col, row, time)` which actually makes it *more* stable
  than the JS simulation. But that stability may read as less "alive". If so,
  add a second low-frequency noise term to `glyphKey` based on row (not just
  scrambleSlot) to introduce slow per-row drift.
- **Hash collisions visible as patterns.** If the `hash21` output shows banding
  on some GPUs, swap to a two-step hash (hash the hash) or upload a
  `uint8` noise texture and sample it instead. Noise texture is 256×256 = 64 kB
  one-time upload.
- **Float textures unavailable.** Guard behind WebGL2 + `OES_texture_float`
  check. Without float textures, pack head position into two `RGBA8` channels
  (high 8 bits + low 8 bits) and reconstruct in the shader. Adds ~20 lines of
  unpacking code; still trivial.
- **Post-processing breaks.** `MatrixEffects` uses the default
  `EffectComposer` render pass which reads the rendered scene. Because the
  shader engine still writes to the default framebuffer at the correct depth,
  this should just work — but verify bloom / scanlines look the same.

### 5.13 Exit criteria

- All items in 5.10 pass.
- Performance targets in 5.11 met on reference machines.
- Behind `?engine=shader` flag for one week of dogfooding.
- Flip default to shader engine; keep `?engine=instanced` as a long-term
  escape hatch. Do not delete `MatrixRain.tsx` — it's the reference
  implementation and the fallback for non-WebGL2 clients.

---

## Verification checklist (run after each win)

- [ ] `npm run build` at repo root passes
- [ ] `npm --prefix visualizations/matrix run build` passes
- [ ] `npm --prefix visualizations/matrix run lint` passes
- [ ] `npm run check:matrix-visible` passes (green glyphs still render)
- [ ] FPS baseline captured on all three reference machines
- [ ] Visual diff vs. pre-change recording on each palette (phosphor + others)
- [ ] OrbitControls pan/zoom still works
- [ ] Space-bar rainBoost still doubles column count and starts columns from top
- [ ] `T` cycles palettes
- [ ] Arrow keys still adjust `activeColumnsRef` (unless intentionally removed)
- [ ] HUD shows expected DPR/tier/fps

---

## Results table

Fill in as wins land. Format: `median fps / 1% low fps @ GPU ms`.

| Machine              | Baseline | After W1 | After W2 | After W3 | After W4 | After W5 |
|----------------------|----------|----------|----------|----------|----------|----------|
| Apple Silicon        |          |          |          |          |          |          |
| Linux dGPU           |          |          |          |          |          |          |
| Windows + GTX 1060   |          |          |          |          |          |          |
