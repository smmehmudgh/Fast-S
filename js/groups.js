/* ============================================================
   Group system — everything that isn't the Info page.

   Responsibilities:
   • listenGroupInvites()       — live list of pending invites
   • renderGroupPreview(chatId) — the invite preview screen
   • joinGroup(chatId)          — invited → members (self)
   • declineInvite(chatId)      — remove self from invited
   • addMembers(chatId, uids)   — admin invites more users
   • kickMember(chatId, uid)    — admin removes a member
   • promoteAdmin(chatId, uid)  — admin makes someone admin
   • demoteAdmin(chatId, uid)   — admin revokes admin
   • leaveGroup(chatId)         — member leaves voluntarily

   Used by:
   • js/listeners.js (start/stop)
   • js/router.js    (renderGroupPreview)
   • js/notifications.js (invite click)
   • js/groupInfo.js (admin actions)
   ============================================================ */
import {
  collection, doc, getDoc, getDocs, updateDoc, addDoc,
  onSnapshot, query, where, limit, orderBy, startAt, endAt,
  arrayUnion, arrayRemove, serverTimestamp, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { escapeHtml, debounce, avatarUrl } from './utils.js';
import { toast, showModal, confirmDialog } from './ui.js';
import { getUser } from './profile.js';
import { openChat } from './chatView.js';
import { router } from './router.js';

// ============================================================
// LISTENER — pending group invites for the current user
// ============================================================
export function listenGroupInvites() {
  if (S.unsubGroupInvites) S.unsubGroupInvites();
  const q = query(
    collection(db, 'chats'),
    where('invited', 'array-contains', S.user.uid)
  );
  S.unsubGroupInvites = onSnapshot(q, (snap) => {
    S.groupInvites = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // If the preview view is open, refresh it
    if (S.currentView === 'group-preview' && S.viewingInvite) {
      const still = S.groupInvites.find(g => g.id === S.viewingInvite);
      if (!still) {
        // Our invite was already accepted/declined elsewhere
        toast('Invitation no longer available', 'error');
        router.go('chats');
      } else {
        S.viewingInviteData = still;
        renderGroupPreview(S.viewingInvite);
      }
    }
  }, (e) => console.warn('group-invites listener error:', e));
}

export function stopGroupInvites() {
  if (S.unsubGroupInvites) {
    S.unsubGroupInvites();
    S.unsubGroupInvites = null;
  }
}

// ============================================================
// HELPERS
// ============================================================
function groupAvatarUrl(chat) {
  if (chat?.photoURL) return chat.photoURL;
  const name = chat?.name || 'Group';
  return `https://ui-avatars.com/api/?background=7b2ff7&color=fff&bold=true&size=128&name=${encodeURIComponent(name)}`;
}

async function fetchChat(chatId) {
  const snap = await getDoc(doc(db, 'chats', chatId));
  return snap.exists() ? { id: chatId, ...snap.data() } : null;
}

// ============================================================
// RENDER — Group Preview (invite)
// ============================================================
export async function renderGroupPreview(chatId) {
  const container = $('#group-preview-content');
  if (!container) return;

  container.innerHTML = `
    <div class="group-preview-loading">
      <div class="spinner" style="width:20px;height:20px;border-width:2px;"></div>
      Loading invitation...
    </div>
  `;

  let chat;
  try {
    chat = await fetchChat(chatId);
  } catch (e) {
    console.warn('[renderGroupPreview] fetch failed:', e);
  }

  if (!chat || chat.type !== 'group') {
    container.innerHTML = `
      <div class="group-empty">
        <div style="font-size:48px;margin-bottom:12px;">👻</div>
        <p>This group no longer exists.</p>
      </div>`;
    return;
  }

  // Make sure we're still invited
  const invited = Array.isArray(chat.invited) ? chat.invited : [];
  const members = Array.isArray(chat.members) ? chat.members : [];
  if (!invited.includes(S.user.uid) || members.includes(S.user.uid)) {
    container.innerHTML = `
      <div class="group-empty">
        <div style="font-size:48px;margin-bottom:12px;">✅</div>
        <p>You are not pending an invite to this group.</p>
      </div>`;
    return;
  }

  // Cache for later use
  S.viewingInvite = chatId;
  S.viewingInviteData = chat;

  // ---- Admin name ----
  const adminUid = (chat.admins || [])[0];
  let adminName = 'someone';
  if (adminUid) {
    const adminProfile = S.userCache[adminUid] || await getUser(adminUid);
    adminName = adminProfile?.displayName || adminProfile?.username || 'someone';
  }

  // ---- Member avatars (up to 5 + "more") ----
  const memberProfiles = [];
  for (const uid of members.slice(0, 5)) {
    const p = S.userCache[uid] || await getUser(uid);
    if (p) memberProfiles.push(p);
  }
  const moreCount = Math.max(0, members.length - 5);

  const memberAvatarsHtml = memberProfiles.map(p =>
    `<div class="group-preview-member-avatar" title="${escapeHtml(p.displayName || '')}">
       <img src="${avatarUrl(p)}" alt="">
     </div>`
  ).join('') + (moreCount > 0
    ? `<div class="group-preview-member-avatar more">+${moreCount}</div>`
    : '');

  // ---- Bio ----
  const bio = (chat.bio || '').trim();

  container.innerHTML = `
    <div class="group-preview-hero">
      <div class="group-preview-avatar">
        <img src="${groupAvatarUrl(chat)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">
      </div>
      <div class="group-preview-name">${escapeHtml(chat.name || 'Group')}</div>
      <div class="group-preview-inviter">
        Invited by <b>${escapeHtml(adminName)}</b>
      </div>
      ${bio ? `<div class="group-preview-bio">${escapeHtml(bio)}</div>` : ''}
    </div>

    <div class="group-preview-stats">
      <div class="stat-item">
        <div class="stat-value">${members.length}</div>
        <div class="stat-label">Members</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${(chat.admins || []).length}</div>
        <div class="stat-label">Admins</div>
      </div>
    </div>

    ${memberAvatarsHtml ? `
      <div class="group-preview-members">${memberAvatarsHtml}</div>
    ` : ''}

    <div class="group-preview-actions">
      <button class="btn-join-group" id="gp-join">✅ Join Group</button>
      <button class="btn-decline-group" id="gp-decline">❌ Decline</button>
    </div>
  `;

  // ---- Wire buttons ----
  $('#gp-join').onclick = () => joinGroup(chatId);
  $('#gp-decline').onclick = () => confirmDecline(chatId, chat.name || 'Group');
}

// ============================================================
// JOIN
// ============================================================
export async function joinGroup(chatId) {
  try {
    // Fresh check
    const chat = await fetchChat(chatId);
    if (!chat) { toast('Group no longer exists', 'error'); router.go('chats'); return; }
    if (chat.members.includes(S.user.uid)) {
      toast('You are already a member');
      openChat(chatId, chat);
      return;
    }
    if (!Array.isArray(chat.invited) || !chat.invited.includes(S.user.uid)) {
      toast('Invitation expired', 'error');
      router.go('chats');
      return;
    }

    // Move self from invited → members
    await updateDoc(doc(db, 'chats', chatId), {
      members: arrayUnion(S.user.uid),
      invited: arrayRemove(S.user.uid),
      updatedAt: serverTimestamp()
    });

    // Drop a system notification to admin(s)
    for (const adminUid of (chat.admins || [])) {
      if (adminUid === S.user.uid) continue;
      try {
        await addDoc(collection(db, 'users', adminUid, 'notifications'), {
          icon: '✅',
          title: chat.name || 'Group',
          text: `${S.profile.displayName} joined the group`,
          type: 'message',
          chatId,
          read: false,
          createdAt: serverTimestamp()
        });
      } catch (e) { /* ignore */ }
    }

    toast('Joined group ✅', 'success');

    // Open the group chat
    const updated = await fetchChat(chatId);
    openChat(chatId, updated || chat);
  } catch (err) {
    console.error('[joinGroup]', err);
    toast('Could not join group', 'error');
  }
}

// ============================================================
// DECLINE
// ============================================================
function confirmDecline(chatId, groupName) {
  confirmDialog(
    'Decline Invite',
    `Decline the invitation to "${groupName}"?`,
    async () => { await declineInvite(chatId); },
    'Decline'
  );
}

export async function declineInvite(chatId) {
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      invited: arrayRemove(S.user.uid),
      updatedAt: serverTimestamp()
    });

    // Clean up the invite notification (best-effort)
    await deleteInviteNotifications(chatId);

    toast('Invitation declined');
    router.go('chats');
  } catch (err) {
    console.error('[declineInvite]', err);
    toast('Could not decline invite', 'error');
  }
}

