import { useEffect, useRef } from 'react';

import './BocchiCanvas.css';
import { start } from '../../visualizations/bocchi/src/scene.js';

// The Bocchi scene is the `bocchi` submodule: a vanilla Three.js GLB showcase with
// a cursor-reactive starfield and bloom. It is not React, so this wrapper hosts it:
// `start(container)` mounts the scene into the ref'd element and returns a teardown
// that the React scene switcher calls on unmount. The `modelQuality` prop the shell
// passes to scenes is unused here. ArrowLeft/ArrowRight cycle the star sprite inside
// the scene; ArrowUp/ArrowDown stay owned by the shell for switching scenes.
export default function BocchiCanvas() {
  const containerRef = useRef(null);

  useEffect(() => {
    const teardown = start(containerRef.current);
    return () => {
      if (typeof teardown === 'function') teardown();
    };
  }, []);

  return <div className="bocchi-app" ref={containerRef} />;
}
