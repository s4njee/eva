# Performance Roadmap

> Last reviewed: 2026-04-12

This branch is for making the site feel fast on low-end hardware, especially a Raspberry Pi 5
running the app through Cloudflare Pages.

The goal is not "more optimization" in the abstract. The goal is:

- keep frame time stable
- reduce fill rate and post-processing cost
- lower CPU work per frame
- shorten first render / first interaction time
- make the low-end fallback path obvious and testable

This document is the performance-specific companion to `ToDo.md`.

## Test Target

- Primary test device: Raspberry Pi 5
- Primary test path: Cloudflare Pages deployment from the `performance` branch
- Primary success metric: the site stays visibly smooth and usable without manual tuning

## Measurement Plan

- Record FPS and quality tier while testing real scenes
- Compare the same scene with and without bloom / chromatic / x-ray effects
- Test first-load behavior separately from cached revisits
- Measure both interactive camera motion and idle animation
- Keep a note of the scene, model, branch, and browser when reporting a result

## Cross-Cutting Ideas

- **Implemented:** Add a `failIfMajorPerformanceCaveat` probe in `SafeCanvas` so obviously weak GPU contexts fall
  into a low-quality path immediately instead of waiting for frame samples
- **Implemented:** Lower the default DPR ceiling in `SafeCanvas` so scenes do not start too aggressively on weak
  hardware
- **Implemented:** Make the DPR ladder more conservative on low-end devices, with a lower ceiling and faster
  step-down
- **Implemented:** Add a sub-1.0 DPR step (e.g. 0.75×) to `buildAdaptiveDprSteps` — the ladder currently
  floors at 1.0, so a Pi 5 with native DPR 1.0 has no room to step down. A 0.75× tier gives the
  adaptive logic somewhere to go under sustained frame pressure
- **Implemented:** Disable antialiasing by default on the heaviest scenes unless the device clearly has headroom
- **Implemented:** Keep `powerPreference: 'high-performance'` on all 3D canvases that should favor the GPU path
- **Implemented:** Make the shared effect stack cheaper on low tier by skipping full post-processing sooner
- Keep the low-tier path visually acceptable, but prefer clear motion over expensive polish
- **Implemented:** Add a small hidden debug overlay with FPS, DPR, quality tier, and active scene info
- **Implemented:** `FrameRateSnapshot` is missing the current DPR — the HUD goal already lists DPR as an
  output, but `FrameRateSnapshot` does not carry it. `AdaptiveDprBridge` would need to publish
  the current DPR alongside the FPS so `FrameRateHud` can display it without a separate prop
- **Implemented:** `FrameRateMonitor` publishes unconditionally — the skip condition
  `currentSnapshot.frameCount === nextSnapshot.frameCount` is always false because `frameCount`
  increments every frame. This causes a React state update every 400 ms even when FPS and tier
  are stable, triggering unnecessary downstream re-renders. Replace `frameCount` in the skip
  condition with a stable field (e.g. compare only `qualityTier` and an FPS delta band)
- **Implemented:** Pause or throttle rendering when the tab is backgrounded — none of the scenes use the Page
  Visibility API (`document.visibilitychange`). On a Pi 5 the GPU runs at full rate even when the
  browser is behind another window. Suspending the `useFrame` loop or dropping to a minimal idle
  tick when `document.hidden` is true would meaningfully reduce idle power draw
- Test the same branch in both cached and uncached browser sessions

## Monolith Ideas

### Load Path

- Persist the last-used set and model in `localStorage`
- Skip the fade delay when a model is already cached in-session
- Clear all pending `setTimeout` callbacks during teardown
- Bound the in-memory model cache so it cannot grow forever
- Dispose of evicted geometry, textures, and materials when the cache drops an entry
- Preload the next likely model in a set after the current one settles

### Rendering

- Lower the default renderer cost by disabling antialiasing on weak hardware
- Cap texture anisotropy on low tier instead of always using the renderer maximum
- Reduce the canvas DPR ceiling for Monolith more aggressively than for lighter scenes
- Only update expensive x-ray animation work while x-ray is actually enabled
- Throttle the per-frame lighting work more aggressively on low-end devices
- Avoid full-scene refreshes when the current lighting state has not changed
- **Skip particle geometry GPU uploads in Mode A** — `animateParticlePositions` sets
  `positions.needsUpdate = true` every frame even when `particles.visible === false`. The buffer
  upload is wasted. Guard the needsUpdate write behind `if (particles.visible)`
- **Remove glow PointLights from the scene graph when not in Mode B** — all 6 glow lights sit in
  the scene with `intensity = 0` during Mode A. Three.js still evaluates zero-intensity lights in
  shader uniforms. Calling `scene.remove(light)` / `scene.add(light)` at mode transitions
  eliminates them from the draw-call light count entirely

### Scene Complexity

- Drop particle count from 5000 to a much smaller tier on low-end hardware
- Reduce the number of glow lights used in particle lighting mode
- Update particle colors and proximity glow less often under frame pressure
- Prefer the static lighting mode as the default on weak devices
- Turn off or simplify cinematic bloom oscillation when the frame budget is tight
- Prefer simpler post-processing combinations over stacking several heavy passes

