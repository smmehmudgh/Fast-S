/* ============================================================
   VIEW: CHATS — chat list listener + rendering, "+ New Chat"
   flow (direct / group), long-press context menu, Delete Chat,
   Leave Group, and the new INVITE-ONLY group create flow.

   Phase 3.8 updates:
   1. Group create now opens a full-screen modal with:
        • Search bar (finds any user by name/@username)
        • Friends list (from S.profile.friends)
        • Multi-select checkboxes with live chips
        • "Invite" button — creates the group with only YOU as
          member, and puts all selected users in `invited`.
   2. Every selected user gets a `group-invite` notification.
   3. Group create no longer forces the invited users in —
      they must accept via the invite preview.
   4. All previous features (long-press, delete, leave) kept.
   ============================================================ */
import {
  collection, addDoc, doc, query, where, onSnapshot, getDocs,
  updateDoc, serverTimestamp, arrayUnion, arrayRemove, getDoc,
  limit, orderBy, startAt, endAt
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
// CHAT ROW INTERACTIONS (Pointer Events for reliable long-press)
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

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerActive = true;
    didLongPress = false;
    startX = e.clientX;
    startY = e.clientY;

    setTimeout(() => {
      if (pointerActive) el.classList.add('pressing');
    }, 120);

    pressTimer = setTimeout(() => {
      pressTimer = null;
      if (!pointerActive) return;
      didLongPress = true;
      el.classList.remove('pressing');
      openChatMenu(e.clientX, e.clientY, chat);
      if (navigator.vibrate) navigator.vibrate(20);
    }, LONG_PRESS_MS);
  }, { passive: true });

  el.addEventListener('pointermove', (e) => {
    if (!pointerActive) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > MOVE_TOLERANCE || dy > MOVE_TOLERANCE) {
      pointerActive = false;
      cancelPress();
    }
  }, { passive: true });

  const onPointerEnd = () => {
    pointerActive = false;
    cancelPress();
  };
  el.addEventListener('pointerup', onPointerEnd);
  el.addEventListener('pointercancel', onPointerEnd);
  el.addEventListener('pointerleave', onPointerEnd);

  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openChatMenu(e.clientX, e.clientY, chat);
  });

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

    const fresh = await getDoc(doc(db, 'chats', chat.id));
    if (!fresh.exists()) {
      toast('Group no longer exists', 'error');
      return;
    }
    const data = fresh.data();
    const members = (data.members || []).filter(u => u !== myUid);
    let admins = (data.admins || []).filter(u => u !== myUid);

    if (admins.length === 0 && members.length > 0) {
      admins = [members[0]];
    }

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
// GROUP CREATE FLOW  (Phase 3.8 — invite-only + search)
// ============================================================
export async function createGroupFlow() {
  // Two-stage: (1) name input  →  (2) member picker
  const name = await promptGroupName();
  if (!name) return;
  showMemberPicker(name);
}

function promptGroupName() {
  return new Promise((resolve) => {
    showModal('New Group — Step 1/2',
      `<input type="text" id="grp-name-input" placeholder="Group name (e.g. Family)"
              maxlength="40" autocomplete="off">`,
      () => {
        const v = $('#grp-name-input').value.trim();
        if (!v) { toast('Please enter a group name', 'error'); return false; }
        resolve(v);
      }, 'Next');
    // If user cancels, resolve(null)
    const cancelBtn = $('#modal-cancel');
    const originalCancel = cancelBtn.onclick;
    cancelBtn.onclick = () => {
      if (originalCancel) originalCancel();
      resolve(null);
    };
  });
}

