import { useEffect } from 'react';

import '../../visualizations/atom/src/styles.css';
import { startApp } from '../../visualizations/atom/src/app.js';

// The Atom scene is the `atom2` submodule: a vanilla Three.js molecule viewer that
// drives the DOM directly via getElementById and returns a teardown function from
// startApp(). This wrapper renders the exact scaffold atom2 expects (mirrors
// visualizations/atom/index.html) and bridges its lifecycle into the React scene
// switcher. The `modelQuality` prop the shell passes to scenes is unused here —
// atom2 manages its own quality. ArrowUp/ArrowDown stay owned by the shell for
// scene switching; atom2 cycles visual styles with [ and ].
export default function AtomCanvas() {
  useEffect(() => {
    // Runs after the scaffold below is committed, so atom2's getElementById calls resolve.
    const teardown = startApp();
    return () => {
      if (typeof teardown === 'function') teardown();
    };
  }, []);

  return (
    <div className="atom2-app">
      <header id="topbar">
        <div id="search-container" />
        <div id="style-container" />
        <div id="measurements-container" />
        <div id="random-container" />
      </header>
      <aside id="sidebar">
        <div id="groups-container" />
        <div id="sidebar-lists" />
      </aside>
      <main id="canvas-container" />
      <div id="status" />
    </div>
  );
}
