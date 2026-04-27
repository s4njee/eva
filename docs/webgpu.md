# WebGPU Migration — Matrix Rain

This doc tracks the phased migration of the Matrix rain visualization from WebGL to WebGPU compute shaders. Read the [Matrix doc](matrix.md) first for scene architecture.

---

## Motivation

The Matrix rain instanced path ([MatrixRain.tsx](../visualizations/matrix/src/text-rain/MatrixRain.tsx)) runs an 8000-column JS simulation loop every frame and uploads up to ~11 MB/s of staged attribute data to the GPU. Moving the simulation to a WebGPU compute shader eliminates the CPU loop and the buffer upload cost entirely.

Perf signal: `uploadedBytesPerFrame` in the `onPerfStats` callback (visible with `?perf=1`) measures the upload cost directly. After Phase 3 it should drop to 0.

Browser support: WebGPU is available in Chrome 113+ and Edge 113+. Safari 17 supports the API surface but lacks compute shaders. The WebGL path is kept as a fallback indefinitely.

---

## Phase Status

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | WebGPURenderer feature flag — verify scene renders | **Done** |
| 2 | Move SimulationState into GPU storage buffers | **Done** |
| 3 | Compute shader replaces CPU simulation loop | **Done** |
| 4 | Vertex shader reads storage buffers directly | Pending |
| 5 | Post-processing re-enabled under WebGPU | Pending |

---

## Phase 1 — WebGPURenderer feature flag

**Goal:** Render the existing scene with `THREE.WebGPURenderer` instead of `WebGLRenderer`. No simulation changes. Establishes the wiring before any compute work begins.

### What changed

**`src/shared/webgl/SafeCanvas.tsx`**
- Added `isWebGPUSupported()` helper (`navigator.gpu` check).
- Added `webgpuEnabled?: boolean` prop to `SafeCanvasProps`.
- When `webgpuEnabled && isWebGPUSupported()`: renders a Canvas with an async `gl` factory that dynamically imports `three/webgpu`, constructs `WebGPURenderer`, calls `renderer.init()`, and returns the renderer. Bypasses the WebGL probe entirely.
- When `webgpuEnabled` is true but WebGPU is not supported: falls through to the existing WebGL path silently.

**`visualizations/matrix/src/text-rain/App.tsx`**
- Added `getMatrixWebGPUEnabled()` — reads `?webgpu=1` from the URL.
- Passes `webgpuEnabled={webgpuEnabled}` to `SafeCanvas`.
- Gates `<MatrixEffects>` behind `!webgpuEnabled` — `@react-three/postprocessing` creates `WebGLRenderTarget`s and will throw under `WebGPURenderer` until Phase 5.

### How to test

```bash
# Start standalone Matrix dev server
npm --prefix visualizations/matrix run dev

# Open in Chrome 113+
http://localhost:5173/?webgpu=1

# Expected: scene renders identically to WebGL (rain glyphs visible, camera orbits)
# Expected: no post-processing effects (bloom, chromatic aberration etc. are off)
# Expected: browser DevTools > GPU shows "WebGPU" adapter active

# Test fallback: open in Firefox (no WebGPU) — should render normally via WebGL
```

### Known limitations in Phase 1

- No adaptive DPR — uses R3F/browser default pixel ratio. AdaptiveDprBridge is not wired in the WebGPU path.
- No post-processing (MatrixEffects skipped).
- No compute work — the CPU simulation loop still runs. `uploadedBytesPerFrame` is unchanged.
- TypeScript casts (`as any`) around the async `gl` factory and `WebGPURenderer` constructor will be removed when Three.js ships first-class R3F types for the WebGPU path.

---

## Phases 2 & 3 — GPU storage buffers + compute shader (combined)

**Status: Done**

Phases 2 and 3 were implemented together in `MatrixRainCompute.tsx`, a new engine activated with `?engine=webgpu`.

### What was built

**`visualizations/matrix/src/text-rain/MatrixRainCompute.tsx`**
- New component: same rendering approach as `MatrixRainShader` (instanced column strips + fragment-shader glyph lookup from a state texture).
- Simulation state (`vec4<f32>` per column per stream: head, trail, phase, speed) lives in a `GPUBuffer` with `STORAGE | COPY_DST` usage.
- A WGSL compute shader (`@workgroup_size(64)`, one thread per column) runs the full simulation: head advancement, reset logic, boost stream seeding. Uses GPU-side `hash21` for RNG.
- Per-frame: `dispatchCompute()` submits a compute pass, then `readStateBack()` async-copies the state buffer back to CPU for the `DataTexture` bridge (the fragment shader still reads from a `DataTexture`).
- `uploadedBytesPerFrame` reports 0 — the simulation is GPU-resident.

