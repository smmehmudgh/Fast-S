/* ============================================================
   Central app state — shared, mutable, imported everywhere.
   Because this is a single object (not primitives), other
   modules can do `S.user = x` and every importer sees the change.
   ============================================================ */
export const S = {
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
  currentViewOpts: {},
  replyTo: null,
  ctxTarget: null,
  userCache: {}
};
