/* ============================================================
   Simple view router (Chats / Friends / Search / Profile / Chat)
   + back-button (browser & mobile) handling.

   FIX: render() was hiding every .view but never showing the
   target view, which left the screen blank after any nav click.
   Now it explicitly unhides #view-{name} before rendering.
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

    // 2. ✅ Show the target view — this was the missing piece
    const target = document.getElementById('view-' + view);
    if (target) target.classList.remove('hidden');

    // 3. Update nav highlight
    $$('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });

    // 4. Render view-specific content
    if (view === 'chats')   renderChats();
    if (view === 'friends') renderFriends();
    if (view === 'search')  renderSearch();
    if (view === 'profile') renderProfile();
    if (view === 'chat')    renderChatView(opts.chatId);

    // 5. Back button only shows inside a chat
    $('#back-btn').classList.toggle('hidden', view !== 'chat');

    // 6. Topbar title
    const titles = {
      chats:   'Fast S',
      friends: 'Friends',
      search:  'Find People',
      profile: 'Profile',
      chat:    opts.title || 'Chat'
    };
    $('#topbar-title').textContent = titles[view] || 'Fast S';

    // 7. Hide bottom-nav while inside a chat
    $('#bottom-nav').classList.toggle('hidden', view === 'chat');
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

    // Chat view can't be restored from history — go back to chats
    if (st.view === 'chat') {
      closeActiveChat();
      router.render('chats');
      return;
    }

    // Leaving a chat via back button → tear down chat subscriptions
    if (S.currentView === 'chat') closeActiveChat();

    router.render(st.view, st.opts || {});
  });

  // In-app back arrow (top-left)
  $('#back-btn').onclick = () => {
    if (S.currentView === 'chat') {
      closeActiveChat();
      history.pushState({ view: 'chats' }, '', '#chats');
      router.render('chats');
    } else {
      history.back();
    }
  };
}
