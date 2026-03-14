import React, {
  Suspense,
  lazy,
  startTransition,
  useEffect,
  useState,
} from 'react';

import MonolithCanvas from '../visualizations/monolith/src/MonolithCanvas.jsx';
import { isEditableTarget } from './shared/special-effects/index.ts';

const MatrixCanvas = lazy(() => import('../visualizations/matrix/src/text-rain/App.tsx'));
const AtomCanvas = lazy(() => import('../visualizations/atom/src/App.jsx'));

const SCENES = [
  { id: 'monolith', label: 'Monolith', Component: MonolithCanvas },
  { id: 'matrix', label: 'Matrix', Component: MatrixCanvas },
  { id: 'atom', label: 'Atom', Component: AtomCanvas },
];

function getWrappedIndex(currentIndex, direction, total) {
  return (currentIndex + direction + total) % total;
}

export default function App() {
  const [sceneIndex, setSceneIndex] = useState(0);
  const [overlayOpen, setOverlayOpen] = useState(false);

  const handleSceneSelect = (index) => {
    startTransition(() => {
      setSceneIndex(index);
    });
  };

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.repeat || isEditableTarget(event.target)) return;

      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;

      event.preventDefault();

      const direction = event.key === 'ArrowDown' ? 1 : -1;

      startTransition(() => {
        setSceneIndex((currentIndex) => getWrappedIndex(currentIndex, direction, SCENES.length));
      });
    };

    window.addEventListener('keydown', onKeyDown);

    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const activeScene = SCENES[sceneIndex];
  const ActiveSceneComponent = activeScene.Component;

  return (
    <main className="eva-app">
      {/* Render the active scene full-screen and keep the shell around it minimal. */}
      <div className="eva-scene">
        <Suspense fallback={<div className="eva-loading">loading scene...</div>}>
          <ActiveSceneComponent />
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
        <p className="eva-hint">ArrowUp for previous, ArrowDown for next.</p>

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
      </div>
    </main>
  );
}