### Assets

- **Implemented:** Ship lower-poly or decimated GLB variants for the heaviest models
- **Implemented:** Use model LODs or device-aware model variants for expensive sets
- **Implemented:** Compress textures with KTX2 / Basis instead of relying only on geometry compression
- Lazy-load large environment assets like HDRIs if they are not needed immediately
- Keep mirrored assets in both public trees, but avoid unnecessary duplicate weight where possible

### UI / UX

- Persist the current scene state so repeat visits avoid replaying heavy startup work
- Make the progress UI cheaper to render and easier to dismiss
- Keep overlay effects lightweight and avoid unnecessary blur on weak hardware
- Make the debug controls easy to disable in performance mode

## Matrix Ideas

### Simulation

- Reduce the active column count dynamically based on rolling frame time
- Shrink the default backing buffer size instead of allocating the full theoretical maximum
- Make the default active column count smaller on hardware that fails the performance caveat probe
- Centralize all simulation constants into a single config object so low-end tuning is easier
- Replace hardcoded trail colors with named palette constants so palettes can be simplified or
  swapped more cheaply

### Loading

- Move atlas construction off the critical render path
- Build the atlas after first paint or inside a worker if it remains expensive
- Keep the scene hidden or lightweight until the atlas is ready

### Rendering

- Lower DPR further on low-end hardware if frame pacing still suffers
- Reduce effect cost before reducing visible motion
- Offer a pure canvas fallback path for devices that cannot keep the instanced 3D version smooth
- Add URL-driven presets so a low-end device can land directly on a cheaper configuration
- **Cap the simulation `dt` in `useFrame`** — the rain advances by `speed × dt` each frame with
  no upper bound, so a 120 Hz display does twice as much CPU work as 60 Hz for the same visual.
  Clamping `dt` to `1/30` self-throttles the simulation on high-refresh displays without
  impacting perceived motion at 60 fps
- **Re-enable the quality-tier column cap** — the low-tier threshold switch in `MatrixRain.tsx`
  (lines 359–362) is commented out pending Pi 5 validation. Once frame data confirms the
  threshold works, uncomment it; this is the cheapest density reduction available and requires no
  additional code

### Validation

- Keep the existing `check:matrix-visible` flow as the baseline smoke test
- Add a small benchmark readout for FPS and active columns in a hidden debug overlay
- Test the same branch on actual low-end hardware rather than relying only on desktop throttling

## Atom Ideas

### Atom Rendering

- Batch bond draw calls so larger molecules do not multiply draw-call count
- Reduce cinematic bond lights or disable them automatically on low tier
- Default to the cheaper render mode when the frame rate drops
- Lower DPR and disable antialiasing on weak hardware
- Consolidate frame hooks where possible so the scene does not do duplicated per-frame work

### Complexity Guardrails

- Add a maximum atom count guard for PubChem-loaded molecules
- Fail fast with a clear error instead of attempting to render a molecule that is too large
- Treat the bond-heavy molecules as the main stress case when tuning

### Visual Tradeoffs

- Prefer simpler orbit/trail visuals over extra glow layers when the device is struggling
- Keep x-ray and cinematic variants available, but make them opt-in under low-end conditions
- Add a device-aware default preset so the first view is not the most expensive one

## Shared Effect Stack Ideas

- Skip bloom and other heavy passes entirely when the quality tier is low
- Keep chromatic aberration and scanline logic off the main cost path when possible
- Avoid instantiating expensive fullscreen effects unless they are actually active
- **`SharedEffectStack` allocates all ~10 effect objects unconditionally on mount** (via
  `useMemo`) even when most are never enabled. On low-end hardware this wastes memory and mount
  time. Lazily instantiate each effect only when its enabled flag first turns true and hold it in
  a `useRef`; skip the `useMemo` for effects that are off at startup
- Make it easy to swap in lighter scene-only rendering when post-processing is not worth the cost

## GPU / Shader Ideas

The Pi 5's VideoCore VII GPU is meaningfully more capable than its CPU at parallel work, but the
current scenes push a lot of animation work through JavaScript. These ideas shift that balance.

### EffectComposer Render Targets

- **Implemented:** Set `multisampling={0}` on `EffectComposer` — the current `<EffectComposer>` has no
  `multisampling` prop, so it uses the library default (often 8). MSAA on a render target is very
  expensive on fill-rate-limited GPUs like the VideoCore VII. Setting `multisampling={0}` is a
  one-line change and likely the cheapest GPU win available
- **Implemented:** Set `resolutionScale={0.5}` on low tier — `EffectComposer` supports a `resolutionScale`
  prop that renders all post-processing passes to a half-size target before upsampling. This cuts
  bloom, chromatic aberration, barrel blur, and every other active pass to one-quarter the fill
  cost. Pass `resolutionScale={qualityTier === 'low' ? 0.5 : 1}` from `SharedEffectStack` when
  the composer is rendered; the upsampling artefact is barely visible at normal viewing distances

