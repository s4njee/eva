# Monolith — Ideas for Making It More Dynamic & Engaging

---

## Interaction

- **Mouse/touch hover reactions** — models subtly lean toward or track the cursor. Could use a spring-damped rotation offset applied in the render loop so it feels organic, not robotic.
- **Click-to-pose / click-to-emote** — clicking the model triggers a short canned animation (wave, attack pose, spin). Works especially well for the animated set 3 EVAs.
- **Drag-to-spin** — let the user flick the model into a fast spin that decays with friction, separate from OrbitControls camera rotation. Feels tactile.
- **Scroll-driven set transitions** — instead of (or alongside) Tab, scrolling vertically morphs between sets with a smooth camera dolly and crossfade.
- **Swipe gestures on mobile** — left/right swipe to change models, up/down to change sets. Currently keyboard-only navigation is invisible to phone visitors.
- **Double-tap to zoom** — snap the camera to a close-up of the model's face/head, then double-tap again to return.

## Visual Flair

- **Entrance animations** — new models don't just pop in. They could glitch-assemble (scatter triangles that converge), rise from below the floor plane, or fade in with a bloom flash.
- **Idle breathing / sway** — a subtle sine-wave Y offset and slight rotation oscillation on idle models so nothing ever feels frozen.
- **Dynamic camera drift** — a very slow, looping camera orbit when the user isn't touching controls. Stops the moment they interact, resumes after ~5s of inactivity.
- **Parallax background layers** — add a subtle starfield or particle depth layer behind the model that shifts with camera movement for a sense of depth.
- **Reactive particles** — the existing particle system (lighting mode B) could react to cursor position, parting around the pointer or accelerating near it.
- **Beat-reactive lighting** — if you ever add audio, pulse the lighting rig or bloom intensity to the beat. Even without audio, a slow synthetic "heartbeat" pulse on the ambient light would add life.
- **Per-model signature color** — each model gets a subtle accent color that tints the ambient or rim light, making every swap feel distinct beyond just the geometry change.

## Atmosphere & Environment

- **Environment presets** — let the user pick from a few moods (void, city night, sunset, neon alley) that swap the HDRI/background and adjust lighting style to match.
- **Day/night cycle** — a slow automatic transition between warm and cool lighting over ~60s, giving the scene a living quality.
- **Weather effects** — light rain particles, floating dust motes, or subtle fog that drifts through the scene. Toggled per-set or as a global option.
- **Floor reflections** — a reflective ground plane (or screen-space reflection) beneath the model. Especially dramatic with the neon and dualRing lighting styles.

## Storytelling & Discovery

- **Model info cards** — a small expandable panel with lore, character name, series, and fun facts. Slides in from the side on model load, dismissible.
- **Set intro sequences** — the first time a user enters a set, play a short ~2s choreographed camera move + text reveal (like the EVA title overlays but for every set).
- **Hidden interaction easter eggs** — e.g., clicking a specific model 3 times triggers a secret animation or unlocks a hidden set. Reward curiosity.
- **"Showcase" autoplay mode** — cycles through every model with timed transitions, camera moves, and effect toggles. A screensaver / demo reel for the whole collection.
- **Shareable snapshots** — a camera button that captures the current view (model + effects + lighting) as a PNG and copies it or opens a share dialog.

## Audio

- **Ambient soundscapes per set** — a quiet background hum, wind, or synth pad that changes with the active set. Muted by default, toggled with a speaker icon.
- **Transition sound effects** — a soft whoosh or glitch sound on model/set switch. Reinforces the visual transition.
- **Interaction feedback sounds** — subtle click/tap sounds on button presses and hotkey activations.

## Performance-Aware Enhancements

- **Progressive detail reveal** — load the low LOD instantly, then swap to medium/high in the background. The user sees something immediately and it sharpens over a second.
- **Reduced-motion mode** — detect `prefers-reduced-motion` and disable camera drift, particle effects, and entrance animations automatically.
- **Lazy set preloading** — after the current set is loaded and idle, quietly preload the next set's default model so switching feels instant.

## Social / Engagement

- **Visitor counter or "currently viewing"** — a subtle live count of other visitors on the page (via a lightweight websocket or Cloudflare Durable Object).
- **Favorite / bookmark models** — persist favorites in localStorage, surface a "your picks" mini-set.
- **Randomize button** — a dice icon that picks a random set + model + effect combo. Fun for repeat visitors.
