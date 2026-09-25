/* ============================================================
   Dark / Light theme toggle, persisted to localStorage.
   ============================================================ */
import { $ } from './dom.js';

export function initTheme() {
  const saved = localStorage.getItem('fasts-theme') || 'dark';
  if (saved === 'light') document.body.classList.add('light');
  $('#theme-btn').onclick = () => {
    document.body.classList.toggle('light');
    const isLight = document.body.classList.contains('light');
    localStorage.setItem('fasts-theme', isLight ? 'light' : 'dark');
  };
}
