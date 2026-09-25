/* ============================================================
   Entry point — loaded by index.html as <script type="module">.
   Wires up bottom-nav / topbar-avatar clicks, then boots the
   app (theme, back-button, context-menu, auth listener).

   Phase 3.7 updates:
   1. Imports groups.js + groupInfo.js so their top-level DOM
      handlers (buttons, listeners) register before boot().
   2. Chat teardown helper hoisted so nav handlers stay DRY.
   3. Group-info / group-preview state is reset when user taps
      a nav tab (so stale data never leaks into a new view).
   ============================================================ */
import { $, $$ } from './dom.js';
import { router, initBackButton } from './router.js';
import { initTheme } from './theme.js';
import { initContextClose } from './contextmenu.js';
import { initAuth } from './auth.js';
import { S } from './state.js';

// ---- Modules whose side effects matter (they register DOM
//      handlers at import time). Order doesn't matter, but they
//      must all be imported before boot() runs. ----
import './messages.js';
import './files.js';
import './notifications.js';
import './chats.js';
import './groups.js';       // ← NEW (Phase 3.9)
import './groupInfo.js';    // ← NEW (Phase 3.10)

// ------------------------------------------------------------
// Helper: safely tear down any active chat before switching views
// ------------------------------------------------------------
async function teardownActiveChat() {
  if (S.currentView !== 'chat') return;
  try {
    const m = await import('./chatView.js');
    if (m.closeActiveChat) m.closeActiveChat();
  } catch (e) {
    console.warn('[nav] closeActiveChat failed:', e);
  }
}

// ------------------------------------------------------------
// Helper: reset any "extra" view state so the next view starts
// fresh (user profile, group info, group preview).
// ------------------------------------------------------------
function resetTransientViewState() {
  S.viewingUser = null;
  S.viewingUserData = null;
  S.viewingGroup = null;
  S.viewingGroupData = null;
  S.viewingInvite = null;
  S.viewingInviteData = null;
  if (S.unsubGroupMembers) {
    try { S.unsubGroupMembers(); } catch (e) {}
    S.unsubGroupMembers = null;
  }
}

// ============================================================
// BOTTOM NAV
// ============================================================
$$('.nav-btn').forEach(b => b.onclick = async () => {
  await teardownActiveChat();
  resetTransientViewState();
  router.go(b.dataset.view);
});

// ============================================================
// TOPBAR AVATAR → OWN PROFILE
// ============================================================
const topbarAvatar = $('#topbar-avatar');
if (topbarAvatar) {
  topbarAvatar.onclick = async () => {
    await teardownActiveChat();
    resetTransientViewState();
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