// Remove any group-invite notifications for this chat
async function deleteInviteNotifications(chatId) {
  try {
    const q = query(
      collection(db, 'users', S.user.uid, 'notifications'),
      where('chatId', '==', chatId)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      if (data.type === 'group-invite') {
        await deleteDoc(doc(db, 'users', S.user.uid, 'notifications', d.id));
      }
    }
  } catch (e) {
    console.warn('[deleteInviteNotifications]', e);
  }
}

// ============================================================
// ADD MEMBERS (admin invites more users)
// ============================================================
export async function addMembers(chatId, uids) {
  if (!uids || uids.length === 0) return;

  // Guard: only admin should call this
  const chat = await fetchChat(chatId);
  if (!chat) { toast('Group not found', 'error'); return; }
  if (!(chat.admins || []).includes(S.user.uid)) {
    toast('Only admins can add members', 'error');
    return;
  }

  // Filter out anyone already a member or already invited
  const currentMembers = new Set(chat.members || []);
  const currentInvited = new Set(chat.invited || []);
  const toInvite = uids.filter(uid => !currentMembers.has(uid) && !currentInvited.has(uid));

  if (toInvite.length === 0) {
    toast('Everyone is already invited');
    return;
  }

  try {
    await updateDoc(doc(db, 'chats', chatId), {
      invited: arrayUnion(...toInvite),
      updatedAt: serverTimestamp()
    });

    // Notify each new invitee
    for (const uid of toInvite) {
      try {
        await addDoc(collection(db, 'users', uid, 'notifications'), {
          icon: '👥',
          title: 'Group Invitation',
          text: `${S.profile.displayName} invited you to join "${chat.name || 'Group'}"`,
          type: 'group-invite',
          chatId,
          from: S.user.uid,
          groupName: chat.name || 'Group',
          read: false,
          createdAt: serverTimestamp()
        });
      } catch (e) { /* ignore per-user failure */ }
    }

    toast(`Invited ${toInvite.length} ${toInvite.length === 1 ? 'person' : 'people'} ✅`, 'success');
  } catch (err) {
    console.error('[addMembers]', err);
    toast('Could not send invites', 'error');
  }
}

