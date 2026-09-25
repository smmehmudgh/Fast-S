/* ============================================================
   VIEW: FRIENDS — friend-request listener + rendering, and all
   friend-relationship actions.

   Fix:
   • sendFriendRequest now uses setDoc() with a deterministic ID
     ({sender_uid}_{receiver_uid}) so Firestore Rules can verify
     via exists() when accepting (updating the other user's
     friends array).
   ============================================================ */
import {
  collection, addDoc, doc, query, where, onSnapshot, getDocs,
  updateDoc, writeBatch, arrayUnion, arrayRemove, serverTimestamp,
  deleteDoc, setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $ } from './dom.js';
import { S } from './state.js';
import { escapeHtml, timeAgo, debounce, avatarUrl } from './utils.js';
import { toast, confirmDialog } from './ui.js';
import { isOnline } from './presence.js';
import { getUser, loadUserProfile } from './profile.js';
import { showCtxMenu } from './contextmenu.js';
import { startDirectChat } from './chats.js';
import { router } from './router.js';

// ============================================================
// FIRESTORE LISTENERS
// ============================================================
export function listenFriendRequests() {
  if (S.unsubRequests) S.unsubRequests();
  const q = query(
    collection(db, 'friendRequests'),
    where('to', '==', S.user.uid),
    where('status', '==', 'pending')
  );
  S.unsubRequests = onSnapshot(q, (snap) => {
    S.requests = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (S.currentView === 'friends') renderFriends();
  });
}

export function listenSentRequests() {
  if (S.unsubSentRequests) S.unsubSentRequests();
  const q = query(
    collection(db, 'friendRequests'),
    where('from', '==', S.user.uid),
    where('status', '==', 'pending')
  );
  S.unsubSentRequests = onSnapshot(q, (snap) => {
    S.sentRequests = snap.docs.map(d => ({ id: d.id, to: d.data().to }));
    if (S.currentView === 'search') {
      import('./search.js').then(m => m.renderSearch && m.renderSearch());
    }
  });
}

// ============================================================
// HELPERS
// ============================================================
export function hasSentRequest(uid) {
  return S.sentRequests.some(r => r.to === uid);
}

// ============================================================
// RENDER FRIENDS VIEW
// ============================================================
export async function renderFriends() {
  const reqList = $('#friend-requests-list');
  const friendList = $('#friends-list');
  const q = ($('#friends-search').value || '').trim().toLowerCase();

  // ---- Incoming requests ----
  if (S.requests.length === 0) {
    reqList.innerHTML = '<div class="empty-state" style="padding:16px">No pending requests</div>';
  } else {
    reqList.innerHTML = '';
    for (const r of S.requests) {
      const p = await getUser(r.from);
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `
        <div class="list-avatar"><img src="${avatarUrl(p)}"></div>
        <div class="list-body">
          <div class="list-name">${escapeHtml(p?.displayName || 'User')}</div>
          <div class="list-sub">@${escapeHtml(p?.username || '')}</div>
        </div>
        <div class="list-actions">
          <button class="mini-btn accept">Accept</button>
          <button class="mini-btn reject">Reject</button>
        </div>
      `;
      el.querySelector('.accept').onclick = (e) => { e.stopPropagation(); acceptRequest(r); };
      el.querySelector('.reject').onclick = (e) => { e.stopPropagation(); rejectRequest(r); };
      reqList.appendChild(el);
    }
  }

  // ---- Friends list ----
  const friends = S.profile?.friends || [];
  if (friends.length === 0) {
    friendList.innerHTML = '<div class="empty-state">No friends yet — use Search to find people</div>';
    return;
  }
  const profiles = (await Promise.all(friends.map(uid => getUser(uid)))).filter(Boolean);
  friendList.innerHTML = '';
  profiles.forEach(p => {
    if (q && !(p.displayName || '').toLowerCase().includes(q) &&
        !(p.username || '').toLowerCase().includes(q)) return;
    const el = document.createElement('div');
    el.className = 'list-item';
    el.innerHTML = `
      <div class="list-avatar">
        <img src="${avatarUrl(p)}">
        ${isOnline(p) ? '<div class="online-dot"></div>' : ''}
      </div>
      <div class="list-body">
        <div class="list-name">${escapeHtml(p.displayName)}</div>
        <div class="list-sub">${isOnline(p) ? 'Online' : 'Last seen ' + timeAgo(p.lastSeen)}</div>
      </div>
      <div class="list-actions">
        <button class="mini-btn message">Message</button>
      </div>
    `;
    el.onclick = () => router.go('user', { uid: p.uid, from: 'friends' });
    el.oncontextmenu = (e) => {
      e.preventDefault();
      showCtxMenu(e.clientX, e.clientY, [
        { icon: '👤', label: 'View Profile', action: () => router.go('user', { uid: p.uid, from: 'friends' }) },
        { icon: '💬', label: 'Message', action: () => startDirectChat(p.uid) },
        { icon: '🚫', label: 'Block User', danger: true, action: () => blockUser(p.uid) },
        { divider: true },
        { icon: '❌', label: 'Unfriend', danger: true, action: () => unfriend(p.uid) }
      ]);
    };
    friendList.appendChild(el);
  });
}