**`visualizations/matrix/src/text-rain/App.tsx`**
- `MatrixRainEngine` type extended: `'instanced' | 'shader' | 'webgpu'`.
- `?engine=webgpu` selects the compute engine.
- Engine selection JSX updated to three-way branch.

### How to test

```bash
npm --prefix visualizations/matrix run dev
# Open in Chrome 113+:
http://localhost:5173/?engine=webgpu&webgpu=1

# Expected: rain renders identically to ?engine=shader
# Expected: uploadedBytesPerFrame = 0 in ?perf=1 stats
# Expected: CPU useFrame body is minimal (dispatch + readback, no JS loop)
```

### Current limitations (Phase 4 will address)

- Async readback via `mapAsync` introduces a one-frame latency on the state texture update. Visually imperceptible at 60fps.
- The fragment shader still reads from a `DataTexture` rather than a storage buffer directly. Phase 4 will eliminate the readback entirely by having the vertex/fragment shader read the storage buffer.
- `resetAfter` is derived from a stable hash in the compute shader rather than stored separately, which gives slightly different reset timing than the CPU path.

---

## Phase 2 (original design notes) — Move SimulationState into GPU storage buffers

The notes below were the original Phase 2 design. The actual implementation combined Phases 2 and 3 into `MatrixRainCompute.tsx`.

**Goal:** Allocate the simulation state (`acc`, `headY`, `trail`, `speed`, `phase`, `resetAfter`, `cellOn`, `cellAge`, `cellChar`) as WebGPU `GPUBuffer`s with `STORAGE | COPY_DST` usage. Also allocate output buffers for `uv`, `col`, `opa` with `STORAGE | VERTEX` usage. CPU still writes initial values; per-frame updates still happen on CPU. The render path reads from these buffers instead of `InstancedBufferAttribute`s.

### Key facts

Simulation state (per column, 8000 cols):

| Array | Type | Size |
|-------|------|------|
| `acc` | Float32 | 32 KB |
| `headY` | Int16 → i32 | 32 KB |
| `trail` | Uint8 → u32 | 32 KB |
| `speed` | Float32 | 32 KB |
| `phase` | Float32 | 32 KB |
| `resetAfter` | Uint16 → u32 | 32 KB |

Cell state (per cell, 1.2M cells):

| Array | Type | Size |
|-------|------|------|
| `cellOn` | Uint8 → u32 | 4.8 MB |
| `cellAge` | Uint8 → u32 | 4.8 MB |
| `cellChar` | Uint8 → u32 | 4.8 MB |

Output buffers (per cell):

| Buffer | Type | Size |
|--------|------|------|
| `outUV` | Float32 × 2 | 9.6 MB |
| `outCol` | Float32 × 3 | 14.4 MB |
| `outOpa` | Float32 × 1 | 4.8 MB |

### Implementation notes

- Access the `GPUDevice` from `useThree().gl.backend.device` (Three.js WebGPU backend exposes the device).
- Allocate buffers once in `useMemo`; upload initial values with `device.queue.writeBuffer()`.
- Per-frame: CPU still computes dirty columns and calls `writeBuffer()` for each run. The `addUpdateRange` pattern maps to `writeBuffer(buffer, byteOffset, data, dataOffset, size)`.
- The `InstancedBufferAttribute` approach on the geometry is replaced with manual storage buffer binding. Use Three.js `StorageBufferAttribute` (available in `three/webgpu`) to attach storage buffers as vertex attributes.

---

## Phase 3 — Compute shader replaces CPU simulation loop

**Goal:** Write a WGSL compute shader that runs the entire column simulation on the GPU. The CPU loop in `useFrame` is removed. One `computeAsync()` call per frame replaces it.

### Compute shader design

- Workgroup size: `@workgroup_size(64)` — one thread per column.
- Dispatch: `Math.ceil(COLUMN_COUNT / 64)` = 125 workgroups.
- Bindings: all state buffers from Phase 2 (read_write for simulation state, write-only for output buffers).
- Uniforms: `dt`, `time`, `frame` (u32 for RNG seed), `ROWS`, `CHAR_COUNT`, palette colors.

**RNG:** Replace `Math.random()` with a fast GPU hash seeded by `(col, frame)`. The `hash21` function already used in `MatrixRainShader.tsx` is a good starting point:

