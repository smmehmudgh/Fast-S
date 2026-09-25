/* ============================================================
   Notifications bell: Firestore listener, panel rendering,
   and the bell / clear-all button handlers.
   ============================================================ */
import {
  collection, query, orderBy, limit, onSnapshot, doc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $ } from './dom.js';
import { S } from './state.js';
import { escapeHtml, timeAgo } from './utils.js';
import { toast } from './ui.js';
import { openChat } from './chatView.js';

export function listenNotifications() {
  if (S.unsubNotifs) S.unsubNotifs();
  const q = query(
    collection(db, 'users', S.user.uid, 'notifications'),
    orderBy('createdAt', 'desc'),
    limit(30)
  );
  S.unsubNotifs = onSnapshot(q, (snap) => {
    S.notifs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const unread = S.notifs.filter(n => !n.read).length;
    const badge = $('#notif-badge');
    badge.textContent = unread;
    badge.classList.toggle('hidden', unread === 0);
    if (!$('#notif-panel').classList.contains('hidden')) renderNotifs();
  });
}

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
    el.innerHTML = `
      <div class="notif-icon">${n.icon || '🔔'}</div>
      <div class="notif-body">
        <div class="notif-title">${escapeHtml(n.title || '')}</div>
        <div class="notif-text">${escapeHtml(n.text || '')}</div>
        <div class="notif-time">${timeAgo(n.createdAt)}</div>
      </div>
    `;
    if (n.chatId) el.onclick = () => {
      openChat(n.chatId, {});
      $('#notif-panel').classList.add('hidden');
    };
    list.appendChild(el);
  });
}

$('#notif-btn').onclick = () => {
  const p = $('#notif-panel');
  p.classList.toggle('hidden');
  if (!p.classList.contains('hidden')) renderNotifs();
};

$('#notif-clear').onclick = async () => {
  const batch = writeBatch(db);
  S.notifs.forEach(n => batch.delete(doc(db, 'users', S.user.uid, 'notifications', n.id)));
  await batch.commit();
  toast('Cleared');
};
