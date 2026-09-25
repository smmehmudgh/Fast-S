/* ============================================================
   User profile — dual mode:
     • renderProfile()        → own profile (edit, settings, logout)
     • renderProfile(uid)     → other user's profile (message, add,
                                 sent, unfriend, block)

   Updates:
   1. renderProfile(uid) accepts an optional uid. When omitted or
      equal to own uid → own mode.
   2. Own profile shows: Edit / Blocked / Settings + Logout / Delete.
   3. Other profile shows: Message / Add Friend / Sent / Unfriend / Block.
   4. Avatar upload label is hidden for other profiles.
   5. All buttons are wired in one place.
   ============================================================ */
import {
  doc, getDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import {
  updateProfile as fbUpdateProfile, signOut, deleteUser
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth, db } from './firebase.js';
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { avatarUrl, escapeHtml } from './utils.js';
import { toast, showModal, confirmDialog } from './ui.js';
import { compressImage, IMAGE_MAX } from './files.js';
import { unblockUser, hasSentRequest, sendFriendRequest, unsendRequest } from './friends.js';
import { startDirectChat } from './chats.js';
import { router } from './router.js';

// ============================================================
// LOAD / CACHE OWN PROFILE
// ============================================================
export async function loadUserProfile() {
  const snap = await getDoc(doc(db, 'users', S.user.uid));
  if (snap.exists()) {
    S.profile = snap.data();
    S.userCache[S.user.uid] = S.profile;
    if (S.unsubProfile) S.unsubProfile();
    S.unsubProfile = onSnapshot(doc(db, 'users', S.user.uid), (d) => {
      if (d.exists()) {
        S.profile = d.data();
        S.userCache[S.user.uid] = S.profile;
        updateTopbarAvatar();
        // If viewing own profile, re-render live
        if (S.currentView === 'profile' && !S.viewingUser) {
          renderProfile();
        }
      }
    });
  }
  updateTopbarAvatar();
}

export function updateTopbarAvatar() {
  $('#topbar-avatar').src = avatarUrl(S.profile);
}

export async function getUser(uid) {
  if (S.userCache[uid]) return S.userCache[uid];
  const snap = await getDoc(doc(db, 'users', uid));
  if (snap.exists()) {
    const data = snap.data();
    S.userCache[uid] = data;
    return data;
  }
  return null;
}

// ============================================================
// RENDER PROFILE (dual mode)
// ============================================================
export async function renderProfile(uid) {
  const isSelf = !uid || uid === S.user.uid;

  // ---- Resolve profile data ----
  let profile;
  if (isSelf) {
    profile = S.profile;
    S.viewingUser = null;
    S.viewingUserData = null;
  } else {
    S.viewingUser = uid;
    profile = await getUser(uid);
    S.viewingUserData = profile;
    if (!profile) {
      toast('User not found', 'error');
      router.go('chats');
      return;
    }
  }

  if (!profile) return;

  // ---- Card ----
  $('#profile-avatar').src = avatarUrl(profile);
  $('#profile-name').textContent = profile.displayName || 'User';
  $('#profile-username').textContent = '@' + (profile.username || '');
  $('#profile-bio').textContent = profile.bio || (isSelf ? 'No bio yet' : 'No bio');

  // ---- Avatar upload label (self only) ----
  const uploadLabel = $('#avatar-upload-label');
  if (uploadLabel) {
    uploadLabel.classList.toggle('hidden', !isSelf);
  }

  // ---- Action groups ----
  const actionsSelf = $('#profile-actions-self');
  const actionsOther = $('#profile-actions-other');
  const selfFooter = $('#profile-self-footer');

  actionsSelf.classList.toggle('hidden', !isSelf);
  actionsOther.classList.toggle('hidden', isSelf);
  if (selfFooter) selfFooter.classList.toggle('hidden', !isSelf);

  // ---- Stats ----
  const friendCount = (profile.friends || []).length;
  const blockedCount = isSelf ? (profile.blocked || []).length : 0;

  // Chat count only meaningful for self
  const chatCount = isSelf ? S.chats.length : 0;

  $('#profile-stats').innerHTML = `
    <div class="stat-item">
      <div class="stat-value">${friendCount}</div>
      <div class="stat-label">Friends</div>
    </div>
    ${isSelf ? `
      <div class="stat-item">
        <div class="stat-value">${chatCount}</div>
        <div class="stat-label">Chats</div>
      </div>
      <div class="stat-item">
        <div class="stat-value">${blockedCount}</div>
        <div class="stat-label">Blocked</div>
      </div>
    ` : ''}
  `;

  // ---- Other-user actions state ----
  if (!isSelf) {
    const isFriend = (S.profile.friends || []).includes(uid);
    const isSent = hasSentRequest(uid);

    const btnMessage = $('#other-message-btn');
    const btnAdd = $('#other-add-btn');
    const btnSent = $('#other-sent-btn');
    const btnUnfriend = $('#other-unfriend-btn');
    const btnBlock = $('#other-block-btn');

    // Message button: only if friends
    btnMessage.classList.toggle('hidden', !isFriend);
    // Add button: only if not friends and not already sent
    btnAdd.classList.toggle('hidden', isFriend || isSent);
    // Sent button: only if request sent
    btnSent.classList.toggle('hidden', !isSent);
    // Unfriend: only if friends
    btnUnfriend.classList.toggle('hidden', !isFriend);
    // Block: always visible

    btnMessage.onclick = () => startDirectChat(uid);
    btnAdd.onclick = async () => {
      await sendFriendRequest(uid);
      // Re-render so buttons update
      setTimeout(() => renderProfile(uid), 300);
    };
    btnSent.onclick = () => {
      showModal(
        'Unsend Request',
        `<p>Cancel the friend request you sent to <b>${escapeHtml(profile.displayName)}</b>?</p>`,
        async () => {
          await unsendRequest(uid);
          setTimeout(() => renderProfile(uid), 300);
        },
        'Unsend'
      );
    };
    btnUnfriend.onclick = () => {
      confirmDialog('Unfriend',
        `Remove ${escapeHtml(profile.displayName)} from friends?`,
        async () => {
          await doUnfriend(uid);
          setTimeout(() => renderProfile(uid), 300);
        }, 'Unfriend');
    };
    btnBlock.onclick = () => {
      confirmDialog('Block User',
        `Block ${escapeHtml(profile.displayName)}? They won't be able to message you.`,
        async () => {
          await doBlock(uid);
          router.go('chats');
        }, 'Block');
    };
  }
}

// ============================================================
// OWN PROFILE — EDIT / BLOCKED / SETTINGS / LOGOUT / DELETE
// ============================================================
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
    S.profile.displayName = name;
    S.profile.bio = bio;
    renderProfile();
    toast('Profile updated ✅', 'success');
  }, 'Save');
};

