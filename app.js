/* ============================================================
   Fast S — Complete Chat App (Firestore-only)
   ============================================================ */

// ===== Firebase =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-analytics.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
  sendPasswordResetEmail, updateProfile as fbUpdateProfile, deleteUser
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, query, where, orderBy, limit, onSnapshot,
  serverTimestamp, getDocs, arrayUnion, arrayRemove, writeBatch,
  increment, startAfter, endAt, startAt, documentId
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  getStorage, ref as storageRef, uploadBytes, getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyCX7u6tAmK-k-6Oq-S7DNhU74MyyfT38Uw",
  authDomain: "java-corn.firebaseapp.com",
  databaseURL: "https://java-corn-default-rtdb.firebaseio.com",
  projectId: "java-corn",
  storageBucket: "java-corn.firebasestorage.app",
  messagingSenderId: "925971536544",
  appId: "1:925971536544:web:29bc09fc96f40e7dc747c5",
  measurementId: "G-TKDER5WR36"
};

const fbApp = initializeApp(firebaseConfig);
try { getAnalytics(fbApp); } catch(e){}
const auth = getAuth(fbApp);
const db = getFirestore(fbApp);
const storage = getStorage(fbApp);

// ===== State =====
const S = {
  user: null,
  profile: null,
  activeChat: null,
  activeChatData: null,
  chats: [],
  friends: [],
  requests: [],
  notifs: [],
  unsubChats: null,
  unsubMsgs: null,
  unsubTyping: null,
  unsubProfile: null,
  unsubNotifs: null,
  unsubRequests: null,
  presenceTimer: null,
  typingTimer: null,
  currentView: 'chats',
  replyTo: null,
  ctxTarget: null,
  userCache: {}
};

// ===== Utils =====
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

function timeAgo(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 30) return 'just now';
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  if (s < 604800) return Math.floor(s / 86400) + 'd';
  return d.toLocaleDateString();
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function debounce(fn, delay) {
  let t;
  return function (...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), delay);
  };
}

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2600);
}

function showModal(title, bodyHtml, onOk, okText = 'OK') {
  const modal = $('#modal');
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  $('#modal-ok').textContent = okText;
  modal.classList.remove('hidden');
  const cleanup = () => { modal.classList.add('hidden'); $('#modal-ok').onclick = null; $('#modal-cancel').onclick = null; };
  $('#modal-ok').onclick = () => { const r = onOk && onOk(); if (r !== false) cleanup(); };
  $('#modal-cancel').onclick = cleanup;
}

function confirmDialog(title, msg, onYes, yesText = 'Yes') {
  showModal(title, `<p style="margin-bottom:8px">${escapeHtml(msg)}</p>`, onYes, yesText);
}

function showLoader(show = true) { $('#loader').classList.toggle('hidden', !show); }
function showAuth(show = true) { $('#auth-screen').classList.toggle('hidden', !show); }
function showMain(show = true) { $('#main-screen').classList.toggle('hidden', !show); }

function avatarUrl(profile) {
  return profile?.photoURL || `https://ui-avatars.com/api/?background=7b2ff7&color=fff&bold=true&name=${encodeURIComponent(profile?.displayName || profile?.username || '?')}`;
}

// ===== Theme =====
function initTheme() {
  const saved = localStorage.getItem('fasts-theme') || 'dark';
  if (saved === 'light') document.body.classList.add('light');
  $('#theme-btn').onclick = () => {
    document.body.classList.toggle('light');
    const isLight = document.body.classList.contains('light');
    localStorage.setItem('fasts-theme', isLight ? 'light' : 'dark');
  };
}

// ===== Router / Back Button =====
const router = {
  stack: [],
  go(view, opts = {}) {
    const prev = S.currentView;
    if (prev && prev !== view) this.stack.push({ view: prev, opts: S.currentViewOpts || {} });
    S.currentViewOpts = opts;
    this.render(view, opts);
    history.pushState({ view, opts }, '', '#' + view);
  },
  back() {
    const prev = this.stack.pop();
    if (prev) {
      S.currentViewOpts = prev.opts;
      this.render(prev.view, prev.opts);
      history.pushState({ view: prev.view, opts: prev.opts }, '', '#' + prev.view);
    }
  },
  render(view, opts = {}) {
    S.currentView = view;
    $$('.view').forEach(v => v.classList.add('hidden'));
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));

    if (view === 'chats')       renderChats();
    if (view === 'friends')     renderFriends();
    if (view === 'search')      renderSearch();
    if (view === 'profile')     renderProfile();
    if (view === 'chat')        renderChatView(opts.chatId);

    // Back button visibility
    $('#back-btn').classList.toggle('hidden', !['chat'].includes(view));

    // Topbar title
    const titles = { chats:'Fast S', friends:'Friends', search:'Find People', profile:'Profile', chat: opts.title || 'Chat' };
    $('#topbar-title').textContent = titles[view] || 'Fast S';

    // bottom nav visibility in chat
    $('#bottom-nav').classList.toggle('hidden', view === 'chat');
  }
};

