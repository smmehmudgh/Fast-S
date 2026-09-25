/* ============================================================
   Group Info page — the last piece of the group system.

   Responsibilities:
   • renderGroupInfo(chatId)   — main entry (called by router)
   • Live subscription to the chat doc so member changes reflect
     in real time
   • Member list rendering (admin crown, "You" pill, kick button)
   • Admin-only actions: edit group, add member, kick, promote,
     demote
   • Leave Group for anyone

   Delegates actual Firestore writes to js/groups.js so the
   business logic lives in one place.
   ============================================================ */
import {
  doc, getDoc, onSnapshot, updateDoc, serverTimestamp, arrayUnion
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { escapeHtml, avatarUrl } from './utils.js';
import { toast, showModal, confirmDialog } from './ui.js';
import { getUser } from './profile.js';
import { compressImage, IMAGE_MAX } from './files.js';
import {
  addMembers, kickMember, promoteAdmin, demoteAdmin, leaveGroup,
  searchUsersForPicker
} from './groups.js';
import { openChat } from './chatView.js';
import { router } from './router.js';

// ============================================================
// HELPERS
// ============================================================
function groupAvatarUrl(chat) {
  if (chat?.photoURL) return chat.photoURL;
  const name = chat?.name || 'Group';
  return `https://ui-avatars.com/api/?background=7b2ff7&color=fff&bold=true&size=128&name=${encodeURIComponent(name)}`;
}

function isAdmin(chat) {
  return (chat?.admins || []).includes(S.user.uid);
}

function isMember(chat) {
  return (chat?.members || []).includes(S.user.uid);
}

// ============================================================
// MAIN ENTRY — called by router
// ============================================================
export async function renderGroupInfo(chatId) {
  S.viewingGroup = chatId;

  const container = $('#group-info-content');
  if (!container) return;

  // Show loading first
  container.innerHTML = `
    <div class="group-loading">
      <div class="spinner" style="width:20px;height:20px;border-width:2px;"></div>
      Loading group...
    </div>
  `;

  // Initial fetch
  let chat;
  try {
    const snap = await getDoc(doc(db, 'chats', chatId));
    if (!snap.exists()) {
      container.innerHTML = `
        <div class="group-empty">
          <div style="font-size:48px;margin-bottom:12px;">👻</div>
          <p>This group no longer exists.</p>
        </div>`;
      return;
    }
    chat = { id: chatId, ...snap.data() };
    if (chat.type !== 'group') {
      container.innerHTML = `
        <div class="group-empty">
          <p>Not a group chat.</p>
        </div>`;
      return;
    }
  } catch (e) {
    console.error('[renderGroupInfo] fetch failed:', e);
    container.innerHTML = `<div class="group-empty">Could not load group.</div>`;
    return;
  }

  S.viewingGroupData = chat;

  // Live updates
  subscribeGroupInfo(chatId);

  // Initial render
  await renderGroupInfoContent(chat);
}

// ============================================================
// LIVE SUBSCRIPTION
// ============================================================
function subscribeGroupInfo(chatId) {
  if (S.unsubGroupMembers) S.unsubGroupMembers();
  S.unsubGroupMembers = onSnapshot(doc(db, 'chats', chatId), (snap) => {
    if (!snap.exists()) {
      // Group deleted (all members left)
      toast('Group no longer exists', 'error');
      S.viewingGroup = null;
      S.viewingGroupData = null;
      router.go('chats');
      return;
    }
    const data = snap.data();
    if (data.type !== 'group') return;

    // Kicked or removed
    const stillIn = (data.members || []).includes(S.user.uid)
                 || (data.invited || []).includes(S.user.uid);
    if (!stillIn) {
      toast('You are no longer in this group', 'error');
      S.viewingGroup = null;
      S.viewingGroupData = null;
      router.go('chats');
      return;
    }

    S.viewingGroupData = { id: chatId, ...data };
    renderGroupInfoContent(S.viewingGroupData);
  }, (e) => console.warn('[groupInfo listener]', e));
}

// ============================================================
// RENDER CONTENT
// ============================================================
async function renderGroupInfoContent(chat) {
  const container = $('#group-info-content');
  if (!container) return;

  const admin = isAdmin(chat);
  const me = S.user.uid;
  const memberCount = (chat.members || []).length;
  const adminCount = (chat.admins || []).length;
  const invitedCount = (chat.invited || []).length;
  const bio = (chat.bio || '').trim();

  // Fetch member profiles (parallel)
  const memberProfiles = [];
  for (const uid of (chat.members || [])) {
    const p = S.userCache[uid] || await getUser(uid);
    if (p) memberProfiles.push(p);
  }

  // Build member rows HTML
  const memberRowsHtml = memberProfiles.map(p => {
    const pIsAdmin = (chat.admins || []).includes(p.uid);
    const pIsMe = p.uid === me;
    const canKick = admin && !pIsMe;
    const canPromote = admin && !pIsMe && !pIsAdmin;
    const canDemote = admin && !pIsMe && pIsAdmin && adminCount > 1;

    return `
      <div class="group-member" data-uid="${p.uid}">
        <div class="group-member-avatar">
          <img src="${avatarUrl(p)}" alt="">
        </div>
        <div class="group-member-body">
          <div class="group-member-name">
            ${escapeHtml(p.displayName || 'User')}
            ${pIsAdmin ? '<span class="admin-crown" title="Admin">👑</span>' : ''}
            ${pIsMe ? '<span class="group-member-you">You</span>' : ''}
          </div>
          <div class="group-member-sub">@${escapeHtml(p.username || '')}</div>
        </div>
        ${(canKick || canPromote || canDemote) ? `
          <div class="group-member-action">
            <button class="mini-btn ${canPromote ? 'promote' : ''} ${canKick ? 'kick' : ''}"
                    data-action="menu" data-uid="${p.uid}">
              ⋯
            </button>
          </div>` : ''}
      </div>
    `;
  }).join('');

  // Build page HTML
  container.innerHTML = `
    <div class="group-info-card">
      <div class="group-info-avatar-wrap">
        <div class="group-info-avatar">
          <img src="${groupAvatarUrl(chat)}" alt=""
               style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
        </div>
        ${admin ? `
          <label for="group-avatar-upload" class="group-info-avatar-edit" title="Change photo">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                 stroke-linecap="round" stroke-linejoin="round" style="width:16px;height:16px;">
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
          </label>
          <input type="file" id="group-avatar-upload" accept="image/*" hidden>
        ` : ''}
      </div>

      <div class="group-info-name">${escapeHtml(chat.name || 'Group')}</div>

      <div class="group-info-type">
        <span class="type-badge">Group</span>
        ${admin ? '<span style="color:var(--accent);font-weight:600;">· You are admin</span>' : ''}
      </div>

      ${bio ? `<div class="group-info-bio">${escapeHtml(bio)}</div>` : ''}
    </div>

    <div class="group-info-stats">
      <div class="stat-item">
        <div class="stat-value">${memberCount}</div>
        <div class="stat-label">Members</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${adminCount}</div>
        <div class="stat-label">Admins</div>
      </div>
      ${invitedCount > 0 ? `
        <div class="stat-item">
          <div class="stat-value">${invitedCount}</div>
          <div class="stat-label">Invited</div>
        </div>
      ` : ''}
    </div>

    <div class="group-info-actions">
      ${admin ? `
        <button class="btn-secondary" id="gi-edit">
          ✏️ Edit Group
        </button>
        <button class="btn-secondary" id="gi-add">
          ➕ Add Member
        </button>
      ` : ''}
      <button class="btn-secondary" id="gi-open-chat">
        💬 Open Chat
      </button>
    </div>

    <div class="group-info-section-title">
      <span>Members</span>
      <span class="count-badge">${memberCount}</span>
    </div>

    <div class="group-members-list">
      ${memberRowsHtml || '<div class="group-empty">No members yet</div>'}
    </div>

    <div class="group-info-danger">
      <button class="btn-danger" id="gi-leave">
        🚪 Leave Group
      </button>
    </div>
  `;

  // ---- Wire action buttons ----
  const editBtn = $('#gi-edit');
  if (editBtn) editBtn.onclick = () => showEditGroupDialog(chat);

  const addBtn = $('#gi-add');
  if (addBtn) addBtn.onclick = () => showAddMemberPicker(chat);

  const openChatBtn = $('#gi-open-chat');
  if (openChatBtn) openChatBtn.onclick = () => {
    openChat(chat.id, chat);
  };

  const leaveBtn = $('#gi-leave');
  if (leaveBtn) leaveBtn.onclick = () => confirmLeave(chat);

  // ---- Wire member ⋯ menus ----
  $$('#group-info-content [data-action="menu"]').forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      const uid = btn.dataset.uid;
      const targetIsAdmin = (chat.admins || []).includes(uid);
      const canKick = admin && uid !== me;
      const canPromote = admin && uid !== me && !targetIsAdmin;
      const canDemote = admin && uid !== me && targetIsAdmin && adminCount > 1;

      const items = [];
      if (canPromote) items.push({
        icon: '👑', label: 'Make Admin',
        action: () => promoteAdmin(chat.id, uid)
      });
      if (canDemote) items.push({
        icon: '🔽', label: 'Remove Admin',
        action: () => demoteAdmin(chat.id, uid)
      });
      if (canKick) {
        if (items.length) items.push({ divider: true });
        items.push({
          icon: '🚪', label: 'Remove from Group',
          danger: true,
          action: () => kickMember(chat.id, uid)
        });
      }

      // Show menu
      import('./contextmenu.js').then(m => {
        m.showCtxMenu(e.clientX, e.clientY, items);
      });
    };
  });

  // ---- Wire avatar upload ----
  const avatarInput = $('#group-avatar-upload');
  if (avatarInput) avatarInput.onchange = (e) => handleGroupAvatarUpload(chat, e);
}

