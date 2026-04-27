import React from 'react';
import { renderToString } from 'react-dom/server';
import App from './src/App.tsx';

try {
  console.log(renderToString(<App />));
} catch(e) {
  console.error("CRASH:", e);
}
