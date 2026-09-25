/* ============================================================
   User profile: load/subscribe own profile, user cache lookups,
   Profile view rendering, and all the Profile-view button
   handlers (edit, avatar upload, blocked list, settings,
   logout, delete account).
   ============================================================ */
import {
  doc, getDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { updateProfile as fbUpdateProfile, signOut, deleteUser } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth, db } from './firebase.js';
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { avatarUrl, escapeHtml } from './utils.js';
import { toast, showModal, confirmDialog } from './ui.js';
import { compressImage, IMAGE_MAX } from './files.js';
import { unblockUser } from './friends.js';

// ===== Load / cache =====
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

// ===== VIEW: PROFILE =====
export function renderProfile() {
  if (!S.profile) return;
  $('#profile-avatar').src = avatarUrl(S.profile);
  $('#profile-name').textContent = S.profile.displayName;
  $('#profile-username').textContent = '@' + (S.profile.username || '');
  $('#profile-bio').textContent = S.profile.bio || 'No bio yet';
  $('#profile-stats').innerHTML = `
    <div class="stat-item"><div class="stat-value">${(S.profile.friends || []).length}</div><div class="stat-label">Friends</div></div>
    <div class="stat-item"><div class="stat-value">${S.chats.length}</div><div class="stat-label">Chats</div></div>
    <div class="stat-item"><div class="stat-value">${(S.profile.blocked || []).length}</div><div class="stat-label">Blocked</div></div>
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
    S.profile.displayName = name;
    S.profile.bio = bio;
    renderProfile();
    toast('Profile updated ✅', 'success');
  }, 'Save');
};

// Avatar upload — base64, no Storage
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