// ============================================================
// EDIT GROUP (name + bio)
// ============================================================
function showEditGroupDialog(chat) {
  showModal('Edit Group', `
    <label style="font-size:12px;color:var(--text-dim);display:block;margin-bottom:6px;">
      Group name
    </label>
    <input type="text" id="ge-name"
           value="${escapeHtml(chat.name || '')}"
           placeholder="Group name"
           maxlength="40">

    <label style="font-size:12px;color:var(--text-dim);display:block;margin:10px 0 6px;">
      Group bio (optional)
    </label>
    <textarea id="ge-bio"
              placeholder="What's this group about?"
              maxlength="200"
              rows="3"
              style="resize:vertical;">${escapeHtml(chat.bio || '')}</textarea>
  `, async () => {
    const name = $('#ge-name').value.trim();
    const bio = ($('#ge-bio').value || '').trim();
    if (!name) { toast('Name required', 'error'); return false; }

    try {
      await updateDoc(doc(db, 'chats', chat.id), {
        name,
        bio,
        updatedAt: serverTimestamp()
      });
      toast('Group updated ✅', 'success');
    } catch (err) {
      console.error('[editGroup]', err);
      toast('Could not update group', 'error');
      return false;
    }
  }, 'Save');
}

// ============================================================
// GROUP AVATAR UPLOAD
// ============================================================
async function handleGroupAvatarUpload(chat, e) {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  if (!file.type.startsWith('image/')) {
    return toast('Only images allowed', 'error');
  }
  if (file.size > IMAGE_MAX) {
    return toast('Image too large (max 1MB)', 'error');
  }

  try {
    toast('Compressing...');
    const dataUrl = await compressImage(file, 400, 0.75);
    if (dataUrl.length > 900 * 1024) {
      return toast('Image too large after compression', 'error');
    }
    await updateDoc(doc(db, 'chats', chat.id), {
      photoURL: dataUrl,
      updatedAt: serverTimestamp()
    });
    toast('Group photo updated ✅', 'success');
  } catch (err) {
    console.error('[groupAvatarUpload]', err);
    toast('Upload failed', 'error');
  }
}

