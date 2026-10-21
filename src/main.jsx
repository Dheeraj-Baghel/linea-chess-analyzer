import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './review.css';
import './product.css';
import './accessibility.css';
import { registerOfflineReview } from './offline';

// A separate project: no dependencies on or changes to the existing chess app.
// DEV-ONLY: /demo-record renders deterministic homepage clip views (tree-shaken from production).
if (import.meta.env.DEV && location.pathname === '/demo-record') {
  Promise.all([import('./DemoRecorder'), import('./demo-recorder.css')]).then(([{ default: DemoRecorder }]) => createRoot(document.getElementById('root')).render(<DemoRecorder />));
} else {
  createRoot(document.getElementById('root')).render(<App />);
  registerOfflineReview();
}
