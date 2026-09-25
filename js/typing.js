/* ============================================================
   Typing indicator: writes the local user's typing state to
   Firestore, and listens to other members' typing state for
   the active chat.
   ============================================================ */
import { doc, setDoc, onSnapshot, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $ } from './dom.js';
import { S } from './state.js';

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

export async function setTyping(val) {
  if (!S.activeChat) return;
  const ref = doc(db, 'users', S.user.uid, 'typing', S.activeChat);
  await setDoc(ref, {
    typing: val,
    at: serverTimestamp(),
    name: S.profile.displayName
  }).catch(() => {});
}

export async function stopTyping() {
  if (!typingActive) return;
  typingActive = false;
  if (S.activeChat) await setTyping(false);
}

export function subscribeTyping(chatId) {
  if (S.unsubTyping) S.unsubTyping();
  const members = S.activeChatData?.members || [];
  const others = members.filter(u => u !== S.user.uid);
  if (others.length === 0) return;

  const typingMap = {};
  const unsubs = others.map(uid => onSnapshot(
    doc(db, 'users', uid, 'typing', chatId),
    (d) => {
      if (d.exists() && d.data().typing) {
        const t = d.data().at?.toDate?.()?.getTime() || 0;
        if (Date.now() - t < 8000) typingMap[uid] = d.data().name || 'Someone';
        else delete typingMap[uid];
      } else {
        delete typingMap[uid];
      }
      const names = Object.values(typingMap);
      const el = $('#typing-indicator');
      if (names.length === 0) el.classList.add('hidden');
      else {
        el.classList.remove('hidden');
        el.textContent = names.join(', ') + ' typing...';
      }
    }
  ));
  S.unsubTyping = () => unsubs.forEach(u => u());
}
