/* ============================================================
   VIEW: CHATS — chat list listener + rendering, the "+ New Chat"
   flow (direct / group), and creating direct & group chats.
   ============================================================ */
import {
  collection, addDoc, query, where, onSnapshot, getDocs, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { escapeHtml, timeAgo, debounce, avatarUrl } from './utils.js';
import { toast, showModal } from './ui.js';
import { isOnline } from './presence.js';
import { getUser } from './profile.js';
import { openChat } from './chatView.js';
import { router } from './router.js';

// ===== Firestore listener =====
export function listenChats() {
  if (S.unsubChats) S.unsubChats();
  const q = query(
    collection(db, 'chats'),
    where('members', 'array-contains', S.user.uid)
  );
  S.unsubChats = onSnapshot(q, (snap) => {
    const chats = [];
    snap.forEach(d => chats.push({ id: d.id, ...d.data() }));
    chats.sort((a, b) => {
      const ta = a.updatedAt?.toDate?.()?.getTime() || 0;
      const tb = b.updatedAt?.toDate?.()?.getTime() || 0;
      return tb - ta;
    });
    S.chats = chats;
    if (S.currentView === 'chats') renderChats();
  }, (e) => console.warn('chats listener error:', e));
}

// ===== Render =====
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
    el.onclick = () => openChat(chat.id, chat);
    list.appendChild(el);
  });
}

export function chatTitle(chat) {
  if (chat.type === 'group') return chat.name || 'Group';
  const other = chat.members.find(u => u !== S.user.uid);
  const p = S.userCache[other];
  return p?.displayName || p?.username || 'User';
}

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
  if (existing) return openChat(existing.id, existing.data());

  const ref = await addDoc(collection(db, 'chats'), {
    type: 'direct',
    members: [S.user.uid, uid],
    admins: [],
    name: '',
    photoURL: '',
    lastMessage: null,
    unread: {},
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    toast('Group created ✅', 'success');
    openChat(ref.id, { id: ref.id, type: 'group', members, name });
  }, 'Create');
}
