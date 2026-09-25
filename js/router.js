/* ============================================================
   Simple view router (Chats / Friends / Search / Profile / Chat /
   User-Profile / Group-Info / Group-Preview)
   + back-button (browser & mobile) handling.

   Phase 3.2 updates:
   1. New routes: 'group-info' and 'group-preview'.
   2. Group-info shows the current group's info page (name, bio,
      members, admin actions).
   3. Group-preview shows an invite preview with Join / Decline.
   4. Both routes are handled by dedicated renderer functions
      imported from groupInfo.js and groups.js.
   5. Back button remembers where we came from for user / group
      views.
   ============================================================ */
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { renderChats } from './chats.js';
import { renderFriends } from './friends.js';
import { renderSearch } from './search.js';
import { renderProfile } from './profile.js';
import { renderChatView, closeActiveChat } from './chatView.js';

// These two are new modules (Phase 3.5 / 3.9 / 3.10).
// They will exist by the time Phase 3 is complete.
// Using dynamic import wrappers keeps the router working even
// if one of them hasn't been created yet during phased rollout.
async function renderGroupInfoSafe(chatId) {
  try {
    const m = await import('./groupInfo.js');
    if (m.renderGroupInfo) m.renderGroupInfo(chatId);
  } catch (e) {
    console.warn('[router] groupInfo.js not ready:', e);
  }
}
async function renderGroupPreviewSafe(chatId) {
  try {
    const m = await import('./groups.js');
    if (m.renderGroupPreview) m.renderGroupPreview(chatId);
  } catch (e) {
    console.warn('[router] groups.js not ready:', e);
  }
}

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

    // 2. Show the target view.
    //    'user' reuses the profile DOM.
    let domView = view;
    if (view === 'user') domView = 'profile';
    const target = document.getElementById('view-' + domView);
    if (target) target.classList.remove('hidden');

    // 3. Update bottom nav highlight
    //    group-info / group-preview / user belong to no tab.
    const navless = ['user', 'group-info', 'group-preview'];
    $$('.nav-btn').forEach(b => {
      const active = navless.includes(view) ? false : b.dataset.view === view;
      b.classList.toggle('active', active);
    });

    // 4. Render view-specific content
    if (view === 'chats')        renderChats();
    if (view === 'friends')      renderFriends();
    if (view === 'search')       renderSearch();
    if (view === 'profile')      renderProfile();
    if (view === 'user')         renderProfile(opts.uid);
    if (view === 'chat')         renderChatView(opts.chatId);
    if (view === 'group-info')   renderGroupInfoSafe(opts.chatId);
    if (view === 'group-preview')renderGroupPreviewSafe(opts.chatId);

    // 5. Back button visibility
    const backVisible = ['chat', 'user', 'group-info', 'group-preview'].includes(view);
    $('#back-btn').classList.toggle('hidden', !backVisible);

    // 6. Topbar — logo OR dynamic title
    const logoEl = $('#topbar-logo');
    const titleEl = $('#topbar-title');

    if (view === 'chats') {
      logoEl.classList.remove('hidden');
      titleEl.classList.add('hidden');
    } else {
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
      else if (view === 'group-info')    title = 'Group Info';
      else if (view === 'group-preview') title = 'Group Invite';

      titleEl.textContent = title;
    }

    // 7. Hide bottom-nav while inside chat, group-info, group-preview
    const hideBottomNav = ['chat', 'group-info', 'group-preview'].includes(view);
    $('#bottom-nav').classList.toggle('hidden', hideBottomNav);

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

    // No state → force back to chats
    if (!st) {
      history.pushState({ view: 'chats' }, '', '#chats');
      router.render('chats');
      return;
    }

    // Chat can't be restored from history — needs live subs
    if (st.view === 'chat') {
      closeActiveChat();
      router.render('chats');
      return;
    }

    // Leaving a chat → tear down subs
    if (S.currentView === 'chat') closeActiveChat();

    // Leaving group-info / group-preview → clear cached state
    if (S.currentView === 'group-info') {
      S.viewingGroup = null;
      S.viewingGroupData = null;
      if (S.unsubGroupMembers) { S.unsubGroupMembers(); S.unsubGroupMembers = null; }
    }
    if (S.currentView === 'group-preview') {
      S.viewingInvite = null;
      S.viewingInviteData = null;
    }

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

    // From user profile → go back to where we came from
    if (S.currentView === 'user') {
      const from = S.currentViewOpts?.from || 'chats';
      history.pushState({ view: from }, '', '#' + from);
      router.render(from);
      return;
    }

    // From group-info → go back to the chat we came from (if any)
    //              or to chats list
    if (S.currentView === 'group-info') {
      const from = S.currentViewOpts?.from || 'chats';
      S.viewingGroup = null;
      S.viewingGroupData = null;
      if (S.unsubGroupMembers) { S.unsubGroupMembers(); S.unsubGroupMembers = null; }
      history.pushState({ view: from }, '', '#' + from);
      router.render(from);
      return;
    }

    // From group-preview → go back to notifications panel / chats
    if (S.currentView === 'group-preview') {
      const from = S.currentViewOpts?.from || 'chats';
      S.viewingInvite = null;
      S.viewingInviteData = null;
      history.pushState({ view: from }, '', '#' + from);
      router.render(from);
      return;
    }

    // Fallback
    history.back();
  };
}
