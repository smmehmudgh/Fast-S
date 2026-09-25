/* ============================================================
   Opening / closing the 1-on-1 or group chat screen.

   Phase 3.5 updates:
   1. Group chats now show the group avatar in the topbar
      (fallback to a gradient initial avatar).
   2. Group title click → opens the Group Info view.
   3. Direct chats unchanged: partner avatar + name click →
      opens that user's profile.
   4. Topbar clickable state is set via `data-clickable` so CSS
      can show the pointer cursor consistently.
   ============================================================ */
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { avatarUrl } from './utils.js';
import { subscribeMessages } from './messages.js';
import { subscribeTyping } from './typing.js';
import { router } from './router.js';

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
function getPartnerUid(chat) {
  if (!chat || chat.type !== 'direct') return null;
  return chat.members.find(u => u !== S.user.uid) || null;
}

// Build a URL for the group avatar
// (photoURL if set, otherwise a UI-Avatars initial badge in purple)
function groupAvatarUrl(chat) {
  if (chat?.photoURL) return chat.photoURL;
  const name = chat?.name || 'Group';
  return `https://ui-avatars.com/api/?background=7b2ff7&color=fff&bold=true&size=128&name=${encodeURIComponent(name)}`;
}

// Local title resolver (avoid importing chats.js — prevents cycles)
export function chatTitleFor(chat) {
  if (!chat) return 'Chat';
  if (chat.type === 'group') return chat.name || 'Group';
  const other = chat.members.find(u => u !== S.user.uid);
  const p = S.userCache[other];
  return p?.displayName || p?.username || 'User';
}

// ------------------------------------------------------------
// Prepare topbar for the chat
// ------------------------------------------------------------
async function setupTopbar(chat) {
  const titleEl = $('#topbar-title');
  const partnerAvatar = $('#chat-partner-avatar');

  // ---- Group chat ----
  if (chat.type === 'group') {
    // Group avatar
    partnerAvatar.src = groupAvatarUrl(chat);
    partnerAvatar.classList.remove('hidden');

    // Clickable → group info
    titleEl.textContent = chat.name || 'Group';
    titleEl.dataset.clickable = 'true';
    titleEl.onclick = () => {
      router.go('group-info', { chatId: chat.id, from: 'chat' });
    };
    return;
  }

  // ---- Direct chat ----
  const partnerUid = getPartnerUid(chat);
  if (!partnerUid) {
    // Safety fallback
    partnerAvatar.classList.add('hidden');
    partnerAvatar.src = '';
    titleEl.dataset.clickable = 'false';
    titleEl.onclick = null;
    return;
  }

  // Ensure partner profile is cached
  if (!S.userCache[partnerUid]) {
    try {
      const snap = await getDoc(doc(db, 'users', partnerUid));
      if (snap.exists()) S.userCache[partnerUid] = snap.data();
    } catch (e) {
      console.warn('[chatView] partner fetch failed:', e);
    }
  }
  const partner = S.userCache[partnerUid];

  partnerAvatar.src = avatarUrl(partner);
  partnerAvatar.classList.remove('hidden');

  // Clickable → user profile
  titleEl.textContent = partner?.displayName || partner?.username || 'User';
  titleEl.dataset.clickable = 'true';
  titleEl.onclick = () => {
    router.go('user', { uid: partnerUid, from: 'chat' });
  };
}

// ------------------------------------------------------------
// OPEN CHAT
// ------------------------------------------------------------
export async function openChat(chatId, chatData) {
  closeActiveChat();
  S.activeChat = chatId;

  // Prefer freshly-loaded data
  let chat;
  try {
    const fresh = await getDoc(doc(db, 'chats', chatId));
    chat = fresh.exists() ? { id: chatId, ...fresh.data() } : chatData;
  } catch (e) {
    console.warn('[openChat] fetch failed, using passed data:', e);
    chat = chatData || { id: chatId };
  }
  S.activeChatData = chat;

  const title = chatTitleFor(chat);
  S.currentView = 'chat';
  S.currentViewOpts = { chatId, title };

  // Show chat view
  $$('.view').forEach(v => v.classList.add('hidden'));
  $('#view-chat').classList.remove('hidden');
  $('#back-btn').classList.remove('hidden');
  $('#bottom-nav').classList.add('hidden');

  // Topbar
  await setupTopbar(chat);

  // History
  history.pushState({ view: 'chat', opts: { chatId, title } }, '', '#chat');

  // Clear unread
  updateDoc(doc(db, 'chats', chatId), { [`unread.${S.user.uid}`]: 0 }).catch(() => {});

  // Subscriptions
  subscribeMessages(chatId);
  subscribeTyping(chatId);
}

// ------------------------------------------------------------
// CLOSE CHAT
// ------------------------------------------------------------
export function closeActiveChat() {
  if (S.unsubMsgs) { S.unsubMsgs(); S.unsubMsgs = null; }
  if (S.unsubTyping) { S.unsubTyping(); S.unsubTyping = null; }

  S.activeChat = null;
  S.activeChatData = null;
  S.replyTo = null;

  // Reset topbar
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

  // Reset reply preview
  const replyPreview = $('#reply-preview');
  if (replyPreview) replyPreview.classList.add('hidden');

  // Reset typing indicator
  const typing = $('#typing-indicator');
  if (typing) typing.classList.add('hidden');
}

// ------------------------------------------------------------
// RE-RENDER (when returning to chat view via router)
// ------------------------------------------------------------
export function renderChatView() {
  $('#chat-messages').innerHTML = '';
  if (!S.activeChat) return;

  // Reapply topbar in case it got reset
  if (S.activeChatData) {
    setupTopbar(S.activeChatData).catch(() => {});
  }

  subscribeMessages(S.activeChat);
}
