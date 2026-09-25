/* ============================================================
   File & image handling — Base64 only, no Firebase Storage.
   Exports the size-limit constants + helpers (used by profile.js
   for avatar upload too), and wires the chat's 📎 attach button.
   ============================================================ */
import { collection, addDoc, doc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $ } from './dom.js';
import { S } from './state.js';
import { toast } from './ui.js';

export const FILE_MAX = 500 * 1024;      // 500KB for non-image files
export const IMAGE_MAX = 1024 * 1024;    // 1MB source image (gets compressed)
export const DOC_MAX = 700 * 1024;       // Firestore doc size safety limit

export function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function compressImage(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width, height } = img;
        if (width > maxWidth) {
          height = Math.round((maxWidth / width) * height);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        // Try decreasing quality to fit under limit
        let q = quality;
        let dataUrl = canvas.toDataURL('image/jpeg', q);
        while (dataUrl.length > DOC_MAX && q > 0.3) {
          q -= 0.1;
          dataUrl = canvas.toDataURL('image/jpeg', q);
        }
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Image load failed'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

// ============================================================
// CHAT ATTACH BUTTON
// ============================================================
$('#attach-btn').onclick = () => $('#file-input').click();

$('#file-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || !S.activeChat) return;
  e.target.value = '';

  const isImg = file.type.startsWith('image/');
  let dataUrl = '';
  let finalSize = file.size;
  let finalName = file.name;
  let finalMime = file.type;

  try {
    if (isImg) {
      if (file.size > IMAGE_MAX) {
        return toast('Image too large (max 1MB)', 'error');
      }
      toast('Compressing...');
      dataUrl = await compressImage(file, 800, 0.7);
      finalMime = 'image/jpeg';
      finalName = file.name.replace(/\.[^.]+$/, '') + '.jpg';
      finalSize = Math.round((dataUrl.length - 22) * 0.75);
      if (dataUrl.length > DOC_MAX) {
        return toast('Image too large after compression', 'error');
      }
    } else {
      if (file.size > FILE_MAX) {
        return toast('File too large (max 500KB)', 'error');
      }
      toast('Reading file...');
      dataUrl = await fileToDataURL(file);
      if (dataUrl.length > DOC_MAX) {
        return toast('File too large after encoding', 'error');
      }
    }

    await addDoc(collection(db, 'chats', S.activeChat, 'messages'), {
      sender: S.user.uid,
      senderName: S.profile.displayName,
      senderPhoto: S.profile.photoURL || '',
      text: '',
      type: isImg ? 'image' : 'file',
      fileURL: dataUrl,
      fileName: finalName,
      fileSize: finalSize,
      fileMime: finalMime,
      reactions: {},
      readBy: [S.user.uid],
      starredBy: [],
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db, 'chats', S.activeChat), {
      lastMessage: {
        text: isImg ? '📷 Photo' : '📎 ' + finalName,
        senderName: S.profile.displayName,
        senderId: S.user.uid,
        createdAt: serverTimestamp(),
        type: isImg ? 'image' : 'file'
      },
      updatedAt: serverTimestamp()
    });

    // Notify others
    const otherUids = (S.activeChatData?.members || []).filter(u => u !== S.user.uid);
    for (const uid of otherUids) {
      await addDoc(collection(db, 'users', uid, 'notifications'), {
        icon: isImg ? '📷' : '📎',
        title: S.activeChatData.type === 'group'
          ? S.activeChatData.name
          : S.profile.displayName,
        text: isImg ? 'Sent a photo' : 'Sent ' + finalName,
        chatId: S.activeChat,
        read: false,
        createdAt: serverTimestamp()
      });
    }

    toast('Sent ✅', 'success');
  } catch (err) {
    console.error(err);
    toast('Upload failed — try a smaller file', 'error');
  }
};
