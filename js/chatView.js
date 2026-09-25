/* ============================================================
   Opening / closing the 1-on-1 or group chat screen.

   Updates:
   1. Shows the partner's avatar in the topbar for direct chats.
   2. Makes the topbar title clickable → opens partner's profile.
   3. Hides the partner avatar + disables clickable title for
      group chats and when chat is closed.
   4. Group chat: clicking the title does nothing (no profile
      to open for a group).
   ============================================================ */
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { avatarUrl } from './utils.js';
import { subscribeMessages } from './messages.js';
import { subscribeTyping } from './typing.js';
import { router } from './router.js';

// ---- Which chat partner (for direct chats) ----
function getPartnerUid(chat) {
  if (!chat || chat.type !== 'direct') return null;
  return chat.members.find(u => u !== S.user.uid) || null;
}

// ---- Small local title resolver (avoid importing chats.js — cycles) ----
export function chatTitleFor(chat) {
  if (chat.type === 'group') return chat.name || 'Group';
  const other = chat.members.find(u => u !== S.user.uid);
  const p = S.userCache[other];
  return p?.displayName || p?.username || 'User';
}

// ============================================================
// OPEN CHAT
// ============================================================
export async function openChat(chatId, chatData) {
  closeActiveChat();
  S.activeChat = chatId;

  const fresh = await getDoc(doc(db, 'chats', chatId));
  S.activeChatData = fresh.exists() ? { id: chatId, ...fresh.data() } : chatData;

  const title = chatTitleFor(S.activeChatData);
  S.currentView = 'chat';
  S.currentViewOpts = { chatId, title };

  // Show chat view
  $$('.view').forEach(v => v.classList.add('hidden'));
  $('#view-chat').classList.remove('hidden');
  $('#back-btn').classList.remove('hidden');
  $('#bottom-nav').classList.add('hidden');

  // Title
  $('#topbar-title').textContent = title;

  // ---- Partner avatar + clickable title (direct chat only) ----
  const partnerUid = getPartnerUid(S.activeChatData);
  const titleEl = $('#topbar-title');
  const partnerAvatar = $('#chat-partner-avatar');

  if (partnerUid) {
    // Ensure partner profile is cached
    if (!S.userCache[partnerUid]) {
      const snap = await getDoc(doc(db, 'users', partnerUid));
      if (snap.exists()) S.userCache[partnerUid] = snap.data();
    }
    const partner = S.userCache[partnerUid];
    partnerAvatar.src = avatarUrl(partner);
    partnerAvatar.classList.remove('hidden');

    // Clickable title → open partner profile
    titleEl.dataset.clickable = 'true';
    titleEl.onclick = () => {
      router.go('user', { uid: partnerUid, from: 'chat' });
    };
  } else {
    // Group chat — no avatar, no clickable title
    partnerAvatar.classList.add('hidden');
    partnerAvatar.src = '';
    titleEl.dataset.clickable = 'false';
    titleEl.onclick = null;
  }

  history.pushState({ view: 'chat', opts: { chatId, title } }, '', '#chat');

  // Clear unread
  updateDoc(doc(db, 'chats', chatId), { [`unread.${S.user.uid}`]: 0 }).catch(() => {});

  // Subscriptions
  subscribeMessages(chatId);
  subscribeTyping(chatId);
}

// ============================================================
// CLOSE CHAT
// ============================================================
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

// ============================================================
// RE-RENDER (when returning to chat view)
// ============================================================
export function renderChatView() {
  $('#chat-messages').innerHTML = '';
  if (S.activeChat) subscribeMessages(S.activeChat);
}
