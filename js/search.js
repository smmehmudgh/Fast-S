/* ============================================================
   VIEW: SEARCH — find users by name / @username.

   NOTE: the original single-file app called startAt()/endAt()
   here but never imported them from the Firestore SDK, so this
   view silently threw and "Find People" never returned results.
   Fixed below by importing them properly.
   ============================================================ */
import {
  collection, query, orderBy, startAt, endAt, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $ } from './dom.js';
import { S } from './state.js';
import { escapeHtml, debounce, avatarUrl } from './utils.js';
import { sendFriendRequest } from './friends.js';
import { startDirectChat } from './chats.js';

export async function renderSearch() {
  const q = ($('#user-search').value || '').trim().toLowerCase();
  const res = $('#search-results');

  if (!q) {
    res.innerHTML = '<div class="empty-state">Search for users by name or @username</div>';
    return;
  }
  if (q.length < 2) {
    res.innerHTML = '<div class="empty-state">Type at least 2 characters</div>';
    return;
  }

  res.innerHTML = '<div class="empty-state">Searching...</div>';

  try {
    const usersRef = collection(db, 'users');
    const q1 = query(usersRef, orderBy('username'), startAt(q), endAt(q + '\uf8ff'), limit(15));
    const q2 = query(usersRef, orderBy('displayName'), startAt(q), endAt(q + '\uf8ff'), limit(15));
    const [s1, s2] = await Promise.all([getDocs(q1), getDocs(q2)]);

    const map = new Map();
    [...s1.docs, ...s2.docs].forEach(d => {
      if (d.id !== S.user.uid) map.set(d.id, { id: d.id, ...d.data() });
    });
    const results = [...map.values()];

    if (results.length === 0) {
      res.innerHTML = '<div class="empty-state">No users found</div>';
      return;
    }
    res.innerHTML = '';
    results.forEach(p => {
      S.userCache[p.id] = p;
      const isFriend = (S.profile.friends || []).includes(p.id);
      const el = document.createElement('div');
      el.className = 'list-item';
      el.innerHTML = `
        <div class="list-avatar"><img src="${avatarUrl(p)}"></div>
        <div class="list-body">
          <div class="list-name">${escapeHtml(p.displayName)}</div>
          <div class="list-sub">@${escapeHtml(p.username)}</div>
        </div>
        <div class="list-actions">
          ${isFriend
            ? `<button class="mini-btn">Message</button>`
            : `<button class="mini-btn accept">Add</button>`}
        </div>
      `;
      const btn = el.querySelector('button');
      if (isFriend) {
        btn.onclick = (e) => { e.stopPropagation(); startDirectChat(p.id); };
      } else {
        btn.onclick = (e) => { e.stopPropagation(); sendFriendRequest(p.id); };
      }
      res.appendChild(el);
    });
  } catch (err) {
    console.error(err);
    res.innerHTML = '<div class="empty-state">Search error — try again</div>';
  }
}
$('#user-search').oninput = debounce(() => renderSearch(), 350);