// ============================================================
// ADD MEMBER PICKER
// ============================================================
function showAddMemberPicker(chat) {
  const selected = new Map(); // uid -> profile
  const exclude = new Set([
    ...(chat.members || []),
    ...(chat.invited || []),
    S.user.uid
  ]);

  const modal = $('#modal');
  $('#modal-title').textContent = 'Add Members';
  $('#modal-body').innerHTML = `
    <div class="picker-wrap">
      <div class="picker-header">
        <div class="picker-hint">Search users to invite them to <b>${escapeHtml(chat.name || 'Group')}</b>.</div>
      </div>

      <div class="picker-selected" id="picker-selected"></div>

      <input type="text" id="picker-search" class="search-input"
             placeholder="🔍 Search by name or @username..."
             autocomplete="off">

      <div class="picker-section-label" id="picker-search-label" style="display:none;">
        RESULTS
      </div>
      <div class="picker-list" id="picker-search-list" style="display:none;"></div>
    </div>
  `;

  $('#modal-ok').textContent = 'Send Invites';
  $('#modal-ok').classList.remove('hidden');
  $('#modal-cancel').textContent = 'Cancel';

  // Search input
  const searchEl = $('#picker-search');
  searchEl.oninput = debounce(async () => {
    const term = searchEl.value.trim();
    const label = $('#picker-search-label');
    const list = $('#picker-search-list');

    if (term.length < 2) {
      label.style.display = 'none';
      list.style.display = 'none';
      list.innerHTML = '';
      return;
    }

    label.style.display = '';
    list.style.display = '';
    list.innerHTML = '<div class="empty-state">Searching…</div>';

    const results = await searchUsersForPicker(term, new Set([...exclude, ...selected.keys()]));
    if (results.length === 0) {
      list.innerHTML = '<div class="empty-state">No users found</div>';
      return;
    }
    list.innerHTML = '';
    results.forEach(p => {
      S.userCache[p.uid] = p;
      list.appendChild(buildPickerRow(p, selected, exclude));
    });
  }, 300);

  // OK → send invites
  $('#modal-ok').onclick = async () => {
    if (selected.size === 0) {
      toast('Select at least one person', 'error');
      return false;
    }
    const uids = [...selected.keys()];
    modal.classList.add('hidden');
    await addMembers(chat.id, uids);
  };

  // Cancel
  $('#modal-cancel').onclick = () => {
    modal.classList.add('hidden');
  };

  modal.classList.remove('hidden');
  setTimeout(() => searchEl.focus(), 60);
}

