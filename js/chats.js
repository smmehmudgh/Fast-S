/* ============================================================
   VIEW: CHATS — chat list listener + rendering, the "+ New Chat"
   flow (direct / group), creating direct & group chats, and
   long-press → delete chat (own side only).

   Updates:
   1. listenChats filters out chats where S.user.uid is in
      chat.hidden (per-user hidden list).
   2. Long-press (mobile) + right-click (desktop) on a chat
      opens a context menu with "Delete Chat".
   3. deleteChat(chatId) adds the uid to `hidden` array — the
      other user still sees the chat.
   4. Sending a new message re-shows the chat (removes uid from
      hidden) — handled in messages.js.
   ============================================================ */
import {
  collection, addDoc, doc, query, where, onSnapshot, getDocs,
  updateDoc, serverTimestamp, arrayUnion, arrayRemove
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { escapeHtml, timeAgo, debounce, avatarUrl } from './utils.js';
import { toast, showModal, confirmDialog } from './ui.js';
import { isOnline } from './presence.js';
import { getUser } from './profile.js';
import { openChat } from './chatView.js';
import { router } from './router.js';
import { showCtxMenu } from './contextmenu.js';

// ============================================================
// FIRESTORE LISTENER
// ============================================================
export function listenChats() {
  if (S.unsubChats) S.unsubChats();
  const q = query(
    collection(db, 'chats'),
    where('members', 'array-contains', S.user.uid)
  );
  S.unsubChats = onSnapshot(q, (snap) => {
    const chats = [];
    snap.forEach(d => {
      const data = { id: d.id, ...d.data() };
      // Hide chats the user deleted from their own side
      if (data.hidden && data.hidden.includes(S.user.uid)) return;
      chats.push(data);
    });
    chats.sort((a, b) => {
      const ta = a.updatedAt?.toDate?.()?.getTime() || 0;
      const tb = b.updatedAt?.toDate?.()?.getTime() || 0;
      return tb - ta;
    });
    S.chats = chats;
    if (S.currentView === 'chats') renderChats();
  }, (e) => console.warn('chats listener error:', e));
}

// ============================================================
// RENDER
// ============================================================
export function renderChats() {
  const list = $('#chats-list');
  const q = ($('#chat-search').value || '').trim().toLowerCase();

  if (S.chats.length === 0) {
    list.innerHTML = `<div class="empty-state">
      <div style="font-size:48px;margin-bottom:10px">💬</div>
      <p>No chats yet</p>
      <p style="font-size:12px;margin-top:6px">Add friends and start messaging</p>
    </div>`;
    return;
  }

  let items = S.chats;
  if (q) items = items.filter(c => chatTitle(c).toLowerCase().includes(q));

  list.innerHTML = '';
  items.forEach(chat => {
    const el = document.createElement('div');
    el.className = 'list-item';
    el.dataset.chatId = chat.id;

    const other = chat.type === 'direct' ? chat.members.find(u => u !== S.user.uid) : null;
    const otherProfile = other ? (S.userCache[other] || {}) : null;
    const avatarSrc = chat.type === 'group'
      ? (chat.photoURL || `https://ui-avatars.com/api/?background=7b2ff7&color=fff&bold=true&name=${encodeURIComponent(chat.name || 'Group')}`)
      : avatarUrl(otherProfile);
    const online = chat.type === 'direct' && otherProfile && isOnline(otherProfile);
    const unread = (chat.unread && chat.unread[S.user.uid]) || 0;
    const last = chat.lastMessage;

    el.innerHTML = `
      <div class="list-avatar">
        <img src="${avatarSrc}" alt="">
        ${online ? '<div class="online-dot"></div>' : ''}
      </div>
      <div class="list-body">
        <div class="list-name">${escapeHtml(chatTitle(chat))}</div>
        <div class="list-sub">${last ? escapeHtml((last.senderName ? last.senderName.split(' ')[0] + ': ' : '') + (last.text || '📎')) : 'No messages yet'}</div>
      </div>
      <div class="list-meta">
        <span>${last ? timeAgo(last.createdAt) : ''}</span>
        ${unread ? `<span class="unread-badge">${unread}</span>` : ''}
      </div>
    `;

    // ---- Click / Long-press / Right-click ----
    attachChatInteractions(el, chat);

    list.appendChild(el);
  });
}

function attachChatInteractions(el, chat) {
  let pressTimer = null;
  let didLongPress = false;
  let startX = 0, startY = 0;

  // Desktop right-click
  el.oncontextmenu = (e) => {
    e.preventDefault();
    openChatMenu(e.clientX, e.clientY, chat);
  };

  // Mobile long-press
  el.addEventListener('touchstart', (e) => {
    didLongPress = false;
    const t = e.touches[0];
    startX = t.clientX;
    startY = t.clientY;
    el.classList.add('pressing');
    pressTimer = setTimeout(() => {
      didLongPress = true;
      el.classList.remove('pressing');
      openChatMenu(t.clientX, t.clientY, chat);
    }, 500);
  }, { passive: true });

  el.addEventListener('touchmove', (e) => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - startX) > 8 || Math.abs(t.clientY - startY) > 8) {
      clearTimeout(pressTimer);
      el.classList.remove('pressing');
    }
  }, { passive: true });

  el.addEventListener('touchend', () => {
    clearTimeout(pressTimer);
    el.classList.remove('pressing');
  });

  el.addEventListener('touchcancel', () => {
    clearTimeout(pressTimer);
    el.classList.remove('pressing');
  });

  // Click → open chat (unless long-press just fired)
  el.onclick = () => {
    if (didLongPress) { didLongPress = false; return; }
    openChat(chat.id, chat);
  };
}