function initBackButton() {
  history.replaceState({ view: S.currentView }, '', '#' + S.currentView);
  window.addEventListener('popstate', (e) => {
    const st = e.state;
    if (!st) { history.pushState({ view: 'chats' }, '', '#chats'); router.render('chats'); return; }
    if (st.view === 'chats' && S.currentView === 'chats') return;
    router.render(st.view, st.opts || {});
  });
  $('#back-btn').onclick = () => {
    if (S.currentView === 'chat') {
      closeActiveChat();
    }
    history.back();
  };
}

// ============================================================
// AUTH
// ============================================================
async function initAuth() {
  // Tabs
  $$('.auth-tab').forEach(t => t.onclick = () => {
    $$('.auth-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    const tab = t.dataset.tab;
    $('#login-form').classList.toggle('hidden', tab !== 'login');
    $('#signup-form').classList.toggle('hidden', tab !== 'signup');
    $('#auth-error').classList.add('hidden');
  });

  $('#login-form').onsubmit = async (e) => {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    const pass = $('#login-password').value;
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (err) { showAuthError(authErrorMsg(err)); }
  };

  $('#signup-form').onsubmit = async (e) => {
    e.preventDefault();
    const name = $('#signup-name').value.trim();
    const username = $('#signup-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    const email = $('#signup-email').value.trim();
    const pass = $('#signup-password').value;
    if (name.length < 2) return showAuthError('Name too short');
    if (username.length < 3) return showAuthError('Username must be at least 3 chars');
    if (pass.length < 6) return showAuthError('Password must be at least 6 chars');
    try {
      // check username availability
      const uSnap = await getDoc(doc(db, 'usernames', username));
      if (uSnap.exists()) return showAuthError('Username already taken');
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await fbUpdateProfile(cred.user, { displayName: name });
      await createUserDoc(cred.user, name, username);
    } catch (err) { showAuthError(authErrorMsg(err)); }
  };

  $('#google-btn').onclick = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const cred = await signInWithPopup(auth, provider);
      // Ensure user doc
      const uSnap = await getDoc(doc(db, 'users', cred.user.uid));
      if (!uSnap.exists()) {
        const base = (cred.user.email?.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '');
        let username = base;
        let i = 1;
        while ((await getDoc(doc(db, 'usernames', username))).exists()) {
          username = base + i++;
        }
        await createUserDoc(cred.user, cred.user.displayName || username, username);
      }
    } catch (err) { showAuthError(authErrorMsg(err)); }
  };

  $('#forgot-link').onclick = (e) => {
    e.preventDefault();
    showModal('Reset Password', `
      <input type="email" id="reset-email" placeholder="Your email" style="width:100%">
    `, async () => {
      const em = $('#reset-email').value.trim();
      if (!em) return false;
      try {
        await sendPasswordResetEmail(auth, em);
        toast('Reset email sent! Check your inbox.', 'success');
      } catch (err) { toast(authErrorMsg(err), 'error'); }
    }, 'Send');
  };

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      S.user = user;
      await loadUserProfile();
      showLoader(false); showAuth(false); showMain(true);
      startAllListeners();
    } else {
      S.user = null; S.profile = null;
      stopAllListeners();
      showLoader(false); showMain(false); showAuth(true);
    }
  });
}

