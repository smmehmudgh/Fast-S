/* ============================================================
   Entry point — loaded by index.html as <script type="module">.
   Wires up bottom-nav / topbar-avatar clicks, then boots the
   app (theme, back-button, context-menu, auth listener).

   Importing router.js here (even though it's only used for the
   nav buttons) also pulls in the full view graph (chats,
   friends, search, profile, chatView) so every view's own
   button handlers (defined at module top-level in each file)
   get registered before boot() runs.
   ============================================================ */
import { $$ } from './dom.js';
import { router, initBackButton } from './router.js';
import { initTheme } from './theme.js';
import { initContextClose } from './contextmenu.js';
import { initAuth } from './auth.js';

// Modules whose only job is to register their own DOM event
// handlers (button clicks, input listeners) as a side effect of
// being imported. They aren't referenced by name here, but must
// be loaded before boot() so those handlers exist.
import './messages.js';
import './files.js';
import './notifications.js';

$$('.nav-btn').forEach(b => b.onclick = () => {
  router.go(b.dataset.view);
});

document.querySelector('#topbar-avatar').onclick = () => router.go('profile');

async function boot() {
  initTheme();
  initBackButton();
  initContextClose();
  await initAuth();
}
boot();
