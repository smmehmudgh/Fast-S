/* ============================================================
   VIEW: CHATS — chat list listener + rendering, "+ New Chat"
   flow (direct / group), long-press context menu, Delete Chat,
   and Leave Group.

   Phase 1.1 updates:
   1. Long-press now works reliably on mobile using Pointer Events
      (pointerdown/pointermove/pointerup/pointercancel) which
      unifies mouse + touch + pen and doesn't fight with scrolling.
   2. Context menu for groups now shows "Leave Group" alongside
      "Delete Chat".
   3. Every interaction is guarded so a long-press never triggers
      the row's click handler (opening the chat).
   ============================================================ */
import {
  collection, addDoc, doc, query, where, onSnapshot, getDocs,
  updateDoc, serverTimestamp, arrayUnion, arrayRemove, getDoc
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

    attachChatInteractions(el, chat);
    list.appendChild(el);
  });
}

// ============================================================
// CHAT ROW INTERACTIONS (click + long-press + right-click)
// Uses Pointer Events for reliable mobile long-press.
// ============================================================
function attachChatInteractions(el, chat) {
  const LONG_PRESS_MS = 500;
  const MOVE_TOLERANCE = 10;

  let pressTimer = null;
  let startX = 0, startY = 0;
  let didLongPress = false;
  let pointerActive = false;

  const cancelPress = () => {
    if (pressTimer) {
      clearTimeout(pressTimer);
      pressTimer = null;
    }
    el.classList.remove('pressing');
  };

  // ---- Pointer Down: start long-press timer ----
  el.addEventListener('pointerdown', (e) => {
    // Only start on primary button (mouse left / touch / pen)
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerActive = true;
    didLongPress = false;
    startX = e.clientX;
    startY = e.clientY;

    // Visual feedback after a short delay (avoid flicker on quick taps)
    setTimeout(() => {
      if (pointerActive) el.classList.add('pressing');
    }, 120);

    pressTimer = setTimeout(() => {
      pressTimer = null;
      if (!pointerActive) return;
      didLongPress = true;
      el.classList.remove('pressing');
      openChatMenu(e.clientX, e.clientY, chat);
      // Slight haptic feedback if supported
      if (navigator.vibrate) navigator.vibrate(20);
    }, LONG_PRESS_MS);
  }, { passive: true });

  // ---- Pointer Move: cancel if finger/mouse moves too far ----
  el.addEventListener('pointermove', (e) => {
    if (!pointerActive) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
      pointerActive = false;
      cancelPress();
    }
  }, { passive: true });

  // ---- Pointer Up: cancel timer (short tap → click) ----
  const onPointerEnd = () => {
    pointerActive = false;
    cancelPress();
  };
  el.addEventListener('pointerup', onPointerEnd);
  el.addEventListener('pointercancel', onPointerEnd);
  el.addEventListener('pointerleave', onPointerEnd);

  // ---- Right-click (desktop) ----
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openChatMenu(e.clientX, e.clientY, chat);
  });

  // ---- Click: open chat, unless a long-press just fired ----
  el.addEventListener('click', (e) => {
    if (didLongPress) {
      didLongPress = false;
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    openChat(chat.id, chat);
  });
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

  // Group-only: Leave Group
  if (chat.type === 'group') {
    items.push({
      icon: '🚪',
      label: 'Leave Group',
      danger: true,
      action: () => confirmLeaveGroup(chat)
    });
  }

  showCtxMenu(x, y, items);
}

// ============================================================
// DELETE CHAT (per-user hide)
// ============================================================
function confirmDeleteChat(chat) {
  const title = chatTitle(chat);
  const msg = chat.type === 'group'
    ? `Delete "${title}" from your chat list? You will still see it if someone messages you again.`
    : `Delete chat with "${title}"? It will only be removed from your side. You will still see it if they message you again.`;

  confirmDialog('Delete Chat', msg, async () => {
    try {
      await updateDoc(doc(db, 'chats', chat.id), {
        hidden: arrayUnion(S.user.uid)
      });
      toast('Chat deleted', 'success');
    } catch (err) {
      console.error('[deleteChat]', err);
      toast('Could not delete chat', 'error');
    }
  }, 'Delete');
}

// ============================================================
// LEAVE GROUP
// ============================================================
function confirmLeaveGroup(chat) {
  const title = chatTitle(chat);
  const isAdmin = (chat.admins || []).includes(S.user.uid);
  const adminCount = (chat.admins || []).length;

  let extra = '';
  if (isAdmin && adminCount === 1 && (chat.members || []).length > 1) {
    extra = '\n\nYou are the only admin. Another member will become admin automatically.';
  }

  confirmDialog(
    'Leave Group',
    `Leave "${title}"? You will stop receiving messages from this group.${extra}`,
    async () => {
      await leaveGroup(chat);
    },
    'Leave'
  );
}

async function leaveGroup(chat) {
  try {
    const myUid = S.user.uid;

    // Re-fetch latest to avoid race conditions
    const fresh = await getDoc(doc(db, 'chats', chat.id));
    if (!fresh.exists()) {
      toast('Group no longer exists', 'error');
      return;
    }
    const data = fresh.data();
    const members = (data.members || []).filter(u => u !== myUid);
    let admins = (data.admins || []).filter(u => u !== myUid);

    // If I was the only admin and members remain → promote someone
    if (admins.length === 0 && members.length > 0) {
      admins = [members[0]];
    }

    // If no members left → delete the chat entirely
    if (members.length === 0) {
      const { deleteDoc } = await import(
        "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
      );
      await deleteDoc(doc(db, 'chats', chat.id));
      toast('Group removed', 'success');
      return;
    }

    await updateDoc(doc(db, 'chats', chat.id), {
      members,
      admins,
      updatedAt: serverTimestamp()
    });

    toast('You left the group', 'success');
  } catch (err) {
    console.error('[leaveGroup]', err);
    toast('Could not leave group', 'error');
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
  const q = query(collection(db, 'chats'),
    where('type', '==', 'direct'),
    where('members', 'array-contains', S.user.uid));
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => {
    const m = d.data().members;
    return m.length === 2 && m.includes(uid);
  });

  if (existing) {
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
// GROUP CREATE (Phase 3-এ upgrade হবে — এখন basic version)
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