function authErrorMsg(err) {
  const m = { 'auth/invalid-email':'Invalid email','auth/user-not-found':'User not found','auth/wrong-password':'Wrong password','auth/email-already-in-use':'Email already in use','auth/weak-password':'Weak password (6+ chars)','auth/popup-closed-by-user':'Sign-in cancelled','auth/invalid-credential':'Invalid credentials' };
  return m[err.code] || err.message;
}
function showAuthError(msg) {
  const el = $('#auth-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

async function createUserDoc(user, name, username) {
  const batch = writeBatch(db);
  const userRef = doc(db, 'users', user.uid);
  batch.set(userRef, {
    uid: user.uid,
    email: user.email,
    displayName: name,
    username,
    photoURL: user.photoURL || '',
    bio: '',
    friends: [],
    blocked: [],
    settings: { notifications: true, showLastSeen: true },
    online: true,
    lastSeen: serverTimestamp(),
    createdAt: serverTimestamp()
  });
  batch.set(doc(db, 'usernames', username), { uid: user.uid });
  await batch.commit();
}

// ============================================================
// USER PROFILE
// ============================================================
async function loadUserProfile() {
  const snap = await getDoc(doc(db, 'users', S.user.uid));
  if (snap.exists()) {
    S.profile = snap.data();
    S.userCache[S.user.uid] = S.profile;
    // Start profile listener
    if (S.unsubProfile) S.unsubProfile();
    S.unsubProfile = onSnapshot(doc(db, 'users', S.user.uid), (d) => {
      if (d.exists()) {
        S.profile = d.data();
        S.userCache[S.user.uid] = S.profile;
        updateTopbarAvatar();
      }
    });
  }
  updateTopbarAvatar();
}

function updateTopbarAvatar() {
  const url = avatarUrl(S.profile);
  $('#topbar-avatar').src = url;
}

async function getUser(uid) {
  if (S.userCache[uid] && S.userCache[uid].__cached) return S.userCache[uid];
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) {
    const data = snap.data();
    S.userCache[uid] = data;
    return data;
  }
  return null;
}

// ============================================================
// PRESENCE (Firestore heartbeat)
// ============================================================
function startPresence() {
  const userRef = doc(db, 'users', S.user.uid);
  const beat = () => updateDoc(userRef, { online: true, lastSeen: serverTimestamp() }).catch(()=>{});
  beat();
  S.presenceTimer = setInterval(beat, 30000);
  window.addEventListener('beforeunload', () => {
    updateDoc(userRef, { online: false, lastSeen: serverTimestamp() }).catch(()=>{});
  });
  document.addEventListener('visibilitychange', () => {
    updateDoc(userRef, {
      online: !document.hidden,
      lastSeen: serverTimestamp()
    }).catch(()=>{});
  });
}
function stopPresence() { clearInterval(S.presenceTimer); }
function isOnline(profile) {
  if (!profile || !profile.lastSeen) return false;
  const t = profile.lastSeen.toDate ? profile.lastSeen.toDate() : new Date(profile.lastSeen);
  return (Date.now() - t.getTime()) < 70000;
}

// ============================================================
// CHATS LISTENER
// ============================================================
function startAllListeners() {
  startPresence();
  listenChats();
  listenFriendRequests();
  listenNotifications();
}

function stopAllListeners() {
  stopPresence();
  [S.unsubChats, S.unsubMsgs, S.unsubTyping, S.unsubProfile, S.unsubNotifs, S.unsubRequests]
    .forEach(u => u && u());
  S.unsubChats = S.unsubMsgs = S.unsubTyping = S.unsubProfile = S.unsubNotifs = S.unsubRequests = null;
}

function listenChats() {
  if (S.unsubChats) S.unsubChats();
  const q = query(
    collection(db, 'chats'),
    where('members', 'array-contains', S.user.uid)
  );
  S.unsubChats = onSnapshot(q, async (snap) => {
    const chats = [];
    for (const d of snap.docs) {
      const data = d.data();
      chats.push({ id: d.id, ...data });
    }
    // sort by updatedAt
    chats.sort((a, b) => {
      const ta = a.updatedAt?.toDate?.()?.getTime() || 0;
      const tb = b.updatedAt?.toDate?.()?.getTime() || 0;
      return tb - ta;
    });
    S.chats = chats;
    if (S.currentView === 'chats') renderChats();
  }, (e) => console.warn('chats listener', e));
}

// ============================================================
// VIEW: CHATS
// ============================================================
function renderChats() {
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
      ? (chat.photoURL || `https://ui-avatars.com/api/?background=7b2ff7&color=fff&bold=true&name=${encodeURIComponent(chat.name||'G')}`)
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
        <div class="list-sub">${last ? escapeHtml(last.senderName ? last.senderName.split(' ')[0] + ': ' + (last.text || '📎') : (last.text || '📎')) : 'No messages yet'}</div>
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

function chatTitle(chat) {
  if (chat.type === 'group') return chat.name || 'Group';
  const other = chat.members.find(u => u !== S.user.uid);
  const p = S.userCache[other];
  return p?.displayName || p?.username || 'User';
}

// New chat button -> go to friends or create group
$('#new-chat-btn').onclick = () => {
  showModal('New Chat', `
    <button class="btn-secondary" id="new-direct" style="width:100%;margin-bottom:8px">👤 Direct Message</button>
    <button class="btn-secondary" id="new-group" style="width:100%">👥 New Group</button>
  `, null);
  $('#modal-ok').classList.add('hidden');
  $('#modal-cancel').onclick = () => { $('#modal').classList.add('hidden'); $('#modal-ok').classList.remove('hidden'); };
  setTimeout(() => {
    $('#new-direct').onclick = () => { $('#modal').classList.add('hidden'); $('#modal-ok').classList.remove('hidden'); router.go('friends'); };
    $('#new-group').onclick = () => { $('#modal').classList.add('hidden'); $('#modal-ok').classList.remove('hidden'); createGroupFlow(); };
  }, 30);
};

$('#chat-search').oninput = debounce(() => renderChats(), 200);

// ============================================================
// VIEW: FRIENDS
// ============================================================
function listenFriendRequests() {
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

async function renderFriends() {
  const reqList = $('#friend-requests-list');
  const friendList = $('#friends-list');
  const q = ($('#friends-search').value || '').trim().toLowerCase();

  // Requests
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

  // Friends
  const friends = S.profile?.friends || [];
  if (friends.length === 0) {
    friendList.innerHTML = '<div class="empty-state">No friends yet — use Search to find people</div>';
    return;
  }
  const profiles = await Promise.all(friends.map(uid => getUser(uid)));
  friendList.innerHTML = '';
  profiles.filter(Boolean).forEach(p => {
    if (q && !(p.displayName || '').toLowerCase().includes(q) && !(p.username || '').toLowerCase().includes(q)) return;
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
        <button class="mini-btn">Message</button>
      </div>
    `;
    el.onclick = () => startDirectChat(p.uid);
    friendList.appendChild(el);
  });
}
$('#friends-search').oninput = debounce(() => renderFriends(), 200);

// ============================================================
// FRIEND REQUESTS
// ============================================================
async function sendFriendRequest(uid) {
  if (uid === S.user.uid) return toast('Cannot add yourself', 'error');
  if ((S.profile.friends || []).includes(uid)) return toast('Already friends');
  // Check existing
  const q1 = query(collection(db, 'friendRequests'),
    where('from', '==', S.user.uid), where('to', '==', uid), where('status','==','pending'));
  const ex = await getDocs(q1);
  if (!ex.empty) return toast('Request already sent');
  await addDoc(collection(db, 'friendRequests'), {
    from: S.user.uid,
    to: uid,
    fromName: S.profile.displayName,
    fromPhoto: S.profile.photoURL || '',
    status: 'pending',
    createdAt: serverTimestamp()
  });
  toast('Friend request sent', 'success');
}

async function acceptRequest(req) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', S.user.uid), { friends: arrayUnion(req.from) });
  batch.update(doc(db, 'users', req.from), { friends: arrayUnion(S.user.uid) });
  batch.update(doc(db, 'friendRequests', req.id), { status: 'accepted' });
  await batch.commit();
  await loadUserProfile();
  toast('Friend added', 'success');
  renderFriends();
}

async function rejectRequest(req) {
  await updateDoc(doc(db, 'friendRequests', req.id), { status: 'rejected' });
  toast('Request rejected');
}

async function unfriend(uid) {
  const p = await getUser(uid);
  confirmDialog('Unfriend', `Remove ${p?.displayName || 'this user'} from friends?`, async () => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', S.user.uid), { friends: arrayRemove(uid) });
    batch.update(doc(db, 'users', uid), { friends: arrayRemove(S.user.uid) });
    await batch.commit();
    await loadUserProfile();
    toast('Unfriended');
    renderFriends();
  }, 'Unfriend');
}

async function blockUser(uid) {
  const p = await getUser(uid);
  confirmDialog('Block User', `Block ${p?.displayName || 'user'}? They won't be able to message you.`, async () => {
    await updateDoc(doc(db, 'users', S.user.uid), { blocked: arrayUnion(uid) });
    await loadUserProfile();
    toast('User blocked', 'error');
  }, 'Block');
}

async function unblockUser(uid) {
  await updateDoc(doc(db, 'users', S.user.uid), { blocked: arrayRemove(uid) });
  await loadUserProfile();
  toast('User unblocked', 'success');
}

// ============================================================
// VIEW: SEARCH
// ============================================================
async function renderSearch() {
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

  // Search by username (prefix) and displayName (prefix)
  const usersRef = collection(db, 'users');
  const q1 = query(usersRef, orderBy('username'), startAt(q), endAt(q + '\uf8ff'), limit(15));
  const q2 = query(usersRef, orderBy('displayName'), startAt(q.charAt(0).toUpperCase() + q.slice(1)), endAt(q.charAt(0).toUpperCase() + q.slice(1) + '\uf8ff'), limit(15));

  try {
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
    for (const p of results) {
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
    }
  } catch (err) {
    console.error(err);
    res.innerHTML = '<div class="empty-state">Search error — try again</div>';
  }
}
$('#user-search').oninput = debounce(() => renderSearch(), 350);

// ============================================================
// VIEW: PROFILE
// ============================================================
function renderProfile() {
  if (!S.profile) return;
  $('#profile-avatar').src = avatarUrl(S.profile);
  $('#profile-name').textContent = S.profile.displayName;
  $('#profile-username').textContent = '@' + (S.profile.username || '');
  $('#profile-bio').textContent = S.profile.bio || 'No bio yet';
  $('#profile-stats').innerHTML = `
    <div class="stat-item"><div class="stat-value">${(S.profile.friends||[]).length}</div><div class="stat-label">Friends</div></div>
    <div class="stat-item"><div class="stat-value">${S.chats.length}</div><div class="stat-label">Chats</div></div>
  `;
}

$('#edit-profile-btn').onclick = () => {
  showModal('Edit Profile', `
    <input type="text" id="edit-name" value="${escapeHtml(S.profile.displayName)}" placeholder="Display name">
    <input type="text" id="edit-bio" value="${escapeHtml(S.profile.bio || '')}" placeholder="Bio" maxlength="150">
  `, async () => {
    const name = $('#edit-name').value.trim();
    const bio = $('#edit-bio').value.trim();
    if (!name) return false;
    await updateDoc(doc(db, 'users', S.user.uid), { displayName: name, bio });
    await fbUpdateProfile(S.user, { displayName: name });
    S.profile.displayName = name; S.profile.bio = bio;
    renderProfile();
    toast('Profile updated', 'success');
  }, 'Save');
};

$('#avatar-upload').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) return toast('Max 3MB', 'error');
  try {
    toast('Uploading...');
    const path = `users/${S.user.uid}/avatar_${Date.now()}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    const url = await getDownloadURL(ref);
    await updateDoc(doc(db, 'users', S.user.uid), { photoURL: url });
    await fbUpdateProfile(S.user, { photoURL: url });
    S.profile.photoURL = url;
    renderProfile();
    updateTopbarAvatar();
    toast('Photo updated', 'success');
  } catch (err) { console.error(err); toast('Upload failed', 'error'); }
};

$('#blocked-btn').onclick = async () => {
  const blocked = S.profile.blocked || [];
  if (blocked.length === 0) return toast('No blocked users');
  const profiles = await Promise.all(blocked.map(getUser));
  showModal('Blocked Users', profiles.map(p => `
    <div class="list-item" style="padding:8px">
      <div class="list-avatar" style="width:36px;height:36px"><img src="${avatarUrl(p)}"></div>
      <div class="list-body"><div class="list-name">${escapeHtml(p?.displayName || '?')}</div></div>
      <button class="mini-btn" data-uid="${p?.uid}">Unblock</button>
    </div>
  `).join(''), null);
  $('#modal-ok').classList.add('hidden');
  setTimeout(() => {
    $$('#modal-body .mini-btn').forEach(btn => btn.onclick = async () => {
      await unblockUser(btn.dataset.uid);
      $('#modal').classList.add('hidden');
      $('#modal-ok').classList.remove('hidden');
    });
  }, 30);
};

$('#settings-btn').onclick = () => {
  showModal('Settings', `
    <label style="display:flex;justify-content:space-between;align-items:center;padding:10px 0">
      <span>Show last seen</span>
      <input type="checkbox" id="set-lastseen" ${S.profile.settings?.showLastSeen !== false ? 'checked' : ''}>
    </label>
    <label style="display:flex;justify-content:space-between;align-items:center;padding:10px 0">
      <span>Notifications</span>
      <input type="checkbox" id="set-notif" ${S.profile.settings?.notifications !== false ? 'checked' : ''}>
    </label>
  `, async () => {
    await updateDoc(doc(db, 'users', S.user.uid), {
      'settings.showLastSeen': $('#set-lastseen').checked,
      'settings.notifications': $('#set-notif').checked
    });
    toast('Settings saved', 'success');
  }, 'Save');
};

$('#logout-btn').onclick = () => {
  confirmDialog('Logout', 'Are you sure you want to logout?', async () => {
    if (S.user) await updateDoc(doc(db, 'users', S.user.uid), { online: false, lastSeen: serverTimestamp() }).catch(()=>{});
    await signOut(auth);
  }, 'Logout');
};

$('#delete-account-btn').onclick = () => {
  confirmDialog('Delete Account', 'This will permanently delete your account. Continue?', async () => {
    try {
      // Delete user doc + username
      await deleteDoc(doc(db, 'usernames', S.profile.username)).catch(()=>{});
      await deleteDoc(doc(db, 'users', S.user.uid));
      await deleteUser(S.user);
      toast('Account deleted', 'success');
    } catch (err) {
      toast('Please re-login and try again', 'error');
    }
  }, 'Delete');
};

// ============================================================
// START DIRECT CHAT
// ============================================================
async function startDirectChat(uid) {
  // Check if a direct chat exists
  const q = query(collection(db, 'chats'),
    where('type', '==', 'direct'),
    where('members', 'array-contains', S.user.uid));
  const snap = await getDocs(q);
  const existing = snap.docs.find(d => {
    const m = d.data().members;
    return m.length === 2 && m.includes(uid);
  });
  if (existing) return openChat(existing.id, existing.data());

  const other = await getUser(uid);
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
// GROUP CHAT CREATE
// ============================================================
async function createGroupFlow() {
  const friends = S.profile.friends || [];
  if (friends.length === 0) return toast('Add friends first', 'error');
  const profiles = await Promise.all(friends.map(getUser));
  showModal('New Group (max 5)', `
    <input type="text" id="grp-name" placeholder="Group name">
    <div style="max-height:280px;overflow-y:auto;margin-bottom:10px">
      ${profiles.map(p => `
        <label class="list-item" style="cursor:pointer">
          <input type="checkbox" value="${p.uid}" style="width:auto;margin:0">
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
    toast('Group created', 'success');
    openChat(ref.id, { id: ref.id, type: 'group', members, name });
  }, 'Create');
}

// ============================================================
// OPEN CHAT
// ============================================================
async function openChat(chatId, chatData) {
  closeActiveChat();
  S.activeChat = chatId;
  const fresh = await getDoc(doc(db, 'chats', chatId));
  S.activeChatData = fresh.exists() ? { id: chatId, ...fresh.data() } : chatData;

  const title = chatTitle(S.activeChatData);
  router.go('chat', { chatId, title });

  // Clear unread
  await updateDoc(doc(db, 'chats', chatId), { [`unread.${S.user.uid}`]: 0 }).catch(()=>{});

  // Load messages
  subscribeMessages(chatId);
  subscribeTyping(chatId);
}

function closeActiveChat() {
  if (S.unsubMsgs) { S.unsubMsgs(); S.unsubMsgs = null; }
  if (S.unsubTyping) { S.unsubTyping(); S.unsubTyping = null; }
  S.activeChat = null;
  S.activeChatData = null;
  S.replyTo = null;
  $('#reply-preview').classList.add('hidden');
}

function renderChatView() {
  // render existing messages on view switch
  $('#chat-messages').innerHTML = '';
  if (S.activeChat) subscribeMessages(S.activeChat);
}

// ============================================================
// MESSAGES
// ============================================================
function subscribeMessages(chatId) {
  if (S.unsubMsgs) S.unsubMsgs();
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200)
  );
  S.unsubMsgs = onSnapshot(q, (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMessages(msgs);
    scrollChatToBottom();
    // Mark read
    markMessagesRead(chatId, msgs);
  });
}

async function markMessagesRead(chatId, msgs) {
  const batch = writeBatch(db);
  let dirty = false;
  msgs.forEach(m => {
    if (m.sender !== S.user.uid && !(m.readBy || []).includes(S.user.uid)) {
      batch.update(doc(db, 'chats', chatId, 'messages', m.id), { readBy: arrayUnion(S.user.uid) });
      dirty = true;
    }
  });
  if (dirty) await batch.commit().catch(()=>{});
}

function renderMessages(msgs) {
  const container = $('#chat-messages');
  container.innerHTML = '';
  const isGroup = S.activeChatData?.type === 'group';
  let lastSender = null;

  msgs.forEach((m, i) => {
    const out = m.sender === S.user.uid;
    const isNewSender = m.sender !== lastSender;
    lastSender = m.sender;

    const row = document.createElement('div');
    row.className = 'msg-row ' + (out ? 'out' : 'in') + (isNewSender ? ' group-start' : '');
    row.dataset.msgId = m.id;

    if (m.deleted) {
      row.innerHTML = `<div class="bubble" style="opacity:.6;font-style:italic">This message was deleted</div>`;
      container.appendChild(row);
      return;
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    let inner = '';
    // Sender name (group, incoming)
    if (isGroup && !out && isNewSender) {
      inner += `<div class="msg-sender">${escapeHtml(m.senderName || 'User')}</div>`;
    }
    // Reply preview
    if (m.replyTo) {
      inner += `<div class="msg-reply-preview"><b>${escapeHtml(m.replyTo.senderName || 'User')}</b>${escapeHtml((m.replyTo.text || '').slice(0, 100))}</div>`;
    }
    // Content
    if (m.type === 'image' && m.fileURL) {
      inner += `<img class="msg-image" src="${m.fileURL}" onclick="window.open('${m.fileURL}','_blank')">`;
    } else if (m.type === 'file' && m.fileURL) {
      inner += `<a class="msg-file" href="${m.fileURL}" target="_blank" rel="noopener">
        <div class="msg-file-icon">📎</div>
        <div>
          <div class="msg-file-name">${escapeHtml(m.fileName || 'file')}</div>
          <div class="msg-file-size">${(m.fileSize / 1024).toFixed(1)} KB</div>
        </div>
      </a>`;
    } else {
      inner += `<div>${escapeHtml(m.text || '')}</div>`;
    }
    // Meta
    inner += `<div class="msg-meta">
      ${m.editedAt ? '<span class="edited">edited</span>' : ''}
      <span>${formatTime(m.createdAt)}</span>
      ${out ? `<span>${(m.readBy || []).length > 1 ? '✓✓' : '✓'}</span>` : ''}
    </div>`;

    // Reactions
    if (m.reactions && Object.keys(m.reactions).length) {
      let rx = '<div class="reactions">';
      for (const [emoji, users] of Object.entries(m.reactions)) {
        if (!users || !users.length) continue;
        const mine = users.includes(S.user.uid);
        rx += `<div class="reaction-chip" data-emoji="${emoji}" style="${mine ? 'outline:1px solid var(--accent)' : ''}">${emoji} ${users.length}</div>`;
      }
      rx += '</div>';
      inner += rx;
    }

    bubble.innerHTML = inner;
    row.appendChild(bubble);
    container.appendChild(row);

    // Interactions
    row.oncontextmenu = (e) => { e.preventDefault(); showMessageMenu(e.clientX, e.clientY, m, row); };
    // long press mobile
    let touchTimer;
    row.addEventListener('touchstart', (e) => {
      touchTimer = setTimeout(() => {
        const t = e.touches[0];
        showMessageMenu(t.clientX, t.clientY, m, row);
      }, 500);
    }, { passive: true });
    row.addEventListener('touchend', () => clearTimeout(touchTimer));
    row.addEventListener('touchmove', () => clearTimeout(touchTimer));

    // Click reaction chips to toggle
    row.querySelectorAll('.reaction-chip').forEach(chip => {
      chip.onclick = (e) => { e.stopPropagation(); toggleReaction(S.activeChat, m, chip.dataset.emoji); };
    });
  });
}

function scrollChatToBottom() {
  const c = $('#chat-messages');
  requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}

function showMessageMenu(x, y, m, row) {
  const isMine = m.sender === S.user.uid;
  const menu = $('#context-menu');
  const reactions = ['❤️','😂','👍','😮','😢','🙏'];
  menu.innerHTML = `
    <div class="reaction-picker" style="position:static;margin-bottom:6px;justify-content:center">
      ${reactions.map(r => `<button data-r="${r}">${r}</button>`).join('')}
    </div>
    <div class="ctx-item" data-a="reply">↩️ Reply</div>
    ${isMine ? `<div class="ctx-item" data-a="edit">✏️ Edit</div>` : ''}
    <div class="ctx-item" data-a="forward">↪️ Forward</div>
    <div class="ctx-item" data-a="star">⭐ Star</div>
    ${isMine ? `<div class="ctx-divider"></div><div class="ctx-item danger" data-a="delete">🗑️ Delete</div>` : ''}
    ${!isMine ? `<div class="ctx-divider"></div><div class="ctx-item danger" data-a="report">🚩 Report</div>` : ''}
  `;
  menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 320) + 'px';
  menu.classList.remove('hidden');

  menu.querySelectorAll('[data-r]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    toggleReaction(S.activeChat, m, b.dataset.r);
    hideCtx();
  });
  menu.querySelectorAll('[data-a]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const a = b.dataset.a;
    if (a === 'reply') setReply(m);
    if (a === 'edit') editMessage(m);
    if (a === 'delete') deleteMessage(m);
    if (a === 'forward') forwardMessage(m);
    if (a === 'star') starMessage(m);
    if (a === 'report') reportMessage(m);
    hideCtx();
  });

  const hideCtx = () => menu.classList.add('hidden');
  setTimeout(() => {
    document.addEventListener('click', function c(e) {
      if (!menu.contains(e.target)) { hideCtx(); document.removeEventListener('click', c); }
    });
  }, 10);
}

async function toggleReaction(chatId, msg, emoji) {
  const ref = doc(db, 'chats', chatId, 'messages', msg.id);
  const key = `reactions.${emoji}`;
  const has = (msg.reactions?.[emoji] || []).includes(S.user.uid);
  await updateDoc(ref, { [key]: has ? arrayRemove(S.user.uid) : arrayUnion(S.user.uid) });
}

function setReply(m) {
  S.replyTo = { msgId: m.id, text: m.text || (m.type === 'image' ? '📷 Photo' : '📎 File'), senderName: m.senderName };
  $('#reply-preview').classList.remove('hidden');
  $('#reply-preview').innerHTML = `
    <div class="reply-preview-body">
      <b>Replying to ${escapeHtml(m.senderName || 'User')}</b>
      <div class="reply-preview-text">${escapeHtml(S.replyTo.text)}</div>
    </div>
    <div class="reply-close" id="reply-close">✕</div>
  `;
  $('#reply-close').onclick = () => { S.replyTo = null; $('#reply-preview').classList.add('hidden'); };
  $('#message-input').focus();
}

async function editMessage(m) {
  showModal('Edit Message', `<input type="text" id="edit-msg" value="${escapeHtml(m.text)}">`, async () => {
    const t = $('#edit-msg').value.trim();
    if (!t) return false;
    await updateDoc(doc(db, 'chats', S.activeChat, 'messages', m.id), { text: t, editedAt: serverTimestamp() });
    toast('Edited', 'success');
  }, 'Save');
}

async function deleteMessage(m) {
  confirmDialog('Delete', 'Delete this message?', async () => {
    await updateDoc(doc(db, 'chats', S.activeChat, 'messages', m.id), { deleted: true, text: '', fileURL: '', type: 'text' });
    toast('Deleted');
  }, 'Delete');
}

async function forwardMessage(m) {
  if (S.chats.length === 0) return toast('No chats to forward to');
  showModal('Forward to', S.chats.map(c => `
    <div class="list-item" data-fwd="${c.id}">
      <div class="list-body"><div class="list-name">${escapeHtml(chatTitle(c))}</div></div>
    </div>
  `).join(''), null);
  $('#modal-ok').classList.add('hidden');
  setTimeout(() => {
    $$('#modal-body [data-fwd]').forEach(el => el.onclick = async () => {
      const cid = el.dataset.fwd;
      await addDoc(collection(db, 'chats', cid, 'messages'), {
        sender: S.user.uid,
        senderName: S.profile.displayName,
        senderPhoto: S.profile.photoURL || '',
        text: m.text || '',
        type: m.type || 'text',
        fileURL: m.fileURL || '',
        fileName: m.fileName || '',
        fileSize: m.fileSize || 0,
        fileMime: m.fileMime || '',
        reactions: {},
        readBy: [S.user.uid],
        starredBy: [],
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'chats', cid), {
        lastMessage: {
          text: m.text || '📎',
          senderName: S.profile.displayName,
          senderId: S.user.uid,
          createdAt: serverTimestamp(),
          type: m.type || 'text'
        },
        updatedAt: serverTimestamp()
      });
      toast('Forwarded', 'success');
      $('#modal').classList.add('hidden');
      $('#modal-ok').classList.remove('hidden');
    });
  }, 30);
}

async function starMessage(m) {
  const ref = doc(db, 'chats', S.activeChat, 'messages', m.id);
  const has = (m.starredBy || []).includes(S.user.uid);
  await updateDoc(ref, { starredBy: has ? arrayRemove(S.user.uid) : arrayUnion(S.user.uid) });
  toast(has ? 'Unstarred' : 'Starred', 'success');
}

async function reportMessage(m) {
  showModal('Report', `
    <select id="report-reason">
      <option>Spam</option>
      <option>Harassment</option>
      <option>Inappropriate content</option>
      <option>Other</option>
    </select>
  `, async () => {
    await addDoc(collection(db, 'reports'), {
      reporter: S.user.uid,
      reported: m.sender,
      chatId: S.activeChat,
      messageId: m.id,
      reason: $('#report-reason').value,
      createdAt: serverTimestamp()
    });
    toast('Report submitted', 'success');
  }, 'Report');
}

// ============================================================
// SEND MESSAGE
// ============================================================
async function sendMessage() {
  const input = $('#message-input');
  const text = input.value.trim();
  if (!text || !S.activeChat) return;
  input.value = '';
  await stopTyping();

  const msg = {
    sender: S.user.uid,
    senderName: S.profile.displayName,
    senderPhoto: S.profile.photoURL || '',
    text,
    type: 'text',
    reactions: {},
    readBy: [S.user.uid],
    starredBy: [],
    createdAt: serverTimestamp()
  };
  if (S.replyTo) {
    msg.replyTo = S.replyTo;
    S.replyTo = null;
    $('#reply-preview').classList.add('hidden');
  }

  await addDoc(collection(db, 'chats', S.activeChat, 'messages'), msg);
  await updateDoc(doc(db, 'chats', S.activeChat), {
    lastMessage: {
      text, senderName: S.profile.displayName, senderId: S.user.uid,
      createdAt: serverTimestamp(), type: 'text'
    },
    updatedAt: serverTimestamp()
  });
}

$('#send-btn').onclick = sendMessage;
$('#message-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});

// ============================================================
// TYPING INDICATOR
// ============================================================
let typingActive = false;
$('#message-input').addEventListener('input', async () => {
  if (!S.activeChat) return;
  if (!typingActive) {
    typingActive = true;
    await setTyping(true);
  }
  clearTimeout(S.typingTimer);
  S.typingTimer = setTimeout(() => stopTyping(), 3000);
});

async function setTyping(val) {
  if (!S.activeChat) return;
  const ref = doc(db, 'users', S.user.uid, 'typing', S.activeChat);
  await setDoc(ref, { typing: val, at: serverTimestamp(), name: S.profile.displayName }).catch(()=>{});
}
async function stopTyping() {
  if (!typingActive) return;
  typingActive = false;
  if (S.activeChat) await setTyping(false);
}

function subscribeTyping(chatId) {
  if (S.unsubTyping) S.unsubTyping();
  const members = S.activeChatData?.members || [];
  const others = members.filter(u => u !== S.user.uid);
  if (others.length === 0) return;

  const typingMap = {};
  const unsubs = others.map(uid => onSnapshot(doc(db, 'users', uid, 'typing', chatId), (d) => {
    if (d.exists() && d.data().typing) {
      const t = d.data().at?.toDate?.()?.getTime() || 0;
      if (Date.now() - t < 8000) typingMap[uid] = d.data().name || 'Someone';
      else delete typingMap[uid];
    } else delete typingMap[uid];
    const names = Object.values(typingMap);
    const el = $('#typing-indicator');
    if (names.length === 0) el.classList.add('hidden');
    else { el.classList.remove('hidden'); el.textContent = names.join(', ') + ' typing...'; }
  }));
  S.unsubTyping = () => unsubs.forEach(u => u());
}

// ============================================================
// FILE UPLOAD
// ============================================================
$('#attach-btn').onclick = () => $('#file-input').click();
$('#file-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || !S.activeChat) return;
  e.target.value = '';
  if (file.size > 3 * 1024 * 1024) return toast('Max 3MB', 'error');

  const isImg = file.type.startsWith('image/');
  try {
    toast('Uploading...');
    const path = `chats/${S.activeChat}/${Date.now()}_${file.name}`;
    const ref = storageRef(storage, path);
    await uploadBytes(ref, file);
    const url = await getDownloadURL(ref);

    await addDoc(collection(db, 'chats', S.activeChat, 'messages'), {
      sender: S.user.uid,
      senderName: S.profile.displayName,
      senderPhoto: S.profile.photoURL || '',
      text: '',
      type: isImg ? 'image' : 'file',
      fileURL: url,
      fileName: file.name,
      fileSize: file.size,
      fileMime: file.type,
      reactions: {},
      readBy: [S.user.uid],
      starredBy: [],
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db, 'chats', S.activeChat), {
      lastMessage: {
        text: isImg ? '📷 Photo' : '📎 ' + file.name,
        senderName: S.profile.displayName,
        senderId: S.user.uid,
        createdAt: serverTimestamp(),
        type: isImg ? 'image' : 'file'
      },
      updatedAt: serverTimestamp()
    });
    toast('Sent', 'success');
  } catch (err) { console.error(err); toast('Upload failed', 'error'); }
};

// ============================================================
// NOTIFICATIONS
// ============================================================
function listenNotifications() {
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
    if (n.chatId) el.onclick = () => { openChat(n.chatId, {}); $('#notif-panel').classList.add('hidden'); };
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

// ============================================================
// NAV / INIT
// ============================================================
$$('.nav-btn').forEach(b => b.onclick = () => {
  router.go(b.dataset.view);
});

$('#topbar-avatar').onclick = () => router.go('profile');

function initContextClose() {
  document.addEventListener('click', (e) => {
    const m = $('#context-menu');
    if (!m.classList.contains('hidden') && !m.contains(e.target)) m.classList.add('hidden');
  });
}

// ============================================================
// BOOT
// ============================================================
async function boot() {
  initTheme();
  initBackButton();
  initContextClose();
  await initAuth();
}
boot();
