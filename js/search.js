/* ============================================================
   VIEW: SEARCH — find users by name / @username.

   Updates:
   1. Strip leading "@" so "@username" works.
   2. Three button states: Add / Sent / Message
      - Sent → click opens "Unsend request?" confirmation
   3. Separate try/catch for each query — one failure doesn't
      kill the whole search.
   4. Fallback: fetch users & filter client-side if prefix
      queries return nothing (handles index still building).
   5. Shows real error message instead of a vague one.
   ============================================================ */
import {
  collection, query, orderBy, startAt, endAt, limit, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $ } from './dom.js';
import { S } from './state.js';
import { escapeHtml, debounce, avatarUrl } from './utils.js';
import { sendFriendRequest, unsendRequest, hasSentRequest } from './friends.js';
import { startDirectChat } from './chats.js';
import { showModal } from './ui.js';
import { router } from './router.js';

export async function renderSearch() {
  const rawInput = ($('#user-search').value || '').trim();
  const q = rawInput.toLowerCase().replace(/^@+/, '');   // strip @
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

  const usersRef = collection(db, 'users');
  const found = new Map();
  const errors = [];

  // ---- Query 1: username prefix ----
  try {
    const q1 = query(
      usersRef,
      orderBy('username'),
      startAt(q),
      endAt(q + '\uf8ff'),
      limit(15)
    );
    const s1 = await getDocs(q1);
    s1.forEach(d => {
      if (d.id !== S.user.uid) found.set(d.id, { id: d.id, ...d.data() });
    });
  } catch (e) {
    console.warn('[search] username query failed:', e);
    errors.push('username: ' + (e.message || e.code || 'unknown'));
  }

  // ---- Query 2: displayName prefix ----
  try {
    const qCap = q.charAt(0).toUpperCase() + q.slice(1);
    const q2 = query(
      usersRef,
      orderBy('displayName'),
      startAt(qCap),
      endAt(qCap + '\uf8ff'),
      limit(15)
    );
    const s2 = await getDocs(q2);
    s2.forEach(d => {
      if (d.id !== S.user.uid) found.set(d.id, { id: d.id, ...d.data() });
    });
  } catch (e) {
    console.warn('[search] displayName query failed:', e);
    errors.push('displayName: ' + (e.message || e.code || 'unknown'));
  }

  // ---- Fallback: fetch limited users, filter client-side ----
  if (found.size === 0) {
    try {
      const snapAll = await getDocs(query(usersRef, limit(200)));
      snapAll.forEach(d => {
        if (d.id === S.user.uid) return;
        const u = d.data();
        const uname = (u.username || '').toLowerCase();
        const dname = (u.displayName || '').toLowerCase();
        if (uname.startsWith(q) || dname.startsWith(q) ||
            uname.includes(q) || dname.includes(q)) {
          found.set(d.id, { id: d.id, ...u });
        }
      });
    } catch (e) {
      console.error('[search] fallback failed:', e);
      errors.push('fallback: ' + (e.message || e.code || 'unknown'));
    }
  }

  // ---- Render ----
  const results = [...found.values()];

  if (results.length === 0) {
    res.innerHTML = `
      <div class="empty-state">
        <p>No users found for "${escapeHtml(rawInput)}"</p>
        ${errors.length ? `<p style="font-size:11px;margin-top:10px;color:#ff8098;word-break:break-all">
          Debug: ${escapeHtml(errors.join(' | '))}
        </p>` : ''}
        <p style="font-size:12px;margin-top:8px;color:var(--text-dim)">
          Try a different spelling or a shorter name
        </p>
      </div>`;
    return;
  }

  res.innerHTML = '';
  results.forEach(p => {
    S.userCache[p.id] = p;
    const isFriend = (S.profile.friends || []).includes(p.id);
    const isSent = hasSentRequest(p.id);

    const el = document.createElement('div');
    el.className = 'list-item';

    // Avatar + name row
    el.innerHTML = `
      <div class="list-avatar"><img src="${avatarUrl(p)}"></div>
      <div class="list-body">
        <div class="list-name">${escapeHtml(p.displayName || 'User')}</div>
        <div class="list-sub">@${escapeHtml(p.username || '')}</div>
      </div>
      <div class="list-actions"></div>
    `;

    // Click on row → open that user's profile
    el.onclick = () => router.go('user', { uid: p.id, from: 'search' });

    // Build the action button depending on state
    const actions = el.querySelector('.list-actions');
    const btn = document.createElement('button');
    btn.className = 'mini-btn';

    if (isFriend) {
      btn.classList.add('message');
      btn.textContent = '💬 Message';
      btn.onclick = (e) => {
        e.stopPropagation();
        startDirectChat(p.id);
      };
    } else if (isSent) {
      btn.classList.add('sent');
      btn.textContent = '✓ Sent';
      btn.onclick = (e) => {
        e.stopPropagation();
        confirmUnsend(p);
      };
    } else {
      btn.classList.add('accept');
      btn.textContent = '➕ Add';
      btn.onclick = (e) => {
        e.stopPropagation();
        sendFriendRequest(p.id);
      };
    }

    actions.appendChild(btn);
    res.appendChild(el);
  });
}

// ============================================================
// UNSEND CONFIRMATION
// ============================================================
function confirmUnsend(profile) {
  showModal(
    'Unsend Request',
    `<p style="margin-bottom:8px">
      Cancel the friend request you sent to
      <b>${escapeHtml(profile.displayName || 'this user')}</b>?
    </p>`,
    async () => {
      await unsendRequest(profile.id);
    },
    'Unsend'
  );
}

$('#user-search').oninput = debounce(() => renderSearch(), 350);
