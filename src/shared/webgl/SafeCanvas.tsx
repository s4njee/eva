import { Canvas, type CanvasProps } from '@react-three/fiber';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { WebGLRenderer, type WebGLRendererParameters } from 'three';

const R3F_DEFAULT_RENDERER_OPTIONS: WebGLRendererParameters = {
  alpha: true,
  antialias: true,
  powerPreference: 'high-performance',
};

const SHELL_STYLE = {
  position: 'relative',
  width: '100%',
  height: '100%',
} as const;

const STATUS_STYLE = {
  position: 'absolute',
  inset: 0,
  display: 'grid',
  placeItems: 'center',
  padding: '24px',
  color: 'rgba(255, 255, 255, 0.86)',
  background: '#020406',
  textAlign: 'center',
} as const;

const CARD_STYLE = {
  width: 'min(100%, 420px)',
  padding: '18px 20px',
  border: '1px solid rgba(255, 255, 255, 0.16)',
  borderRadius: '18px',
  background: 'rgba(6, 10, 16, 0.78)',
  boxShadow: '0 22px 60px rgba(0, 0, 0, 0.3)',
} as const;

const EYEBROW_STYLE = {
  margin: '0 0 10px',
  font: "700 0.72rem/1 'Anton', sans-serif",
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
} as const;

const TITLE_STYLE = {
  margin: '0 0 10px',
  font: "700 clamp(1.15rem, 2vw, 1.5rem) / 1.1 'Anton', sans-serif",
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
} as const;

const BODY_STYLE = {
  margin: 0,
  font: "500 0.92rem/1.55 'Avenir Next', 'Segoe UI', sans-serif",
  color: 'rgba(255, 255, 255, 0.74)',
} as const;

type SafeCanvasProps = Omit<CanvasProps, 'fallback' | 'gl'> & {
  fallback?: ReactNode;
  rendererOptions?: WebGLRendererParameters;
  sceneLabel?: string;
};

type ProbeState =
  | { status: 'pending' }
  | { status: 'ready'; options: WebGLRendererParameters }
  | { status: 'unsupported'; error: Error };

const probeCache = new Map<string, ProbeState>();

function normalizeRendererOptions(
  options: WebGLRendererParameters,
): WebGLRendererParameters {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  ) as WebGLRendererParameters;
}

function getRendererCandidates(
  requestedOptions: WebGLRendererParameters,
): WebGLRendererParameters[] {
  const candidates = [
    requestedOptions,
    { ...requestedOptions, powerPreference: 'default' },
    { ...requestedOptions, antialias: false },
    {
      ...requestedOptions,
      antialias: false,
      powerPreference: 'default',
    },
    requestedOptions.alpha === true
      ? {
          ...requestedOptions,
          alpha: false,
          antialias: false,
          powerPreference: 'default',
        }
      : null,
  ];

  const seen = new Set<string>();

  return candidates
    .filter((candidate): candidate is WebGLRendererParameters => candidate !== null)
    .map((candidate) => normalizeRendererOptions(candidate))
    .filter((candidate) => {
      const key = JSON.stringify(candidate);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function getRendererProbeKey(options: WebGLRendererParameters) {
  return JSON.stringify(options);
}

function probeRendererOptions(options: WebGLRendererParameters): ProbeState {
  const probeKey = getRendererProbeKey(options);
  const cachedProbe = probeCache.get(probeKey);

  if (cachedProbe) {
    return cachedProbe;
  }

  if (typeof document === 'undefined') {
    return { status: 'pending' };
  }

  let lastError = new Error('WebGL 2 is unavailable in this browser.');

  for (const candidate of getRendererCandidates(options)) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2', {
      alpha: candidate.alpha,
      antialias: candidate.antialias,
      depth: candidate.depth,
      failIfMajorPerformanceCaveat: candidate.failIfMajorPerformanceCaveat,
      powerPreference: candidate.powerPreference,
      premultipliedAlpha: candidate.premultipliedAlpha,
      preserveDrawingBuffer: candidate.preserveDrawingBuffer,
      stencil: candidate.stencil,
    });

    if (context) {
      const supportedProbe = { status: 'ready', options: candidate } as const;
      probeCache.set(probeKey, supportedProbe);
      return supportedProbe;
    }

    lastError = new Error(
      `WebGL 2 context creation failed for ${JSON.stringify(candidate)}.`,
    );
  }

  const unsupportedProbe = { status: 'unsupported', error: lastError } as const;
  probeCache.set(probeKey, unsupportedProbe);
  return unsupportedProbe;
}

function SafeCanvasStatus({
  eyebrow,
  title,
  message,
}: {
  eyebrow: string;
  title: string;
  message: string;
}) {
  return (
    <div style={STATUS_STYLE}>
      <div style={CARD_STYLE}>
        <p style={EYEBROW_STYLE}>{eyebrow}</p>
        <h2 style={TITLE_STYLE}>{title}</h2>
        <p style={BODY_STYLE}>{message}</p>
      </div>
    </div>
  );
}

export default function SafeCanvas({
  children,
  fallback,
  rendererOptions,
  sceneLabel = 'Scene',
  ...props
}: SafeCanvasProps) {
  const requestedOptions = useMemo(
    () => normalizeRendererOptions({
      ...R3F_DEFAULT_RENDERER_OPTIONS,
      ...rendererOptions,
    }),
    [rendererOptions],
  );
  const probeKey = useMemo(
    () => getRendererProbeKey(requestedOptions),
    [requestedOptions],
  );
  const [probe, setProbe] = useState<ProbeState>(() => {
    if (typeof document === 'undefined') {
      return { status: 'pending' };
    }

    return probeCache.get(probeKey) ?? { status: 'pending' };
  });

  useEffect(() => {
    setProbe(probeRendererOptions(requestedOptions));
  }, [probeKey, requestedOptions]);

  if (probe.status === 'unsupported') {
    return (
      <div style={SHELL_STYLE}>
        <SafeCanvasStatus
          eyebrow="WebGL Offline"
          title={sceneLabel}
          message="This scene could not start a WebGL 2 renderer here. Try another scene from the + menu, or re-enable hardware acceleration and WebGL in your browser."
        />
      </div>
    );
  }

  if (probe.status !== 'ready') {
    return (
      <div style={SHELL_STYLE}>
        <SafeCanvasStatus
          eyebrow="Checking Graphics"
          title={sceneLabel}
          message="Preparing the renderer with the safest available graphics settings for this device."
        />
      </div>
    );
  }

  return (
    <Canvas
      {...props}
      fallback={fallback}
      gl={(defaultProps) => new WebGLRenderer({
        ...defaultProps,
        ...probe.options,
      })}
    >
      {children}
    </Canvas>
  );
}
