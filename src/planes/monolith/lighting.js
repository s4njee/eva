import * as THREE from 'three';
import { resolveAssetUrl } from './asset-url.js';

const PARTICLE_VERTEX_SHADER = /* glsl */ `
  attribute float aVelocity;
  attribute float aSeed;

  uniform float uTime;
  uniform float uPointSize;

  varying float vSeed;
  varying float vFlicker;

  void main() {
    float currentY = mod(position.y - (uTime * aVelocity), 26.0) - 1.0;
    float currentX = position.x + sin((uTime * 0.9) + aSeed) * 0.08;
    vec3 animatedPosition = vec3(currentX, currentY, position.z);
    vec4 mvPosition = modelViewMatrix * vec4(animatedPosition, 1.0);

    vSeed = aSeed;
    vFlicker = 0.65 + (0.35 * sin((uTime * 3.0) + (aSeed * 7.13)));
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = uPointSize * (12.0 / max(1.0, -mvPosition.z));
  }
`;

const PARTICLE_FRAGMENT_SHADER = /* glsl */ `
  uniform sampler2D uTexture;
  uniform float uHueType;
  uniform float uTime;

  varying float vSeed;
  varying float vFlicker;

  vec3 hsl2rgb(vec3 c) {
    vec3 rgb = clamp(abs(mod(c.x * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return c.z + c.y * (rgb - 0.5) * (1.0 - abs(2.0 * c.z - 1.0));
  }

  void main() {
    vec4 texel = texture2D(uTexture, gl_PointCoord);
    float alpha = texel.a * texel.r;
    if (alpha < 0.02) discard;

    float baseHue = 0.0;
    float saturation = 0.0;
    if (uHueType > 1.5) {
      baseHue = mod((uTime * 0.1) + (vSeed * 0.013), 1.0);
      saturation = 1.0;
    } else if (uHueType > 0.5) {
      baseHue = 0.04 + sin(uTime) * 0.02 + sin(uTime * 2.3) * 0.01;
      saturation = 1.0;
    }

    vec3 color = hsl2rgb(vec3(baseHue, saturation, 0.45 + (vFlicker * 0.3)));
    gl_FragColor = vec4(color, alpha * 0.85);
  }
`;

// ── Lighting rig ──────────────────────────────────────────────────────────────
// Creates and animates all Three.js lights used by MonolithScene.
// Two lighting modes are supported:
//   Mode A (Scene)     — a static backdrop of directional/spot/street lights,
//                        style selected by the active model collection definition.
//   Mode B (Particles) — 5000 shader-driven falling sprites with a small
//                        falling PointLight rig around the model.
//
// The returned object exposes only the methods MonolithScene needs;
// all internal light instances and buffers are fully encapsulated.