```wgsl
fn hash21(p: vec2<f32>) -> f32 {
  var q = fract(p * vec2<f32>(0.1031, 0.1030));
  q += dot(q, q.yx + 33.33);
  return fract((q.x + q.y) * q.x);
}
```

**Simulation steps per thread (= per column):**

1. `acc[col] += speed[col] * dt`
2. If `acc[col] >= 1.0`: `acc[col] -= 1.0`, `headY[col] += 1`
   - Loop rows 0..ROWS-1: age cells, discard if age > trail, spawn new head
   - Randomly re-scramble ~50% of glyph indices (matches current JS logic)
   - Check reset condition; reset if head has scrolled past end + `resetAfter`
3. Write `outUV`, `outCol`, `outOpa` for all cells in this column

### Integration with R3F

```tsx
// In MatrixRain.tsx useFrame:
const { gl } = useThree()
// gl is WebGPURenderer when webgpuEnabled; computeAsync dispatches the shader
await gl.computeAsync(simulationCompute)
// Then render as normal — storage buffers are already updated on the GPU
```

Three.js `ComputeNode` (from `three/webgpu`) wraps a WGSL function and its bindings into a dispatchable compute pass.

---

## Phase 4 — Vertex shader reads storage buffers directly

**Goal:** Replace `InstancedBufferAttribute` vertex attributes with direct storage buffer reads in the vertex shader. Eliminates the last CPU→GPU data path.

### Vertex shader change

The current vertex shader reads per-instance attributes:
```glsl
attribute vec2 aUvOff;
attribute vec3 aCol;
attribute float aOpa;
```

Under WebGPU, these become storage buffer reads indexed by `gl_InstanceID`:

```wgsl
@group(1) @binding(0) var<storage, read> outUV:  array<f32>; // 2 floats per instance
@group(1) @binding(1) var<storage, read> outCol: array<f32>; // 3 floats per instance
@group(1) @binding(2) var<storage, read> outOpa: array<f32>; // 1 float per instance

fn vertex(..., @builtin(instance_index) inst: u32) {
  let uvOff = vec2(outUV[inst*2], outUV[inst*2+1]);
  let rgb   = vec3(outCol[inst*3], outCol[inst*3+1], outCol[inst*3+2]);
  let opa   = outOpa[inst];
  ...
}
```

The `meshPerAttribute=ROWS` pattern for column-level data is handled by indexing `floor(inst / ROWS)` in the shader.

### Expected result after Phase 4

- `uploadedBytesPerFrame` → 0
- CPU `useFrame` body reduced to: dispatch compute, render frame
- No JS loop, no staged buffer writes

---

## Phase 5 — Post-processing re-enabled under WebGPU

**Goal:** Re-enable `MatrixEffects` (bloom, chromatic aberration, etc.) under the WebGPU path.

This depends on `@react-three/postprocessing` / `postprocessing` adding WebGPU support, or replacing the effect stack with Three.js native `PostProcessing` node (available in `three/webgpu` as `PostProcessing`).

The Three.js `PostProcessing` node-based path supports WebGPU natively and can replicate all current effects. Migration involves replacing the `<EffectComposer>` JSX with Three.js `PostProcessing` + node passes.

Remove the `!webgpuEnabled` guard in `App.tsx` once this is done.

---

## Architecture notes

- The WebGL path (`webgpuEnabled=false`) must continue to work indefinitely. Safari and any browser without WebGPU support falls back to it automatically.
- `SafeCanvas.tsx` owns the renderer selection. No other file needs to know which renderer is active.
- After Phase 4, `MatrixRain.tsx` will branch internally: WebGPU path uses compute + storage buffer vertex reads; WebGL path keeps the existing `InstancedBufferAttribute` + CPU loop. Branch on `useThree().gl instanceof WebGPURenderer`.
- TypeScript: Three.js `three/webgpu` types are still maturing. Expect `as any` casts in the WebGPU-specific code paths until upstream types stabilize.

---

## Related files

| File | Role |
|------|------|
| `src/shared/webgl/SafeCanvas.tsx` | Renderer selection (`webgpuEnabled` prop) |
| `visualizations/matrix/src/text-rain/App.tsx` | `?webgpu=1` flag, passes prop to SafeCanvas |
| `visualizations/matrix/src/text-rain/MatrixRain.tsx` | Instanced simulation (Phases 2–4 target) |
| `visualizations/matrix/src/text-rain/MatrixRainShader.tsx` | Shader simulation (Phase 3 alt target) |
| `visualizations/matrix/src/text-rain/matrix-atlas.ts` | Character atlas (unchanged by WebGPU) |