### Monolith Particles

The particle system currently runs a 5000-element JS loop every frame to update positions and a
second 5000-element loop every 4 frames to recompute colors, then uploads two `Float32Array`
buffers to the GPU. The Pi's JavaScript engine handles this serially.

- **Implemented:** Move particle position animation to a vertex shader — store initial X/Y/Z and per-particle
  velocity as static vertex attributes (written once at init). Replace `animateParticlePositions`
  with a `ShaderMaterial` that computes current position as:
  ```glsl
  float currentY = mod(aInitialY - uTime * aVelocity, 26.0) - 1.0;
  float currentX = aInitialX + sin(uTime + float(gl_VertexID) * 7.13) * 0.002;
  vec3 pos = vec3(currentX, currentY, aInitialZ);
  ```
  No JS loop, no `needsUpdate`, no buffer upload per frame. The GPU runs 5000 vertices in
  parallel in microseconds
- **Implemented:** Move particle color to the fragment shader — instead of computing `setHSL` for each
  particle in JS and uploading a color buffer, compute HSL → RGB in the fragment shader from
  `uTime`, `gl_VertexID`, and a `uHueType` uniform. Eliminates the color array entirely
- **Implemented:** Switch from `PointsMaterial` to a `ShaderMaterial` — `PointsMaterial` does not support
  custom vertex attribute animation. A `ShaderMaterial` on the same `THREE.Points` geometry
  enables both optimizations above; the star texture can be passed as a `sampler2D` uniform and
  sampled via `gl_PointCoord`

### Matrix Rain

The `useFrame` loop in `MatrixRain.tsx` writes up to 2000 × 150 = 300,000 instance matrices,
UV offsets, colors, and opacity values every frame from JavaScript. This is the scene's main
CPU bottleneck and scales linearly with column count.

- **Make column y-position time-driven in the vertex shader** — column seed data (x, z, speed,
  size, phase, trail length) is already static after `seedColumn`. Store these as per-instance
  attributes that never change. In the vertex shader, compute `headY` from
  `uTime × speed + phase` modulo row count, and compute per-cell opacity from the derived age.
  This makes the instance matrix writes for position deterministic and potentially eliminates the
  inner column loop entirely
- **Keep character index changes as the only JS-side update** — the random glyph scramble
  (`cellChar` updates) is non-deterministic and must stay CPU-driven. With position/opacity moved
  to the shader, the only buffer uploads per frame would be the `aUvOff` attribute for
  the active columns that scrambled this tick — a much smaller dirty range
- **Use a small data texture for column state** — encode per-column `headY`, `trail`, `cellOn`,
  and `cellChar` as RGBA pixels in a `DataTexture` of size `(COLUMN_COUNT, ROWS)`. The vertex
  shader samples it by instance ID to get cell state. Updating only the changed pixels keeps
  texture uploads small; the GPU reads the rest without any JS work

### Shared / Cross-Cutting

- **Atom bonds are already GPU-driven** (`GPU_TRAIL_VERTEX_SHADER` in `core.jsx`) — no action
  needed there. The remaining draw-call cost is from per-bond React components, not shader cost
- **WebGPU detect-and-use** — the Pi 5 runs Chromium with WebGPU enabled (Vulkan 1.2 backend).
  `navigator.gpu` is available in current Pi OS Chromium builds. A WebGPU compute shader could
  run the full particle simulation on the GPU with no JS read-back, eliminating both the JS loop
  and the buffer upload entirely. Long-term option; `THREE.WebGPURenderer` is the migration path

## Deployment / Testing Ideas

- Deploy the `performance` branch to Cloudflare Pages as a repeatable test target
- Keep a branch-specific preview deployment for Raspberry Pi 5 validation
- Compare the same commit in local dev, Cloudflare Pages, and the Pi 5 browser
- Record which branch and which scene were used for each test note
- Use a clean cached revisit test after a full cold-load test

## Priority Order

1. Reduce renderer cost first: DPR, antialiasing, and post-processing
   — `multisampling={0}` and `resolutionScale={0.5}` on `EffectComposer` are the cheapest GPU wins
2. Reduce Monolith CPU and fill-rate cost next: particles, glow lights, and lighting updates
   — time-driven vertex shader for particles eliminates the main JS loop in Mode B
3. Reduce Matrix JS loop cost: dt capping, re-enable tier column cap, then shader-driven position
4. Reduce load time and first interaction cost: caching, fades, atlas work, and asset weight
5. Add low-end guardrails for Matrix and Atom so they fail gracefully instead of stuttering
6. Keep Cloudflare Pages deploys and Pi 5 testing in the loop for every meaningful change

## Notes

- This file is intentionally broader than `ToDo.md`; it collects performance-specific ideas even if
  they overlap with visual or UX work.
- Some ideas are tradeoffs, not pure wins. Keep the low-end branch explicit so we can choose
  performance over fidelity without surprising the main site.
- If a new optimization changes scene behavior, update the relevant scene docs as well.
