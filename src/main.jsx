import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles.css';
import './review.css';
import './product.css';
import './accessibility.css';
import { registerOfflineReview } from './offline';

// A separate project: no dependencies on or changes to the existing chess app.
createRoot(document.getElementById('root')).render(<App />);
registerOfflineReview();
