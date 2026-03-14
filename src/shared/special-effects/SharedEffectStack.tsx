import { useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Scanline,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import * as THREE from 'three';
import {
  getHueCycleHue,
} from './shared-special-effects.ts';
import {
  SharedBarrelBlurEffect,
  SharedDatabendEffect,
  SharedHueSaturationEffect,
  SharedPixelMosaicEffect,
  SharedScreenXrayEffect,
  SharedThermalVisionEffect,
} from './react-postprocessing-effects.ts';

// Matrix and Atom share this declarative stack. Monolith keeps its own custom
// composer because it needs isolated model renders for some passes.
export interface SharedEffectStackProps {
  barrelBlurAmount?: number;
  barrelBlurEnabled?: boolean;
  bloomEnabled?: boolean;
  bloomIntensity?: number;
  bloomRadius?: number;
  bloomSmoothing?: number;
  bloomThreshold?: number;
  chromaticAberrationEnabled?: boolean;
  chromaticModulationOffset?: number;
  chromaticOffset?: number;
  chromaticOscillationSpeed?: number;
  chromaticRadialModulation?: boolean;
  cinematicEnabled?: boolean;
  databendEnabled?: boolean;
  hue?: number;
  hueCycleBaseHue?: number;
  hueCycleEnabled?: boolean;
  hueCycleStartTime?: number;
  hueSatEnabled?: boolean;
  pixelMosaicEnabled?: boolean;
  saturation?: number;
  scanlineDensity?: number;
  scanlineEnabled?: boolean;
  scanlineOpacity?: number;
  screenXrayEnabled?: boolean;
  thermalVisionEnabled?: boolean;
}

export default function SharedEffectStack({
  barrelBlurAmount = 0.12,
  barrelBlurEnabled = true,
  bloomEnabled = true,
  bloomIntensity = 1,
  bloomRadius = 0.5,
  bloomSmoothing = 0.3,
  bloomThreshold = 0.2,
  chromaticAberrationEnabled = false,
  chromaticModulationOffset = 0.15,
  chromaticOffset = 0.004,
  chromaticOscillationSpeed = 3.2,
  chromaticRadialModulation = true,
  cinematicEnabled = false,
  databendEnabled = false,
  hue = 0,
  hueCycleBaseHue = 0,
  hueCycleEnabled = false,
  hueCycleStartTime = 0,
  hueSatEnabled = false,
  pixelMosaicEnabled = false,
  saturation = 0,
  scanlineDensity = 4,
  scanlineEnabled = true,
  scanlineOpacity = 1,
  screenXrayEnabled = false,
  thermalVisionEnabled = false,
}: SharedEffectStackProps) {
  const chromaticOffsetVector = useMemo(() => new THREE.Vector2(chromaticOffset, chromaticOffset), []);
  const hueSatEffect = useMemo(() => new SharedHueSaturationEffect(), []);
  const barrelBlurEffect = useMemo(() => new SharedBarrelBlurEffect(), []);
  const databendEffect = useMemo(() => new SharedDatabendEffect(), []);
  const pixelMosaicEffect = useMemo(() => new SharedPixelMosaicEffect(), []);
  const thermalVisionEffect = useMemo(() => new SharedThermalVisionEffect(), []);
  const screenXrayEffect = useMemo(() => new SharedScreenXrayEffect(), []);

  useEffect(() => {
    barrelBlurEffect.setAmount(barrelBlurAmount);
  }, [barrelBlurAmount, barrelBlurEffect]);

  useEffect(() => {
    if (hueCycleEnabled) return;
    hueSatEffect.setHue(hue);
    hueSatEffect.setSaturation(saturation);
  }, [hue, hueCycleEnabled, hueSatEffect, saturation]);

  useFrame(() => {
    if (chromaticAberrationEnabled) {
      const now = performance.now() / 1000;
      const oscillation = 0.5 - 0.5 * Math.cos(now * chromaticOscillationSpeed);
      const offset = chromaticOffset * oscillation;
      chromaticOffsetVector.set(offset, offset);
    } else {
      chromaticOffsetVector.set(0, 0);
    }

    if (hueCycleEnabled) {
      const hueValue = getHueCycleHue(hueCycleBaseHue, hueCycleStartTime, performance.now() / 1000);
      hueSatEffect.setHue(hueValue);
      hueSatEffect.setSaturation(1);
    }
  });

  const composerChildren: ReactElement[] = [];

  // Keep the effect stack readable: each enabled flag contributes a single pass
  // or effect instance here instead of spreading pass wiring across scene files.
  if (cinematicEnabled && bloomEnabled) {
    composerChildren.push(
      <Bloom
        key="bloom"
        mipmapBlur
        intensity={bloomIntensity}
        luminanceThreshold={bloomThreshold}
        luminanceSmoothing={bloomSmoothing}
        radius={bloomRadius}
      />,
    );
  }

  if (cinematicEnabled && scanlineEnabled) {
    composerChildren.push(
      <Scanline
        key="scanline"
        blendFunction={scanlineOpacity > 0 ? BlendFunction.OVERLAY : BlendFunction.SKIP}
        density={scanlineDensity}
        opacity={scanlineOpacity}
      />,
    );
  }

  if (cinematicEnabled && barrelBlurEnabled) {
    composerChildren.push(<primitive key="barrel" object={barrelBlurEffect} />);
  }

  if (chromaticAberrationEnabled) {
    composerChildren.push(
      <ChromaticAberration
        key="chromatic"
        offset={chromaticOffsetVector}
        radialModulation={chromaticRadialModulation}
        modulationOffset={chromaticModulationOffset}
      />,
    );
  }

  if (hueSatEnabled || hueCycleEnabled) {
    composerChildren.push(<primitive key="hue" object={hueSatEffect} />);
  }

  if (databendEnabled) {
    composerChildren.push(<primitive key="databend" object={databendEffect} />);
  }

  if (pixelMosaicEnabled) {
    composerChildren.push(<primitive key="pixel" object={pixelMosaicEffect} />);
  }

  if (thermalVisionEnabled) {
    composerChildren.push(<primitive key="thermal" object={thermalVisionEffect} />);
  }

  if (screenXrayEnabled) {
    composerChildren.push(<primitive key="xray" object={screenXrayEffect} />);
  }

  return (
    <EffectComposer>{composerChildren}</EffectComposer>
  );
}