// Row builder shared with picker list
function buildPickerRow(p, selected, exclude) {
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
  };

  return row;
}

function updatePickerChips(selected) {
  const wrap = $('#picker-selected');
  if (!wrap) return;
  if (selected.size === 0) { wrap.innerHTML = ''; return; }
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
      const row = document.querySelector(`.picker-row[data-uid="${uid}"]`);
      if (row) {
        row.classList.remove('selected');
        const c = row.querySelector('.picker-check');
        if (c) c.textContent = '';
      }
    };
    wrap.appendChild(chip);
  });
}

// ============================================================
// LEAVE GROUP
// ============================================================
function confirmLeave(chat) {
  const isLastAdmin = (chat.admins || []).includes(S.user.uid)
                    && (chat.admins || []).length === 1
                    && (chat.members || []).length > 1;

  let extra = '';
  if (isLastAdmin) {
    extra = '\n\nYou are the only admin. Another member will become admin automatically.';
  }

  confirmDialog(
    'Leave Group',
    `Leave "${chat.name || 'Group'}"? You will stop receiving messages from this group.${extra}`,
    async () => {
      await leaveGroup(chat.id);
    },
    'Leave'
  );
}

// ============================================================
// SMALL debounce helper (kept local so this file has no extra deps)
// ============================================================
function debounce(fn, delay) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}