// ------------------------------------------------------------
// Step 2 — Member picker (friends + search)
// ------------------------------------------------------------
function showMemberPicker(groupName) {
  // Local selection state
  const selected = new Map();   // uid -> profile

  const modal = $('#modal');
  $('#modal-title').textContent = 'New Group — Step 2/2';
  $('#modal-body').innerHTML = `
    <div class="picker-wrap">

      <div class="picker-header">
        <div class="picker-group-name">👥 ${escapeHtml(groupName)}</div>
        <div class="picker-hint">
          Friends added by default. Search to invite anyone else.
        </div>
      </div>

      <div class="picker-selected" id="picker-selected">
        <!-- selected chips appear here -->
      </div>

      <input type="text" id="picker-search" class="search-input"
             placeholder="🔍 Search by name or @username..."
             autocomplete="off">

      <div class="picker-section-label">FRIENDS</div>
      <div class="picker-list" id="picker-friends-list">
        <div class="empty-state">Loading…</div>
      </div>

      <div class="picker-section-label" id="picker-search-label" style="display:none;">
        SEARCH RESULTS
      </div>
      <div class="picker-list" id="picker-search-list" style="display:none;"></div>

    </div>
  `;

  $('#modal-ok').textContent = 'Send Invites';
  $('#modal-ok').classList.remove('hidden');
  $('#modal-cancel').textContent = 'Back';

  // ---- Load friends list ----
  renderFriendPicker(groupName, selected);

  // ---- Search box ----
  const searchEl = $('#picker-search');
  searchEl.oninput = debounce(() => {
    runPickerSearch(searchEl.value.trim(), groupName, selected);
  }, 300);

  // ---- Cancel → back to name step ----
  $('#modal-cancel').onclick = () => {
    modal.classList.add('hidden');
    // Reopen name step
    setTimeout(() => promptGroupName().then(n => { if (n) showMemberPicker(n); }), 50);
  };

  // ---- OK → create group with invites ----
  $('#modal-ok').onclick = async () => {
    if (selected.size === 0) {
      toast('Select at least one person', 'error');
      return false;
    }
    const invitedUids = [...selected.keys()];
    modal.classList.add('hidden');
    await finalizeGroupCreate(groupName, invitedUids);
  };

  modal.classList.remove('hidden');
}

// ---- Friends list render (with checkbox + click toggle) ----
async function renderFriendPicker(groupName, selected) {
  const container = $('#picker-friends-list');
  const friends = S.profile?.friends || [];
  if (friends.length === 0) {
    container.innerHTML = '<div class="empty-state">No friends yet — use Search below to find people</div>';
    return;
  }
  const profiles = (await Promise.all(friends.map(uid => getUser(uid)))).filter(Boolean);
  container.innerHTML = '';
  profiles.forEach(p => {
    container.appendChild(buildPickerRow(p, selected, groupName));
  });
}

// ---- Search users ----
async function runPickerSearch(q, groupName, selected) {
  const searchLabel = $('#picker-search-label');
  const searchList = $('#picker-search-list');

  if (!q || q.length < 2) {
    searchLabel.style.display = 'none';
    searchList.style.display = 'none';
    searchList.innerHTML = '';
    return;
  }

  searchLabel.style.display = '';
  searchList.style.display = '';
  searchList.innerHTML = '<div class="empty-state">Searching…</div>';

  const clean = q.toLowerCase().replace(/^@+/, '');
  const usersRef = collection(db, 'users');
  const found = new Map();

  // Username prefix
  try {
    const q1 = query(usersRef, orderBy('username'),
      startAt(clean), endAt(clean + '\uf8ff'), limit(15));
    const s1 = await getDocs(q1);
    s1.forEach(d => {
      if (d.id !== S.user.uid) found.set(d.id, { uid: d.id, ...d.data() });
    });
  } catch (e) { /* ignore */ }

  // Display name prefix
  try {
    const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
    const q2 = query(usersRef, orderBy('displayName'),
      startAt(cap), endAt(cap + '\uf8ff'), limit(15));
    const s2 = await getDocs(q2);
    s2.forEach(d => {
      if (d.id !== S.user.uid) found.set(d.id, { uid: d.id, ...d.data() });
    });
  } catch (e) { /* ignore */ }

  // Fallback: filter client side from a small page
  if (found.size === 0) {
    try {
      const snapAll = await getDocs(query(usersRef, limit(150)));
      snapAll.forEach(d => {
        if (d.id === S.user.uid) return;
        const u = d.data();
        const un = (u.username || '').toLowerCase();
        const dn = (u.displayName || '').toLowerCase();
        if (un.includes(clean) || dn.includes(clean)) {
          found.set(d.id, { uid: d.id, ...u });
        }
      });
    } catch (e) { /* ignore */ }
  }

  const results = [...found.values()];
  if (results.length === 0) {
    searchList.innerHTML = '<div class="empty-state">No users found</div>';
    return;
  }

  searchList.innerHTML = '';
  results.forEach(p => {
    S.userCache[p.uid] = p;
    searchList.appendChild(buildPickerRow(p, selected, groupName));
  });
}

