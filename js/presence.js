/* ============================================================
   Online/offline presence: 30s heartbeat + visibility/unload
   hooks, plus the isOnline() helper used by chat/friend lists.
   ============================================================ */
import { doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { S } from './state.js';

export function startPresence() {
  const userRef = doc(db, 'users', S.user.uid);
  const beat = () => updateDoc(userRef, {
    online: true, lastSeen: serverTimestamp()
  }).catch(() => {});
  beat();
  S.presenceTimer = setInterval(beat, 30000);

  window.addEventListener('beforeunload', () => {
    updateDoc(userRef, { online: false, lastSeen: serverTimestamp() }).catch(() => {});
  });
  document.addEventListener('visibilitychange', () => {
    updateDoc(userRef, {
      online: !document.hidden,
      lastSeen: serverTimestamp()
    }).catch(() => {});
  });
}

export function stopPresence() {
  clearInterval(S.presenceTimer);
}

export function isOnline(profile) {
  if (!profile || !profile.lastSeen) return false;
  const t = profile.lastSeen.toDate ? profile.lastSeen.toDate() : new Date(profile.lastSeen);
  return (Date.now() - t.getTime()) < 70000;
}
