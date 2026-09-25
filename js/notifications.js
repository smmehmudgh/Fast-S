/* ============================================================
   Notifications bell: Firestore listener, panel rendering,
   and the bell / clear-all button handlers.

   Phase 3.6 updates:
   1. Notification `type` field is respected on click:
        • 'group-invite'  → opens the Group Preview view
        • 'friend-request' → opens Friends view
        • 'message' (default) → opens the chat directly
   2. Clicked notifications are auto-marked as read.
   3. Group-invite notifications show a distinct action hint
      ("Tap to view invite").
   4. Panel stays in sync with the latest state — if an invite
      has already been accepted, the notification is
      automatically filtered out of the list.
   ============================================================ */
import {
  collection, query, orderBy, limit, onSnapshot, doc, writeBatch,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $ } from './dom.js';
import { S } from './state.js';
import { escapeHtml, timeAgo } from './utils.js';
import { toast } from './ui.js';
import { openChat } from './chatView.js';
import { router } from './router.js';

// ============================================================
// LISTENER
// ============================================================
export function listenNotifications() {
  if (S.unsubNotifs) S.unsubNotifs();
  const q = query(
    collection(db, 'users', S.user.uid, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(30)
  );
  S.unsubNotifs = onSnapshot(q, (snap) => {
    S.notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // Compute unread count
    const unread = S.notifs.filter(n => !n.read).length;
    const badge = $('#notif-badge');
    badge.textContent = unread;
    badge.classList.toggle('hidden', unread === 0);

    // If panel is open, re-render live
    if (!$('#notif-panel').classList.contains('hidden')) renderNotifs();
  }, (e) => console.warn('notifications listener error:', e));
}

// ============================================================
// RENDER
// ============================================================
function renderNotifs() {
  const list = $('#notif-list');

  if (S.notifs.length === 0) {
    list.innerHTML = '<div class="empty-state">No notifications</div>';
    return;
  }

  list.innerHTML = '';
  S.notifs.forEach(n => {
    const el = document.createElement('div');
    el.className = 'notif-item' + (n.read ? '' : ' unread');

    // Different hint text based on type
    let hint = '';
    if (n.type === 'group-invite') {
      hint = '<div class="notif-hint">Tap to view invite →</div>';
    } else if (n.type === 'friend-request') {
      hint = '<div class="notif-hint">Tap to review →</div>';
    }

    el.innerHTML = `
      <div class="notif-icon">${n.icon || '🔔'}</div>
      <div class="notif-body">
        <div class="notif-title">${escapeHtml(n.title || '')}</div>
        <div class="notif-text">${escapeHtml(n.text || '')}</div>
        ${hint}
        <div class="notif-time">${timeAgo(n.createdAt)}</div>
      </div>
    `;

    el.onclick = () => handleNotifClick(n);

    list.appendChild(el);
  });
}

// ============================================================
// CLICK HANDLER
// ============================================================
async function handleNotifClick(n) {
  // Mark as read (fire & forget)
  if (!n.read) {
    updateDoc(doc(db, 'users', S.user.uid, 'notifications', n.id), { read: true })
      .catch(() => {});
  }

  // Close the panel
  $('#notif-panel').classList.add('hidden');

  // ---- Route based on type ----
  if (n.type === 'group-invite' && n.chatId) {
    // Verify the invite is still pending before opening preview
    try {
      const stillInvited = await isStillInvited(n.chatId);
      if (!stillInvited) {
        // Invite already accepted / declined / group gone
        await deleteNotif(n.id).catch(() => {});
        toast('Invitation no longer available', 'error');
        return;
      }
      router.go('group-preview', { chatId: n.chatId, from: 'chats' });
    } catch (e) {
      console.warn('[notif group-invite] verify failed:', e);
      // Still attempt to open — groupInfo.js will handle "not found"
      router.go('group-preview', { chatId: n.chatId, from: 'chats' });
    }
    return;
  }

  if (n.type === 'friend-request') {
    router.go('friends');
    return;
  }

  // ---- Default: message / chat notification ----
  if (n.chatId) {
    openChat(n.chatId, {});
    return;
  }

  // No actionable target
  // (rare — e.g. a system message)
}

// Verify via Firestore that the current user is still in the
// invited list for this group chat.
async function isStillInvited(chatId) {
  const { getDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
  );
  const snap = await getDoc(doc(db, 'chats', chatId));
  if (!snap.exists()) return false;
  const data = snap.data();
  if (data.type !== 'group') return false;
  if (!Array.isArray(data.invited)) return false;
  if (data.members && data.members.includes(S.user.uid)) return false;
  return data.invited.includes(S.user.uid);
}

// ============================================================
// HELPERS
// ============================================================
async function deleteNotif(id) {
  const { deleteDoc } = await import(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
  );
  await deleteDoc(doc(db, 'users', S.user.uid, 'notifications', id));
}

// ============================================================
// BELL BUTTON
// ============================================================
$('#notif-btn').onclick = () => {
  const p = $('#notif-panel');
  p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) renderNotifs();
};

// ============================================================
// CLEAR ALL
// ============================================================
$('#notif-clear').onclick = async () => {
  if (S.notifs.length === 0) return;
  const batch = writeBatch(db);
  S.notifs.forEach(n => {
    batch.delete(doc(db, 'users', S.user.uid, 'notifications', n.id));
  });
  try {
    await batch.commit();
    toast('All notifications cleared', 'success');
  } catch (e) {
    console.error('[notif clear]', e);
    toast('Could not clear notifications', 'error');
  }
};
