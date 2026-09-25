/* ============================================================
   Simple view router (Chats / Friends / Search / Profile / Chat)
   + back-button (browser & mobile) handling.
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
    $$('.view').forEach(v => v.classList.add('hidden'));
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));

    if (view === 'chats')   renderChats();
    if (view === 'friends') renderFriends();
    if (view === 'search')  renderSearch();
    if (view === 'profile') renderProfile();
    if (view === 'chat')    renderChatView(opts.chatId);

    $('#back-btn').classList.toggle('hidden', !['chat'].includes(view));

    const titles = {
      chats: 'Fast S', friends: 'Friends', search: 'Find People',
      profile: 'Profile', chat: opts.title || 'Chat'
    };
    $('#topbar-title').textContent = titles[view] || 'Fast S';
    $('#bottom-nav').classList.toggle('hidden', view === 'chat');
  }
};

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
      // Coming back into chat? Then just go to chats
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
    } else {
      history.back();
    }
  };
}
