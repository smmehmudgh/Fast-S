/* ============================================================
   Central app state — shared, mutable, imported everywhere.
   Because this is a single object (not primitives), other
   modules can do `S.user = x` and every importer sees the change.
   ============================================================ */
export const S = {
  // ---- Auth / own profile ----
  user: null,
  profile: null,

  // ---- Chat / messaging ----
  activeChat: null,
  activeChatData: null,
  chats: [],
  replyTo: null,
  typingTimer: null,

  // ---- Friends ----
  friends: [],
  requests: [],           // incoming friend requests (pending)
  sentRequests: [],       // outgoing friend requests (pending) — [{ id, to }]

  // ---- Profile viewing ----
  viewingUser: null,      // uid of user being viewed (null = own profile)
  viewingUserData: null,  // cached profile object of that user

  // ---- Notifications ----
  notifs: [],

  // ---- Router ----
  currentView: 'chats',
  currentViewOpts: {},

  // ---- Misc ----
  ctxTarget: null,
  userCache: {},

  // ---- Firestore unsubscribers ----
  unsubChats: null,
  unsubMsgs: null,
  unsubTyping: null,
  unsubProfile: null,
  unsubNotifs: null,
  unsubRequests: null,
  unsubSentRequests: null,
  presenceTimer: null
};
