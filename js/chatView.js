/* ============================================================
   Opening / closing the 1-on-1 or group chat screen. Kept
   separate from chats.js (the list) and messages.js (the
   message bubbles) to avoid a three-way circular tangle —
   this is the "glue" module both of those import.
   ============================================================ */
import { doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { subscribeMessages } from './messages.js';
import { subscribeTyping } from './typing.js';

export function chatTitleFor(chat) {
  // Small local copy to avoid importing chats.js (would create a cycle
  // with chats.js -> chatView.js -> chats.js). chats.js's chatTitle()
  // does the same thing for the chat list.
  if (chat.type === 'group') return chat.name || 'Group';
  const other = chat.members.find(u => u !== S.user.uid);
  const p = S.userCache[other];
  return p?.displayName || p?.username || 'User';
}

export async function openChat(chatId, chatData) {
  closeActiveChat();
  S.activeChat = chatId;

  const fresh = await getDoc(doc(db, 'chats', chatId));
  S.activeChatData = fresh.exists() ? { id: chatId, ...fresh.data() } : chatData;

  const title = chatTitleFor(S.activeChatData);
  S.currentView = 'chat';
  S.currentViewOpts = { chatId, title };

  // Render chat view directly
  $$('.view').forEach(v => v.classList.add('hidden'));
  $('#view-chat').classList.remove('hidden');
  $('#back-btn').classList.remove('hidden');
  $('#topbar-title').textContent = title;
  $('#bottom-nav').classList.add('hidden');
  history.pushState({ view: 'chat', opts: { chatId, title } }, '', '#chat');

  // Clear unread
  updateDoc(doc(db, 'chats', chatId), { [`unread.${S.user.uid}`]: 0 }).catch(() => {});

  subscribeMessages(chatId);
  subscribeTyping(chatId);
}

export function closeActiveChat() {
  if (S.unsubMsgs) { S.unsubMsgs(); S.unsubMsgs = null; }
  if (S.unsubTyping) { S.unsubTyping(); S.unsubTyping = null; }
  S.activeChat = null;
  S.activeChatData = null;
  S.replyTo = null;
  $('#reply-preview').classList.add('hidden');
}

export function renderChatView() {
  $('#chat-messages').innerHTML = '';
  if (S.activeChat) subscribeMessages(S.activeChat);
}