export function createLightingRig({ scene, currentSetDef, getCurrentModelIndex, getMonolith, guiParams }) {
  // ── Animation constants ─────────────────────────────────────────────────────
  const RING_TOP = 8;        // World-space Y where a moving ring light starts
  const RING_BOTTOM = -3;    // World-space Y where it exits the frame
  const RING_RANGE = RING_TOP - RING_BOTTOM;
  const RING_SPEED = 0.0004; // Normalised units per ms

  // ── Particle system (Lighting mode B) ──────────────────────────────────────
  // 5000 falling point-sprites that drift downward and wrap at y=-1.
  // A separate lightweight PointLight rig provides real lighting on the model.
  const ambient = new THREE.AmbientLight(0xffffff, 0);
  scene.add(ambient);

  const particleCount = 5000;
  const particleGeo = new THREE.BufferGeometry();
  const particlePositions = new Float32Array(particleCount * 3);
  const velocities = new Float32Array(particleCount);
  const particleSeeds = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) {
    particlePositions[i * 3] = (Math.random() - 0.5) * 30;
    particlePositions[i * 3 + 1] = Math.random() * 25;
    particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 30;
    velocities[i] = 1.2 + Math.random() * 2.6;
    particleSeeds[i] = Math.random() * 1000;
  }
  particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
  particleGeo.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 1));
  particleGeo.setAttribute('aSeed', new THREE.BufferAttribute(particleSeeds, 1));

  const particleTexture = new THREE.TextureLoader().load(resolveAssetUrl('/textures/star_02.png'));
  const particleMat = new THREE.ShaderMaterial({
    vertexShader: PARTICLE_VERTEX_SHADER,
    fragmentShader: PARTICLE_FRAGMENT_SHADER,
    uniforms: {
      uHueType: { value: 0 },
      uPointSize: { value: 28 },
      uTexture: { value: particleTexture },
      uTime: { value: 0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const particles = new THREE.Points(particleGeo, particleMat);
  particles.visible = false;
  scene.add(particles);

  const glowLights = [];
  const glowCount = 6;
  let glowLightsAttached = false;
  for (let i = 0; i < glowCount; i++) {
    const light = new THREE.PointLight(0xffffff, 0, 8);
    light.position.set(0, -10, 0);
    glowLights.push(light);
  }

  // ── Scene lights (Lighting mode A) ─────────────────────────────────────────
  // These are all created up front and selectively activated by the style
  // functions in sceneLightingEffects. resetAllLights() zeros their intensities
  // at the top of every updateSceneLighting() call so the active style has a
  // clean starting state each frame.
  const ringGeometry = new THREE.TorusGeometry(3, 0.05, 8, 64);
  const ringMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 });
  const ringMesh = new THREE.Mesh(ringGeometry, ringMaterial);
  ringMesh.rotation.x = Math.PI / 2;
  ringMesh.visible = false;
  scene.add(ringMesh);

  const ringLight = new THREE.PointLight(0xffffff, 3, 10);
  const ringLight2 = new THREE.PointLight(0xffffff, 3, 10);
  scene.add(ringLight);
  scene.add(ringLight2);

  const streetLight1 = new THREE.PointLight(0xffeedd, 0, 15);
  streetLight1.position.set(-1.5, 6, 0);
  scene.add(streetLight1);

  const streetLight2 = new THREE.PointLight(0xffeedd, 0, 15);
  streetLight2.position.set(1.5, 6, 0);
  scene.add(streetLight2);

  const dirRingLight = new THREE.DirectionalLight(0xffffff, 0);
  dirRingLight.position.set(0, 8, 0);
  dirRingLight.target.position.set(0, 0, 0);
  scene.add(dirRingLight);
  scene.add(dirRingLight.target);

  const dirRingLight2 = new THREE.DirectionalLight(0xffffff, 0);
  dirRingLight2.position.set(0, 8, 0);
  dirRingLight2.target.position.set(0, 0, 0);
  scene.add(dirRingLight2);
  scene.add(dirRingLight2.target);

  const warmLight = new THREE.DirectionalLight(0xff8844, 0);
  warmLight.position.set(-3, 3, 2);
  scene.add(warmLight);

  const coolLight = new THREE.DirectionalLight(0x4488ff, 0);
  coolLight.position.set(3, 3, 2);
  scene.add(coolLight);

  const heroSpotLight = new THREE.SpotLight(0xfff2d6, 0, 45, Math.PI / 5, 0.45, 1.4);
  heroSpotLight.position.set(4, 10, 8);
  heroSpotLight.target.position.set(0, 2.5, 0);
  scene.add(heroSpotLight);
  scene.add(heroSpotLight.target);

  let lastStaticSceneSignature = null;

  function resetAllLights() {
    ringLight.intensity = 0;
    ringLight2.intensity = 0;
    dirRingLight.intensity = 0;
    dirRingLight2.intensity = 0;
    warmLight.intensity = 0;
    coolLight.intensity = 0;
    streetLight1.intensity = 0;
    streetLight2.intensity = 0;
    heroSpotLight.intensity = 0;
    dirRingLight.visible = false;
    dirRingLight2.visible = false;
    warmLight.visible = false;
    coolLight.visible = false;
    heroSpotLight.visible = false;
  }

  function clearParticleGlow() {
    glowLights.forEach((light) => {
      light.intensity = 0;
    });
  }

  function setParticleLightingEnabled(enabled) {
    particles.visible = enabled;
    if (enabled === glowLightsAttached) return;

    glowLightsAttached = enabled;
    glowLights.forEach((light) => {
      if (enabled) {
        scene.add(light);
      } else {
        scene.remove(light);
      }
    });
  }

  function getLightingStyle() {
    const def = currentSetDef();
    const modelIndex = getCurrentModelIndex();
    if (def.lightingOverrides?.[modelIndex]) return def.lightingOverrides[modelIndex];
    return def.lightingStyle;
  }

  function applyAmbientOverrides() {
    if (!guiParams.ambientOverrideEnabled) return;
    ambient.color.set(guiParams.ambientColor);
    ambient.intensity = guiParams.ambientIntensity;
  }

  function getAmbientOverrideSignature() {
    if (!guiParams.ambientOverrideEnabled) {
      return 'off';
    }

    return `${guiParams.ambientColor}:${guiParams.ambientIntensity}`;
  }

  function getPulse(progress) {
    return Math.min(Math.min(progress, 1 - progress) * 5, 1);
  }

  function setHeroSpotlightTarget(monolith) {
    heroSpotLight.target.position.copy(monolith.position);
    heroSpotLight.target.updateMatrixWorld();
    heroSpotLight.position.set(
      monolith.position.x + 4,
      monolith.position.y + 10,
      monolith.position.z + 8,
    );
  }

  function animateDirectionalRingPair({ nowMs, intensityScale, speed = RING_SPEED, zOffset = 2 }) {
    dirRingLight.visible = true;
    dirRingLight2.visible = true;
    const progress = nowMs * speed;
    const p1 = progress % 1.0;
    const p2 = (progress + 0.5) % 1.0;
    dirRingLight.position.set(0, RING_TOP - p1 * RING_RANGE, zOffset);
    dirRingLight.intensity = intensityScale * getPulse(p1);
    dirRingLight2.position.set(0, RING_TOP - p2 * RING_RANGE, -zOffset);
    dirRingLight2.intensity = intensityScale * getPulse(p2);
  }

  function animatePointRingPair({ nowMs, intensityScale, speed = RING_SPEED, distance = 30 }) {
    ringLight.distance = distance;
    ringLight2.distance = distance;
    const progress = nowMs * speed;
    const p1 = progress % 1.0;
    const p2 = (progress + 0.5) % 1.0;
    ringLight.position.set(0, RING_TOP - p1 * RING_RANGE, 0);
    ringLight.intensity = intensityScale * getPulse(p1);
    ringLight2.position.set(0, RING_TOP - p2 * RING_RANGE, 0);
    ringLight2.intensity = intensityScale * getPulse(p2);
  }

  function animateSingleDirectionalRing({ nowMs, intensityScale, speed = 0.00015, zOffset = 2 }) {
    dirRingLight.visible = true;
    const progress = (nowMs * speed) % 1.0;
    const center = Math.abs(progress - 0.5) * 2;
    dirRingLight.position.set(0, RING_TOP - progress * RING_RANGE, zOffset);
    dirRingLight.intensity = intensityScale * Math.pow(1 - center, 4);
  }

  function animateStreetlights({
    nowMs,
    speed,
    far,
    near,
    xOffset = 1.5,
    height = 6,
    intensityScale,
    falloffDivisor,
  }) {
    const range = far - near;
    const progress = nowMs * speed;
    const p1 = progress % 1.0;
    const p2 = (progress + 0.5) % 1.0;
    const z1 = far - p1 * range;
    const z2 = far - p2 * range;
    const falloff1 = Math.exp(-(z1 * z1) / falloffDivisor);
    const falloff2 = Math.exp(-(z2 * z2) / falloffDivisor);
    streetLight1.position.set(-xOffset, height, z1);
    streetLight2.position.set(xOffset, height, z2);
    streetLight1.intensity = intensityScale * falloff1;
    streetLight2.intensity = intensityScale * falloff2;
  }

  function getParticleBaseHue({ hueType, time }) {
    if (hueType === 'warm') {
      return 0.04 + Math.sin(time) * 0.02 + Math.sin(time * 2.3) * 0.01 + Math.sin(time * 5.7) * 0.01;
    }
    if (hueType === 'rainbow') {
      return (time * 0.1) % 1.0;
    }
    return 0;
  }

  function getParticleHueTypeId(hueType) {
    if (hueType === 'warm') return 1;
    if (hueType === 'rainbow') return 2;
    return 0;
  }

  function updateFallingParticleGlowLights({ nowSeconds, monolith, baseHue, hueType }) {
    const saturation = hueType === 'warm' || hueType === 'rainbow' ? 1.0 : 0;

    for (let i = 0; i < glowCount; i++) {
      const light = glowLights[i];
      const phase = i / glowCount;
      const speed = 0.34 + (i * 0.035);
      const progress = (nowSeconds * speed + phase) % 1;
      const angle = (phase * Math.PI * 2) + Math.sin(nowSeconds * 0.42 + i) * 0.45;
      const radius = 1.4 + ((i % 3) * 0.85);
      const pulse = getPulse(progress);

      light.position.set(
        monolith.position.x + Math.cos(angle) * radius,
        RING_TOP - progress * RING_RANGE,
        monolith.position.z + Math.sin(angle) * radius,
      );
      light.intensity = 1.1 + (pulse * 4.8);
      light.distance = 9;
      light.color.setHSL((baseHue + phase * 0.08) % 1, saturation, 0.58);
    }
  }

  // ── Scene lighting style effects ───────────────────────────────────────────
  // Each entry corresponds to a model-collection lightingStyle value.
  // Called every frame by updateSceneLighting() after resetAllLights().
  const sceneLightingEffects = {
    neon: ({ nowMs }) => {
      const angle = nowMs * 0.0004;
      ambient.color.set(0xcc44ff);
      ambient.intensity = 1.0;
      warmLight.visible = true;
      coolLight.visible = true;
      warmLight.color.set(0xff1493);
      coolLight.color.set(0x8800ff);
      warmLight.position.set(Math.cos(angle) * 4, 3, Math.sin(angle) * 4);
      coolLight.position.set(Math.cos(angle + Math.PI) * 4, 2, Math.sin(angle + Math.PI) * 4);
      warmLight.intensity = 2;
      coolLight.intensity = 2;
    },

    splitTone: ({ nowMs }) => {
      const angle = nowMs * 0.0003;
      warmLight.visible = true;
      coolLight.visible = true;
      warmLight.color.set(0xff8844);
      coolLight.color.set(0x4488ff);
      warmLight.position.set(Math.cos(angle) * 4, 3, Math.sin(angle) * 4);
      coolLight.position.set(Math.cos(angle + Math.PI) * 4, 3, Math.sin(angle + Math.PI) * 4);
      ambient.intensity = 0.3;
      warmLight.intensity = 1.5;
      coolLight.intensity = 1.5;
    },

    dualRingBright: ({ nowMs }) => {
      ambient.intensity = 0.4;
      animateDirectionalRingPair({ nowMs, intensityScale: 6 });
    },

    dualRing: ({ nowMs }) => {
      ambient.intensity = 0.2;
      animateDirectionalRingPair({ nowMs, intensityScale: 3 });
    },

    singleRing: ({ nowMs }) => {
      ambient.intensity = 0.05;
      animateSingleDirectionalRing({ nowMs, intensityScale: 4 });
    },

    streetlightSlow: ({ nowMs }) => {
      ambient.intensity = 0.5;
      animateStreetlights({
        nowMs,
        speed: 0.00012,
        far: 20,
        near: -15,
        intensityScale: 20,
        falloffDivisor: 25,
      });
    },

    streetlight: ({ nowMs }) => {
      ambient.intensity = 0.5;
      animateStreetlights({
        nowMs,
        speed: 0.0008,
        far: 15,
        near: -10,
        intensityScale: 20,
        falloffDivisor: 18,
      });
    },

    ambientBright: () => {
      ambient.intensity = 8.4;
      dirRingLight.visible = true;
      dirRingLight.position.set(0, 10, 2);
      dirRingLight.target.position.set(0, 0, 0);
      dirRingLight.intensity = 6;
    },

    ambientOnly: () => {
      ambient.intensity = 2.8;
    },

    pointRing: ({ nowMs }) => {
      animatePointRingPair({ nowMs, intensityScale: 5 });
    },
  };

  const sceneLightingConfigs = {
    neon: { animated: true, heroSpotlightIntensity: 5.5 },
    splitTone: { animated: true, heroSpotlightIntensity: 5.5 },
    dualRingBright: { animated: true, heroSpotlightIntensity: 0 },
    dualRing: { animated: true, heroSpotlightIntensity: 0 },
    singleRing: { animated: true, heroSpotlightIntensity: 0 },
    streetlightSlow: { animated: true, heroSpotlightIntensity: 5.5 },
    streetlight: { animated: true, heroSpotlightIntensity: 5.5 },
    ambientBright: { animated: false, heroSpotlightIntensity: 0 },
    ambientOnly: { animated: false, heroSpotlightIntensity: 0 },
    pointRing: { animated: true, heroSpotlightIntensity: 0 },
  };

  // ── Per-frame update entry points ───────────────────────────────────────────

  function updateParticleLighting() {
    setParticleLightingEnabled(true);
    resetAllLights();
    ambient.color.set(0xffffff);
    ambient.intensity = 0.08;
    const nowMs = Date.now();
    const nowSeconds = performance.now() * 0.001;
    const t = nowMs * 0.005;
    const hueType = currentSetDef().particleHue;
    const baseHue = getParticleBaseHue({ hueType, time: t });
    particleMat.uniforms.uTime.value = nowSeconds;
    particleMat.uniforms.uHueType.value = getParticleHueTypeId(hueType);

    updateFallingParticleGlowLights({
      nowSeconds,
      monolith: getMonolith(),
      baseHue,
      hueType,
    });
  }

  function updateSceneLighting({ forceRefresh = false } = {}) {
    const style = getLightingStyle();
    const effect = sceneLightingEffects[style] ?? sceneLightingEffects.pointRing;
    const config = sceneLightingConfigs[style] ?? sceneLightingConfigs.pointRing;
    const ambientOverrideSignature = getAmbientOverrideSignature();
    const staticSceneSignature = `${style}:${ambientOverrideSignature}`;

    if (!forceRefresh && !config.animated && lastStaticSceneSignature === staticSceneSignature) {
      return;
    }

    const monolith = config.heroSpotlightIntensity > 0 ? getMonolith() : null;
    const nowMs = Date.now();

    if (config.animated) {
      lastStaticSceneSignature = null;
    } else {
      lastStaticSceneSignature = staticSceneSignature;
    }

    ambient.color.set(0xffffff);
    resetAllLights();
    if (monolith) {
      heroSpotLight.visible = true;
      setHeroSpotlightTarget(monolith);
    }
    effect({ monolith, nowMs, style });

    heroSpotLight.intensity = config.heroSpotlightIntensity;

    applyAmbientOverrides();
  }

  function animateBloomRing() {
    const nowMs = Date.now();
    animateDirectionalRingPair({ nowMs, intensityScale: 1.5 });

    const lowTop = 3;
    const lowBottom = -2;
    const lowRange = lowTop - lowBottom;
    const progress = nowMs * RING_SPEED * 0.8;
    const p1 = progress % 1.0;
    const p2 = (progress + 0.5) % 1.0;
    streetLight1.position.set(-1.5, lowTop - p1 * lowRange, 2);
    streetLight1.intensity = 1.5 * getPulse(p1);
    streetLight2.position.set(1.5, lowTop - p2 * lowRange, -2);
    streetLight2.intensity = 1.5 * getPulse(p2);
  }

  return {
    animateBloomRing,
    clearParticleGlow,
    particles,
    setParticleLightingEnabled,
    updateParticleLighting,
    updateSceneLighting,
  };
}
