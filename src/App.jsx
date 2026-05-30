import React, {
  Suspense,
  lazy,
  startTransition,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Routes, Route } from 'react-router-dom';

import MonolithCanvas from '../visualizations/monolith/src/MonolithCanvas.jsx';
import { isEditableTarget } from './shared/special-effects/index.ts';

const MatrixCanvas = lazy(() => import('../visualizations/matrix/src/text-rain/App.tsx'));
const AtomCanvas = lazy(() => import('./atom/AtomCanvas.jsx'));
const BocchiCanvas = lazy(() => import('./bocchi/BocchiCanvas.jsx'));
const PlanesApp = lazy(() => import('../visualizations/planes/src/App.jsx'));

const SCENES = [
  { id: 'monolith', label: 'Monolith', Component: MonolithCanvas },
  { id: 'matrix', label: 'Matrix', Component: MatrixCanvas },
  { id: 'atom', label: 'Atom', Component: AtomCanvas },
  { id: 'bocchi', label: 'Bocchi', Component: BocchiCanvas },
  // Planes uses ArrowUp/ArrowDown to fly the plane, which would collide with the
  // shell's keyboard scene switching. So it is reachable only by clicking its overlay
  // tab: excluded from the arrow cycle, and the shell ignores arrows while it is active.
  { id: 'planes', label: 'Planes', Component: PlanesApp, clickOnly: true },
];

// Scene indexes that participate in ArrowUp/ArrowDown cycling (all except clickOnly scenes).
const ARROW_SCENE_INDEXES = SCENES.reduce((indexes, scene, index) => {
  if (!scene.clickOnly) indexes.push(index);
  return indexes;
}, []);

function getNextArrowSceneIndex(currentIndex, direction) {
  const pos = ARROW_SCENE_INDEXES.indexOf(currentIndex);
  const basePos = pos === -1 ? 0 : pos;
  const nextPos = (basePos + direction + ARROW_SCENE_INDEXES.length) % ARROW_SCENE_INDEXES.length;
  return ARROW_SCENE_INDEXES[nextPos];
}

function shouldShowQualitySwitcher() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  return params.has('perf') || params.has('fps') || params.has('models');
}

export default function App() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [modelQuality, setModelQuality] = useState('auto');
  const showQualitySwitcher = shouldShowQualitySwitcher();

  // Mirror the active scene into a ref so the window keydown handler (bound once)
  // can read the current scene without re-binding.
  const sceneIndexRef = useRef(sceneIndex);
  sceneIndexRef.current = sceneIndex;

  const handleSceneSelect = (index) => {
    startTransition(() => {
      setSceneIndex(index);
    });
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat || isEditableTarget(event.target)) return;

      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

      // Click-only scenes (Planes flies with Up/Down) own the arrow keys while active:
      // don't switch scenes and don't preventDefault, so the scene's own handler runs.
      if (SCENES[sceneIndexRef.current]?.clickOnly) return;

      event.preventDefault();

      const direction = event.key === 'ArrowDown' ? 1 : -1;

      startTransition(() => {
        setSceneIndex((currentIndex) => getNextArrowSceneIndex(currentIndex, direction));
      });
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeScene = SCENES[sceneIndex];

  return (
    <Routes>
      <Route path="/planes/*" element={
        <Suspense fallback={<div className="eva-loading">loading scene...</div>}>
          <PlanesApp />
        </Suspense>
      } />
      <Route path="*" element={<EvaApp sceneIndex={sceneIndex} overlayOpen={overlayOpen} setOverlayOpen={setOverlayOpen} handleSceneSelect={handleSceneSelect} activeScene={activeScene} modelQuality={modelQuality} setModelQuality={setModelQuality} showQualitySwitcher={showQualitySwitcher} />} />
    </Routes>
  );
}

function EvaApp({ sceneIndex, overlayOpen, setOverlayOpen, handleSceneSelect, activeScene, modelQuality, setModelQuality, showQualitySwitcher }) {
  const ActiveSceneComponent = activeScene.Component;
  return (
    <main className="eva-app">
      {/* Render the active scene full-screen and keep the shell around it minimal. */}
      <div className="eva-scene">
        <Suspense fallback={<div className="eva-loading">loading scene...</div>}>
          <ActiveSceneComponent modelQuality={modelQuality} />
        </Suspense>
      </div>

      <button
        type="button"
        className="eva-overlay-toggle"
        aria-label={overlayOpen ? 'Close scene overlay' : 'Open scene overlay'}
        aria-expanded={overlayOpen}
        onClick={() => setOverlayOpen((current) => !current)}
      >
        +
      </button>

      {/* The overlay is the lightweight scene switcher and the only persistent UI. */}
      <div className={`eva-overlay ${overlayOpen ? 'is-open' : ''}`}>
        <p className="eva-kicker">Eva</p>
        <h1 className="eva-title">{activeScene.label}</h1>
        <p className="eva-hint">
          {activeScene.clickOnly
            ? 'Pick a scene below. Arrow keys control this scene.'
            : 'ArrowUp for previous, ArrowDown for next.'}
        </p>

        <div className="eva-scene-tabs" role="tablist" aria-label="Scene switcher">
          {SCENES.map((scene, index) => (
            <button
              key={scene.id}
              type="button"
              className={`eva-scene-tab ${index === sceneIndex ? 'is-active' : ''}`}
              onClick={() => handleSceneSelect(index)}
            >
              {scene.label}
            </button>
          ))}
        </div>

        {showQualitySwitcher && (
          <div className="eva-quality-switcher">
            <p className="eva-hint">Model Quality</p>
            <div className="eva-scene-tabs">
              {['auto', 'high', 'medium', 'low'].map(tier => (
                <button
                  key={tier}
                  type="button"
                  className={`eva-scene-tab ${modelQuality === tier ? 'is-active' : ''}`}
                  onClick={() => setModelQuality(tier)}
                >
                  {tier}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
