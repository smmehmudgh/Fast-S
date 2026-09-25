/* ============================================================
   Bundles every Firestore listener that should start on login
   and stop on logout. Kept as its own tiny module so auth.js
   doesn't need to import chats/friends/notifications directly
   (which would risk pulling in the whole app graph too early).
   ============================================================ */
import { S } from './state.js';
import { startPresence, stopPresence } from './presence.js';
import { listenChats } from './chats.js';
import { listenFriendRequests } from './friends.js';
import { listenNotifications } from './notifications.js';

export function startAllListeners() {
  startPresence();
  listenChats();
  listenFriendRequests();
  listenNotifications();
}

export function stopAllListeners() {
  stopPresence();
  [S.unsubChats, S.unsubMsgs, S.unsubTyping, S.unsubProfile, S.unsubNotifs, S.unsubRequests]
    .forEach(u => u && u());
  S.unsubChats = S.unsubMsgs = S.unsubTyping = S.unsubProfile = S.unsubNotifs = S.unsubRequests = null;
}
