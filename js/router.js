/* ============================================================
   Simple view router (Chats / Friends / Search / Profile / Chat /
   User-Profile) + back-button (browser & mobile) handling.

   Phase 2.3 updates:
   1. Topbar logo (bolt + "Fast S") shows only on the Chats view.
   2. Topbar dynamic title shows on all other views.
   3. Topbar partner avatar + clickable title handling unchanged.
   ============================================================ */
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { renderChats } from './chats.js';
import { renderFriends } from './friends.js';
import { renderSearch } from './search.js';
import { renderProfile } from './profile.js';
import { renderChatView, closeActiveChat } from './chatView.js';

export const router = {
  stack: [],

  go(view, opts = {}) {
    const prev = S.currentView;
    if (prev && prev !== view) {
      this.stack.push({ view: prev, opts: S.currentViewOpts || {} });
    }
    S.currentViewOpts = opts;
    this.render(view, opts);
    history.pushState({ view, opts }, '', '#' + view);
  },

  render(view, opts = {}) {
    S.currentView = view;

    // 1. Hide every view
    $$('.view').forEach(v => v.classList.add('hidden'));

    // 2. Show the target view (user reuses profile's DOM)
    const domView = (view === 'user') ? 'profile' : view;
    const target = document.getElementById('view-' + domView);
    if (target) target.classList.remove('hidden');

    // 3. Update bottom nav highlight
    $$('.nav-btn').forEach(b => {
      const active = (view === 'user') ? false : b.dataset.view === view;
      b.classList.toggle('active', active);
    });

    // 4. Render view-specific content
    if (view === 'chats')   renderChats();
    if (view === 'friends') renderFriends();
    if (view === 'search')  renderSearch();
    if (view === 'profile') renderProfile();
    if (view === 'user')    renderProfile(opts.uid);
    if (view === 'chat')    renderChatView(opts.chatId);

    // 5. Back button
    const backVisible = (view === 'chat' || view === 'user');
    $('#back-btn').classList.toggle('hidden', !backVisible);

    // 6. Topbar — logo OR title
    const logoEl = $('#topbar-logo');
    const titleEl = $('#topbar-title');

    if (view === 'chats') {
      // Chats view shows the logo, hides dynamic title
      logoEl.classList.remove('hidden');
      titleEl.classList.add('hidden');
    } else {
      // Other views hide the logo, show dynamic title
      logoEl.classList.add('hidden');
      titleEl.classList.remove('hidden');

      let title = 'Fast S';
      if (view === 'friends') title = 'Friends';
      else if (view === 'search') title = 'Find People';
      else if (view === 'profile') title = 'Profile';
      else if (view === 'chat') title = opts.title || 'Chat';
      else if (view === 'user') {
        const u = S.userCache[opts.uid];
        title = u?.displayName || 'Profile';
      }
      titleEl.textContent = title;
    }

    // 7. Hide bottom-nav while inside chat
    $('#bottom-nav').classList.toggle('hidden', view === 'chat');

    // 8. Reset partner avatar / clickable title when NOT in chat
    if (view !== 'chat') {
      const partnerAvatar = $('#chat-partner-avatar');
      if (partnerAvatar) {
        partnerAvatar.classList.add('hidden');
        partnerAvatar.src = '';
      }
      if (titleEl) {
        titleEl.dataset.clickable = 'false';
        titleEl.onclick = null;
      }
    }
  }
};

// ============================================================
// BACK BUTTON (browser + in-app)
// ============================================================
export function initBackButton() {
  history.replaceState({ view: 'chats' }, '', '#chats');

  window.addEventListener('popstate', (e) => {
    const st = e.state;

    if (!st) {
      history.pushState({ view: 'chats' }, '', '#chats');
      router.render('chats');
      return;
    }

    if (st.view === 'chat') {
      closeActiveChat();
      router.render('chats');
      return;
    }

    if (S.currentView === 'chat') closeActiveChat();

    router.render(st.view, st.opts || {});
  });

  $('#back-btn').onclick = () => {
    if (S.currentView === 'chat') {
      closeActiveChat();
      history.pushState({ view: 'chats' }, '', '#chats');
      router.render('chats');
      return;
    }

    if (S.currentView === 'user') {
      const from = S.currentViewOpts?.from || 'chats';
      history.pushState({ view: from }, '', '#' + from);
      router.render(from);
      return;
    }

    history.back();
  };
}
