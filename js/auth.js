/* ============================================================
   AUTH — login / signup / Google sign-in / password reset /
   auth-state listener that flips Loader -> Auth -> Main screens.
   ============================================================ */
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword,
  GoogleAuthProvider, signInWithPopup, onAuthStateChanged,
  sendPasswordResetEmail, updateProfile as fbUpdateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import {
  doc, getDoc, writeBatch, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db } from './firebase.js';
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { showModal, toast, showLoader, showAuth, showMain } from './ui.js';
import { loadUserProfile } from './profile.js';
import { startAllListeners, stopAllListeners } from './listeners.js';

export async function initAuth() {
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
    if (username.length < 3) return showAuthError('Username must be at least 3 characters');
    if (pass.length < 6) return showAuthError('Password must be at least 6 characters');

    try {
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
      const uSnap = await getDoc(doc(db, 'users', cred.user.uid));
      if (!uSnap.exists()) {
        const base = (cred.user.email?.split('@')[0] || 'user').toLowerCase().replace(/[^a-z0-9_]/g, '');
        let username = base || 'user';
        let i = 1;
        while ((await getDoc(doc(db, 'usernames', username))).exists()) {
          username = base + (i++);
        }
        await createUserDoc(cred.user, cred.user.displayName || username, username);
      }
    } catch (err) { showAuthError(authErrorMsg(err)); }
  };

  $('#forgot-link').onclick = (e) => {
    e.preventDefault();
    showModal('Reset Password',
      `<input type="email" id="reset-email" placeholder="Your email">`,
      async () => {
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
      showLoader(false);
      showAuth(false);
      showMain(true);
      startAllListeners();
    } else {
      S.user = null;
      S.profile = null;
      stopAllListeners();
      showLoader(false);
      showMain(false);
      showAuth(true);
    }
  });
}

export function authErrorMsg(err) {
  const m = {
    'auth/invalid-email': 'Invalid email',
    'auth/user-not-found': 'User not found',
    'auth/wrong-password': 'Wrong password',
    'auth/email-already-in-use': 'Email already in use',
    'auth/weak-password': 'Weak password (6+ characters)',
    'auth/popup-closed-by-user': 'Sign-in cancelled',
    'auth/invalid-credential': 'Invalid email or password',
    'auth/network-request-failed': 'Network error — check internet'
  };
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