// ============================================================
// CHAT CONTEXT MENU
// ============================================================
function openChatMenu(x, y, chat) {
  const items = [
    { icon: '💬', label: 'Open Chat', action: () => openChat(chat.id, chat) },
    { divider: true },
    {
      icon: '🗑️',
      label: 'Delete Chat',
      danger: true,
      action: () => confirmDeleteChat(chat)
    }
  ];
  showCtxMenu(x, y, items);
}

function confirmDeleteChat(chat) {
  const title = chatTitle(chat);
  const msg = chat.type === 'group'
    ? `Delete "${title}" from your chat list? You will still see it if someone messages you.`
    : `Delete chat with "${title}"? It will only be removed from your side. You will still see it if they message you again.`;

  confirmDialog('Delete Chat', msg, async () => {
    await deleteChat(chat.id);
  }, 'Delete');
}

async function deleteChat(chatId) {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      hidden: arrayUnion(S.user.uid)
    });
    toast('Chat deleted', 'success');
  } catch (err) {
    console.error('[deleteChat] failed:', err);
    toast('Could not delete chat', 'error');
  }
}

// ============================================================
// HELPERS
// ============================================================
export function chatTitle(chat) {
  if (chat.type === 'group') return chat.name || 'Group';
  const other = chat.members.find(u => u !== S.user.uid);
  const p = S.userCache[other];
  return p?.displayName || p?.username || 'User';
}

// ============================================================
// NEW CHAT BUTTON
// ============================================================
$('#new-chat-btn').onclick = () => {
  showModal('New Chat', `
    <button class="btn-secondary" id="new-direct" style="width:100%;margin-bottom:8px">👤 Direct Message</button>
    <button class="btn-secondary" id="new-group" style="width:100%">👥 New Group</button>
  `, null);
  $('#modal-ok').classList.add('hidden');
  $('#modal-cancel').onclick = () => {
    $('#modal').classList.add('hidden');
    $('#modal-ok').classList.remove('hidden');
  };
  setTimeout(() => {
    $('#new-direct').onclick = () => {
      $('#modal').classList.add('hidden');
      $('#modal-ok').classList.remove('hidden');
      router.go('friends');
    };
    $('#new-group').onclick = () => {
      $('#modal').classList.add('hidden');
      $('#modal-ok').classList.remove('hidden');
      createGroupFlow();
    };
  }, 30);
};

$('#chat-search').oninput = debounce(() => renderChats(), 200);

// ============================================================
// START DIRECT CHAT
// ============================================================
export async function startDirectChat(uid) {
  // Look for an existing direct chat (even if hidden — reuse it)
  const q = query(collection(db, 'chats'),
    where('type', '==', 'direct'),
    where('members', 'array-contains', S.user.uid));
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => {
    const m = d.data().members;
    return m.length === 2 && m.includes(uid);
  });

  if (existing) {
    // Un-hide if it was hidden
    const data = existing.data();
    if (data.hidden && data.hidden.includes(S.user.uid)) {
      await updateDoc(doc(db, 'chats', existing.id), {
        hidden: arrayRemove(S.user.uid)
      });
    }
    return openChat(existing.id, data);
  }

  const ref = await addDoc(collection(db, 'chats'), {
    type: 'direct',
    members: [S.user.uid, uid],
    admins: [],
    name: '',
    photoURL: '',
    lastMessage: null,
    unread: {},
    hidden: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
  openChat(ref.id, { id: ref.id, type: 'direct', members: [S.user.uid, uid] });
}

// ============================================================
// GROUP CHAT
// ============================================================
export async function createGroupFlow() {
  const friends = S.profile.friends || [];
  if (friends.length === 0) return toast('Add friends first', 'error');
  const profiles = (await Promise.all(friends.map(getUser))).filter(Boolean);

  showModal('New Group (max 5 members)', `
    <input type="text" id="grp-name" placeholder="Group name">
    <div style="max-height:280px;overflow-y:auto;margin-bottom:10px">
      ${profiles.map(p => `
        <label class="list-item" style="cursor:pointer">
          <input type="checkbox" value="${p.uid}" style="width:auto;margin-right:8px">
          <div class="list-avatar" style="width:36px;height:36px"><img src="${avatarUrl(p)}"></div>
          <div class="list-body"><div class="list-name">${escapeHtml(p.displayName)}</div></div>
        </label>
      `).join('')}
    </div>
  `, async () => {
    const name = $('#grp-name').value.trim();
    if (!name) { toast('Group name required', 'error'); return false; }
    const checked = $$('#modal-body input[type=checkbox]:checked').map(c => c.value);
    if (checked.length === 0) { toast('Select at least 1 friend', 'error'); return false; }
    if (checked.length > 4) { toast('Max 4 friends (5 with you)', 'error'); return false; }

    const members = [S.user.uid, ...checked];
    const ref = await addDoc(collection(db, 'chats'), {
      type: 'group',
      members,
      admins: [S.user.uid],
      name,
      photoURL: '',
      lastMessage: null,
      unread: {},
      hidden: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    toast('Group created ✅', 'success');
    openChat(ref.id, { id: ref.id, type: 'group', members, name });
  }, 'Create');
}