// ============================================================
// KICK MEMBER (admin only)
// ============================================================
export async function kickMember(chatId, uid) {
  const chat = await fetchChat(chatId);
  if (!chat) { toast('Group not found', 'error'); return; }
  if (!(chat.admins || []).includes(S.user.uid)) {
    toast('Only admins can remove members', 'error');
    return;
  }
  if (uid === S.user.uid) {
    toast('Use Leave Group to exit yourself', 'error');
    return;
  }

  const p = await getUser(uid);
  const name = p?.displayName || 'this member';

  confirmDialog(
    'Remove Member',
    `Remove ${name} from "${chat.name || 'Group'}"?`,
    async () => {
      try {
        const newMembers = (chat.members || []).filter(u => u !== uid);
        const newAdmins = (chat.admins || []).filter(u => u !== uid);
        await updateDoc(doc(db, 'chats', chatId), {
          members: newMembers,
          admins: newAdmins,
          updatedAt: serverTimestamp()
        });

        // Notify the kicked user (best effort)
        try {
          await addDoc(collection(db, 'users', uid, 'notifications'), {
            icon: '🚪',
            title: chat.name || 'Group',
            text: `You were removed from the group`,
            type: 'message',
            read: false,
            createdAt: serverTimestamp()
          });
        } catch (e) { /* ignore */ }

        toast(`${name} removed`, 'success');
      } catch (err) {
        console.error('[kickMember]', err);
        toast('Could not remove member', 'error');
      }
    },
    'Remove'
  );
}

// ============================================================
// PROMOTE / DEMOTE ADMIN
// ============================================================
export async function promoteAdmin(chatId, uid) {
  const chat = await fetchChat(chatId);
  if (!chat) return;
  if (!(chat.admins || []).includes(S.user.uid)) {
    toast('Only admins can promote', 'error');
    return;
  }
  if ((chat.admins || []).includes(uid)) {
    toast('Already an admin');
    return;
  }
  try {
    await updateDoc(doc(db, 'chats', chatId), {
      admins: arrayUnion(uid),
      updatedAt: serverTimestamp()
    });
    const p = await getUser(uid);
    toast(`${p?.displayName || 'Member'} is now an admin 👑`, 'success');
  } catch (err) {
    console.error('[promoteAdmin]', err);
    toast('Could not promote member', 'error');
  }
}

