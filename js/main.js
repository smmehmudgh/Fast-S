/* ============================================================
   Entry point — loaded by index.html as <script type="module">.
   Wires up bottom-nav / topbar-avatar clicks, then boots the
   app (theme, back-button, context-menu, auth listener).

   Updates:
   1. Topbar avatar click → always opens own profile (with
      viewingUser reset, so no stale state from previous views).
   2. Boot flow unchanged — order preserved so all module-level
      handlers register before initAuth() runs.
   ============================================================ */
import { $, $$ } from './dom.js';
import { router, initBackButton } from './router.js';
import { initTheme } from './theme.js';
import { initContextClose } from './contextmenu.js';
import { initAuth } from './auth.js';
import { S } from './state.js';

// Modules whose only job is to register their own DOM event
// handlers (button clicks, input listeners) as a side effect of
// being imported. They aren't referenced by name here, but must
// be loaded before boot() so those handlers exist.
import './messages.js';
import './files.js';
import './notifications.js';
import './chats.js';

// ============================================================
// BOTTOM NAV
// ============================================================
$$('.nav-btn').forEach(b => b.onclick = () => {
  // If we are in a chat, tear it down before switching views
  if (S.currentView === 'chat') {
    import('./chatView.js').then(m => m.closeActiveChat && m.closeActiveChat());
  }
  // Reset any other-user viewing state when user taps a nav tab
  S.viewingUser = null;
  S.viewingUserData = null;
  router.go(b.dataset.view);
});

// ============================================================
// TOPBAR AVATAR → OWN PROFILE
// ============================================================
const topbarAvatar = $('#topbar-avatar');
if (topbarAvatar) {
  topbarAvatar.onclick = () => {
    // Leaving a chat? Clean up first.
    if (S.currentView === 'chat') {
      import('./chatView.js').then(m => m.closeActiveChat && m.closeActiveChat());
    }
    // Reset "viewing other user" so we always show our own profile
    S.viewingUser = null;
    S.viewingUserData = null;
    router.go('profile');
  };
}

// ============================================================
// BOOT
// ============================================================
async function boot() {
  initTheme();
  initBackButton();
  initContextClose();
  await initAuth();
}

boot();
