/* ============================================================
   Generic right-click / long-press context menu (used by the
   Friends list for Message/Block/Unfriend). The chat-message
   specific menu (with reactions) lives in messages.js because
   it needs message data, not this generic list version.
   ============================================================ */
import { $ } from './dom.js';

export function showCtxMenu(x, y, items) {
  const menu = $('#context-menu');
  menu.innerHTML = '';
  items.forEach(it => {
    if (it.divider) {
      const d = document.createElement('div');
      d.className = 'ctx-divider';
      menu.appendChild(d);
      return;
    }
    const el = document.createElement('div');
    el.className = 'ctx-item' + (it.danger ? ' danger' : '');
    el.innerHTML = `${it.icon || ''} ${it.label}`;
    el.onclick = (e) => {
      e.stopPropagation();
      menu.classList.add('hidden');
      it.action();
    };
    menu.appendChild(el);
  });
  menu.style.left = Math.min(x, window.innerWidth - 200) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 260) + 'px';
  menu.classList.remove('hidden');

  setTimeout(() => {
    document.addEventListener('click', function c(e) {
      if (!menu.contains(e.target)) {
        menu.classList.add('hidden');
        document.removeEventListener('click', c);
      }
    });
  }, 10);
}

export function initContextClose() {
  document.addEventListener('click', (e) => {
    const m = $('#context-menu');
    if (!m.classList.contains('hidden') && !m.contains(e.target)) m.classList.add('hidden');
  });
}