$('#friends-search').oninput = debounce(() => renderFriends(), 200);

// ============================================================
// SEND FRIEND REQUEST  (setDoc + deterministic ID)
// ============================================================
export async function sendFriendRequest(uid) {
  if (uid === S.user.uid) return toast('Cannot add yourself', 'error');
  if ((S.profile.friends || []).includes(uid)) return toast('Already friends');

  // Deterministic ID — required by Firestore Rules
  const reqId = S.user.uid + '_' + uid;
  const reqRef = doc(db, 'friendRequests', reqId);

  // Already pending?
  try {
    const existing = await getDoc(reqRef);
    if (existing.exists() && existing.data().status === 'pending') {
      return toast('Request already sent');
    }
  } catch (e) {
    // Ignore read errors, proceed to write
    console.warn('[sendFriendRequest] precheck failed:', e);
  }

  try {
    await setDoc(reqRef, {
      from: S.user.uid,
      to: uid,
      fromName: S.profile.displayName,
      fromPhoto: S.profile.photoURL || '',
      status: 'pending',
      createdAt: serverTimestamp()
    });
    toast('Friend request sent ✅', 'success');
  } catch (e) {
    console.error('[sendFriendRequest]', e);
    toast('Could not send request', 'error');
  }
}

// ============================================================
// UNSEND REQUEST
// ============================================================
export async function unsendRequest(uid) {
  const reqId = S.user.uid + '_' + uid;
  try {
    await deleteDoc(doc(db, 'friendRequests', reqId));
    S.sentRequests = S.sentRequests.filter(r => r.to !== uid);
    toast('Request unsent', 'success');
    if (S.currentView === 'search') {
      const m = await import('./search.js');
      m.renderSearch && m.renderSearch();
    }
  } catch (e) {
    console.error('[unsendRequest]', e);
    toast('Could not unsend request', 'error');
  }
}

// ============================================================
// ACCEPT / REJECT
// ============================================================
async function acceptRequest(req) {
  // Optimistic removal
  S.requests = S.requests.filter(r => r.id !== req.id);
  renderFriends();

  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', S.user.uid), { friends: arrayUnion(req.from) });
    batch.update(doc(db, 'users', req.from), { friends: arrayUnion(S.user.uid) });
    batch.update(doc(db, 'friendRequests', req.id), { status: 'accepted' });
    await batch.commit();

    // Notify the sender
    await addDoc(collection(db, 'users', req.from, 'notifications'), {
      icon: '👥',
      title: 'Friend Request Accepted',
      text: S.profile.displayName + ' accepted your request',
      read: false,
      createdAt: serverTimestamp()
    });

    await loadUserProfile();
    toast('Friend added ✅', 'success');
    renderFriends();
  } catch (e) {
    console.error('[acceptRequest]', e);
    toast('Could not accept request', 'error');
    if (S.currentView === 'friends') renderFriends();
  }
}

async function rejectRequest(req) {
  // Optimistic removal
  S.requests = S.requests.filter(r => r.id !== req.id);
  renderFriends();

  try {
    await updateDoc(doc(db, 'friendRequests', req.id), { status: 'rejected' });
    toast('Request rejected');
  } catch (e) {
    console.error('[rejectRequest]', e);
    toast('Could not reject request', 'error');
  }
}

// ============================================================
// UNFRIEND / BLOCK / UNBLOCK
// ============================================================
async function unfriend(uid) {
  const p = await getUser(uid);
  confirmDialog('Unfriend', `Remove ${p?.displayName || 'this user'} from friends?`, async () => {
    try {
      // We need permission to update the other user's `friends`.
      // Rules allow it only when a friendRequest exists between us.
      // Since the request still exists (status: 'accepted'), the
      // exists() check passes → update is allowed.
      const batch = writeBatch(db);
      batch.update(doc(db, 'users', S.user.uid), { friends: arrayRemove(uid) });
      batch.update(doc(db, 'users', uid), { friends: arrayRemove(S.user.uid) });
      await batch.commit();
      await loadUserProfile();
      toast('Unfriended');
      renderFriends();
    } catch (e) {
      console.error('[unfriend]', e);
      toast('Could not unfriend', 'error');
    }
  }, 'Unfriend');
}

async function blockUser(uid) {
  const p = await getUser(uid);
  confirmDialog('Block User',
    `Block ${p?.displayName || 'user'}? They won't be able to message you.`,
    async () => {
      try {
        await updateDoc(doc(db, 'users', S.user.uid), { blocked: arrayUnion(uid) });
        await loadUserProfile();
        toast('User blocked', 'error');
      } catch (e) {
        console.error('[blockUser]', e);
        toast('Could not block user', 'error');
      }
    }, 'Block');
}

export async function unblockUser(uid) {
  try {
    await updateDoc(doc(db, 'users', S.user.uid), { blocked: arrayRemove(uid) });
    await loadUserProfile();
    toast('User unblocked ✅', 'success');
  } catch (e) {
    console.error('[unblockUser]', e);
    toast('Could not unblock user', 'error');
  }
}
