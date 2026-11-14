import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { Gallery } from './ui/Gallery';

const root = document.getElementById('root');
if (!root) throw new Error('#root が見つかりません');

createRoot(root).render(
  <StrictMode>
    {window.location.hash.includes('gallery=1') ? <Gallery /> : <App />}
  </StrictMode>,
);