// ---- Build a single picker row (checkbox style) ----
function buildPickerRow(p, selected, groupName) {
  const row = document.createElement('div');
  row.className = 'picker-row';
  row.dataset.uid = p.uid;

  const isSelected = selected.has(p.uid);
  if (isSelected) row.classList.add('selected');

  row.innerHTML = `
    <div class="picker-check">${isSelected ? '✓' : ''}</div>
    <div class="list-avatar" style="width:40px;height:40px;">
      <img src="${avatarUrl(p)}" alt="">
    </div>
    <div class="list-body">
      <div class="list-name">${escapeHtml(p.displayName || 'User')}</div>
      <div class="list-sub">@${escapeHtml(p.username || '')}</div>
    </div>
  `;

  row.onclick = () => {
    if (selected.has(p.uid)) {
      selected.delete(p.uid);
      row.classList.remove('selected');
      row.querySelector('.picker-check').textContent = '';
    } else {
      selected.set(p.uid, p);
      row.classList.add('selected');
      row.querySelector('.picker-check').textContent = '✓';
    }
    updatePickerChips(selected);
    // Keep all rows with same uid in sync (friend list + search)
    $$(`.picker-row[data-uid="${p.uid}"]`).forEach(r => {
      r.classList.toggle('selected', selected.has(p.uid));
      const c = r.querySelector('.picker-check');
      if (c) c.textContent = selected.has(p.uid) ? '✓' : '';
    });
  };

  return row;
}

// ---- Selected chips row ----
function updatePickerChips(selected) {
  const wrap = $('#picker-selected');
  if (!wrap) return;
  if (selected.size === 0) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = '';
  selected.forEach((p, uid) => {
    const chip = document.createElement('div');
    chip.className = 'picker-chip';
    chip.innerHTML = `
      <img src="${avatarUrl(p)}" alt="">
      <span>${escapeHtml(p.displayName || p.username || 'User')}</span>
      <button type="button" aria-label="Remove">×</button>
    `;
    chip.querySelector('button').onclick = (e) => {
      e.stopPropagation();
      selected.delete(uid);
      updatePickerChips(selected);
      $$(`.picker-row[data-uid="${uid}"]`).forEach(r => {
        r.classList.remove('selected');
        const c = r.querySelector('.picker-check');
        if (c) c.textContent = '';
      });
    };
    wrap.appendChild(chip);
  });
}

// ------------------------------------------------------------
// Create group + send invites
// ------------------------------------------------------------
async function finalizeGroupCreate(groupName, invitedUids) {
  try {
    // 1. Create chat doc — only the creator is a member for now
    const chatRef = await addDoc(collection(db, 'chats'), {
      type: 'group',
      name: groupName,
      bio: '',
      photoURL: '',
      members: [S.user.uid],
      admins: [S.user.uid],
      invited: invitedUids.slice(),      // pending invitations
      lastMessage: null,
      unread: {},
      hidden: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    const chatId = chatRef.id;

    // 2. Send a notification to each invited user
    for (const uid of invitedUids) {
      await addDoc(collection(db, 'users', uid, 'notifications'), {
        icon: '👥',
        title: 'Group Invitation',
        text: `${S.profile.displayName} invited you to join "${groupName}"`,
        type: 'group-invite',
        chatId,
        from: S.user.uid,
        groupName,
        read: false,
        createdAt: serverTimestamp()
      });
    }

    toast('Group created & invites sent ✅', 'success');

    // 3. Open the new group chat (only me in it right now)
    openChat(chatId, {
      id: chatId,
      type: 'group',
      name: groupName,
      members: [S.user.uid],
      admins: [S.user.uid],
      invited: invitedUids
    });
  } catch (err) {
    console.error('[finalizeGroupCreate]', err);
    toast('Could not create group', 'error');
  }
}