export async function demoteAdmin(chatId, uid) {
  const chat = await fetchChat(chatId);
  if (!chat) return;
  if (!(chat.admins || []).includes(S.user.uid)) {
    toast('Only admins can demote', 'error');
    return;
  }
  const admins = chat.admins || [];
  if (admins.length <= 1) {
    toast('At least one admin must remain', 'error');
    return;
  }
  if (!admins.includes(uid)) return;

  try {
    await updateDoc(doc(db, 'chats', chatId), {
      admins: arrayRemove(uid),
      updatedAt: serverTimestamp()
    });
    const p = await getUser(uid);
    toast(`${p?.displayName || 'Member'} is no longer admin`, 'success');
  } catch (err) {
    console.error('[demoteAdmin]', err);
    toast('Could not demote admin', 'error');
  }
}

// ============================================================
// LEAVE GROUP (self, member-side)
// ============================================================
export async function leaveGroup(chatId) {
  const chat = await fetchChat(chatId);
  if (!chat) { toast('Group not found', 'error'); return; }

  try {
    const myUid = S.user.uid;
    let members = (chat.members || []).filter(u => u !== myUid);
    let admins  = (chat.admins  || []).filter(u => u !== myUid);

    // If we were the last admin, promote someone else
    if (admins.length === 0 && members.length > 0) {
      admins = [members[0]];
    }

    // If no members left, delete the chat entirely
    if (members.length === 0) {
      await deleteDoc(doc(db, 'chats', chatId));
      toast('Group removed', 'success');
      return;
    }

    await updateDoc(doc(db, 'chats', chatId), {
      members, admins,
      updatedAt: serverTimestamp()
    });

    // Notify remaining admins
    for (const adminUid of admins) {
      try {
        await addDoc(collection(db, 'users', adminUid, 'notifications'), {
          icon: '🚪',
          title: chat.name || 'Group',
          text: `${S.profile.displayName} left the group`,
          type: 'message',
          chatId,
          read: false,
          createdAt: serverTimestamp()
        });
      } catch (e) { /* ignore */ }
    }

    toast('You left the group', 'success');
    router.go('chats');
  } catch (err) {
    console.error('[leaveGroup]', err);
    toast('Could not leave group', 'error');
  }
}

// ============================================================
// SEARCH USERS (reused by groupInfo.js "Add Member" picker)
// ============================================================
export async function searchUsersForPicker(term, excludeSet) {
  const clean = term.toLowerCase().replace(/^@+/, '');
  if (clean.length < 2) return [];

  const usersRef = collection(db, 'users');
  const found = new Map();

  // Username prefix
  try {
    const q1 = query(usersRef, orderBy('username'),
      startAt(clean), endAt(clean + '\uf8ff'), limit(20));
    const s1 = await getDocs(q1);
    s1.forEach(d => {
      if (d.id !== S.user.uid && !excludeSet.has(d.id)) {
        found.set(d.id, { uid: d.id, ...d.data() });
      }
    });
  } catch (e) { /* ignore */ }

  // Display name prefix
  try {
    const cap = clean.charAt(0).toUpperCase() + clean.slice(1);
    const q2 = query(usersRef, orderBy('displayName'),
      startAt(cap), endAt(cap + '\uf8ff'), limit(20));
    const s2 = await getDocs(q2);
    s2.forEach(d => {
      if (d.id !== S.user.uid && !excludeSet.has(d.id)) {
        found.set(d.id, { uid: d.id, ...d.data() });
      }
    });
  } catch (e) { /* ignore */ }

  // Fallback
  if (found.size === 0) {
    try {
      const snapAll = await getDocs(query(usersRef, limit(150)));
      snapAll.forEach(d => {
        if (d.id === S.user.uid || excludeSet.has(d.id)) return;
        const u = d.data();
        const un = (u.username || '').toLowerCase();
        const dn = (u.displayName || '').toLowerCase();
        if (un.includes(clean) || dn.includes(clean)) {
          found.set(d.id, { uid: d.id, ...u });
        }
      });
    } catch (e) { /* ignore */ }
  }

  return [...found.values()];
}
