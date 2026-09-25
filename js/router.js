/* ============================================================
   Simple view router (Chats / Friends / Search / Profile / Chat /
   User-Profile) + back-button (browser & mobile) handling.

   Updates:
   1. New 'user' view — shows another user's profile by reusing
      #view-profile but calling renderProfile(uid).
   2. render('user', { uid, from }) — remembers where we came
      from so back-button returns there.
   3. Back button / browser back both handle the user view.
   4. Title is dynamic per view.
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

    // 2. Decide which DOM container to show
    //    'user' reuses #view-profile's DOM node
    const domView = (view === 'user') ? 'profile' : view;
    const target = document.getElementById('view-' + domView);
    if (target) target.classList.remove('hidden');

    // 3. Update bottom nav highlight (user view belongs to no tab)
    $$('.nav-btn').forEach(b => {
      const active = (view === 'user')
        ? false
        : b.dataset.view === view;
      b.classList.toggle('active', active);
    });

    // 4. Render view-specific content
    if (view === 'chats')   renderChats();
    if (view === 'friends') renderFriends();
    if (view === 'search')  renderSearch();
    if (view === 'profile') renderProfile();               // own profile
    if (view === 'user')    renderProfile(opts.uid);       // other user
    if (view === 'chat')    renderChatView(opts.chatId);

    // 5. Back button visibility
    //    Show back arrow on: chat, user profile
    const backVisible = (view === 'chat' || view === 'user');
    $('#back-btn').classList.toggle('hidden', !backVisible);

    // 6. Topbar title
    let title = 'Fast S';
    if (view === 'friends') title = 'Friends';
    else if (view === 'search') title = 'Find People';
    else if (view === 'profile') title = 'Profile';
    else if (view === 'chat') title = opts.title || 'Chat';
    else if (view === 'user') {
      const u = S.userCache[opts.uid];
      title = u?.displayName || 'Profile';
    }
    $('#topbar-title').textContent = title;

    // 7. Hide bottom-nav while inside chat
    $('#bottom-nav').classList.toggle('hidden', view === 'chat');

    // 8. Reset topbar partner avatar / clickable title when NOT in chat
    if (view !== 'chat') {
      const partnerAvatar = $('#chat-partner-avatar');
      const titleEl = $('#topbar-title');
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

    // No state → force back to chats
    if (!st) {
      history.pushState({ view: 'chats' }, '', '#chats');
      router.render('chats');
      return;
    }

    // Chat can't be restored from history (needs chatId + subs)
    if (st.view === 'chat') {
      closeActiveChat();
      router.render('chats');
      return;
    }

    // Leaving a chat → tear down subs
    if (S.currentView === 'chat') closeActiveChat();

    router.render(st.view, st.opts || {});
  });

  // In-app back arrow (top-left)
  $('#back-btn').onclick = () => {
    // From chat → go to chats
    if (S.currentView === 'chat') {
      closeActiveChat();
      history.pushState({ view: 'chats' }, '', '#chats');
      router.render('chats');
      return;
    }

    // From user profile → go back to where we came from (opts.from)
    if (S.currentView === 'user') {
      const from = S.currentViewOpts?.from || 'chats';
      history.pushState({ view: from }, '', '#' + from);
      router.render(from);
      return;
    }

    // Fallback
    history.back();
  };
}