// Avatar upload (self only, base64, no Storage)
$('#avatar-upload').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  e.target.value = '';

  if (!file.type.startsWith('image/')) {
    return toast('Only images allowed', 'error');
  }
  if (file.size > IMAGE_MAX) {
    return toast('Image too large (max 1MB)', 'error');
  }

  try {
    toast('Compressing...');
    const dataUrl = await compressImage(file, 300, 0.75);
    if (dataUrl.length > 900 * 1024) {
      return toast('Image too large after compression', 'error');
    }
    await updateDoc(doc(db, 'users', S.user.uid), { photoURL: dataUrl });
    await fbUpdateProfile(S.user, { photoURL: dataUrl });
    S.profile.photoURL = dataUrl;
    renderProfile();
    updateTopbarAvatar();
    toast('Photo updated ✅', 'success');
  } catch (err) {
    console.error(err);
    toast('Upload failed', 'error');
  }
};

$('#blocked-btn').onclick = async () => {
  const blocked = S.profile.blocked || [];
  if (blocked.length === 0) return toast('No blocked users');
  const profiles = (await Promise.all(blocked.map(getUser))).filter(Boolean);
  showModal('Blocked Users', profiles.map(p => `
    <div class="list-item" style="padding:8px">
      <div class="list-avatar" style="width:36px;height:36px"><img src="${avatarUrl(p)}"></div>
      <div class="list-body"><div class="list-name">${escapeHtml(p.displayName)}</div></div>
      <button class="mini-btn" data-uid="${p.uid}">Unblock</button>
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
    toast('Settings saved ✅', 'success');
  }, 'Save');
};

$('#logout-btn').onclick = () => {
  confirmDialog('Logout', 'Are you sure you want to logout?', async () => {
    if (S.user) {
      await updateDoc(doc(db, 'users', S.user.uid), {
        online: false, lastSeen: serverTimestamp()
      }).catch(() => {});
    }
    await signOut(auth);
  }, 'Logout');
};

$('#delete-account-btn').onclick = () => {
  confirmDialog('Delete Account',
    'This will permanently delete your account. Continue?',
    async () => {
      try {
        await deleteDoc(doc(db, 'usernames', S.profile.username)).catch(() => {});
        await deleteDoc(doc(db, 'users', S.user.uid));
        await deleteUser(S.user);
        toast('Account deleted ✅', 'success');
      } catch (err) {
        toast('Please re-login and try again', 'error');
      }
    }, 'Delete');
};

// ============================================================
// HELPERS — unfriend / block (used by other-profile view)
// ============================================================
async function doUnfriend(uid) {
  const { writeBatch, arrayRemove } = await import(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
  );
  const batch = writeBatch(db);
  batch.update(doc(db, 'users', S.user.uid), { friends: arrayRemove(uid) });
  batch.update(doc(db, 'users', uid), { friends: arrayRemove(S.user.uid) });
  await batch.commit();
  await loadUserProfile();
  toast('Unfriended');
}

async function doBlock(uid) {
  const { arrayUnion } = await import(
    "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js"
  );
  await updateDoc(doc(db, 'users', S.user.uid), { blocked: arrayUnion(uid) });
  await loadUserProfile();
  toast('User blocked', 'error');
}
