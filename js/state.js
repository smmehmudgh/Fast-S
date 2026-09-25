/* ============================================================
   Central app state — shared, mutable, imported everywhere.
   Because this is a single object (not primitives), other
   modules can do `S.user = x` and every importer sees the change.

   Phase 3.1 updates (Group system):
   1. viewingGroup / viewingGroupData — track which group's info
      page we're viewing (null = not viewing a group info page).
   2. viewingInvite / viewingInviteData — track which pending
      invite is being previewed (group-preview view).
   3. groupInvites — list of pending invitations for the current
      user (mirrors chats where `invited` array-contains my uid).
   4. unsubGroupInvites — unsubscribe for the invite listener.
   5. selectedGroupMembers — temporary selection state used by
      the group-create / add-member multi-pick UI.
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

  // ---- Group system ----
  viewingGroup: null,       // chatId of group being viewed (group-info)
  viewingGroupData: null,   // cached chat object of that group
  viewingInvite: null,      // chatId of invite being previewed
  viewingInviteData: null,  // cached chat object of that invite
  groupInvites: [],         // [{ id, name, adminName, membersCount, ... }]
  selectedGroupMembers: [], // temp selection for group create / add-member

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
  unsubGroupInvites: null,   // NEW: invite listener
  unsubGroupMembers: null,   // NEW: group members live updates (group-info page)
  presenceTimer: null
};
