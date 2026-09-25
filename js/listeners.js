/* ============================================================
   Bundles every Firestore listener that should start on login
   and stop on logout.

   Phase 3.10 updates:
   1. Group invite listener (live list of pending invitations).
   2. Group members listener is tracked for cleanup on logout
      (though it's normally started/stopped by groupInfo.js).
   3. Cleaner reset of every unsubscriber on stop.
   ============================================================ */
import { S } from './state.js';
import { startPresence, stopPresence } from './presence.js';
import { listenChats } from './chats.js';
import { listenFriendRequests, listenSentRequests } from './friends.js';
import { listenNotifications } from './notifications.js';
import { listenGroupInvites, stopGroupInvites } from './groups.js';

// ============================================================
// START
// ============================================================
export function startAllListeners() {
  startPresence();
  listenChats();
  listenFriendRequests();
  listenSentRequests();
  listenNotifications();
  listenGroupInvites();       // Phase 3.10 — pending group invites
}

// ============================================================
// STOP
// ============================================================
export function stopAllListeners() {
  stopPresence();
  stopGroupInvites();

  [
    S.unsubChats,
    S.unsubMsgs,
    S.unsubTyping,
    S.unsubProfile,
    S.unsubNotifs,
    S.unsubRequests,
    S.unsubSentRequests,
    S.unsubGroupInvites,
    S.unsubGroupMembers
  ].forEach(u => {
    if (typeof u === 'function') {
      try { u(); } catch (e) { /* ignore */ }
    }
  });

  // Reset every unsubscriber
  S.unsubChats = null;
  S.unsubMsgs = null;
  S.unsubTyping = null;
  S.unsubProfile = null;
  S.unsubNotifs = null;
  S.unsubRequests = null;
  S.unsubSentRequests = null;
  S.unsubGroupInvites = null;
  S.unsubGroupMembers = null;

  // Reset transient view state
  S.viewingUser = null;
  S.viewingUserData = null;
  S.viewingGroup = null;
  S.viewingGroupData = null;
  S.viewingInvite = null;
  S.viewingInviteData = null;
  S.groupInvites = [];
  S.selectedGroupMembers = [];
}
