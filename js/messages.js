/* ============================================================
   Messages: subscribe/render the message list, send a message,
   and every per-message action (reply, edit, delete, forward,
   star, report, reactions) plus their context menu.
   ============================================================ */
import {
  collection, addDoc, doc, query, orderBy, limit, onSnapshot,
  updateDoc, writeBatch, arrayUnion, arrayRemove, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { db } from './firebase.js';
import { $, $$ } from './dom.js';
import { S } from './state.js';
import { escapeHtml, formatTime, formatBytes } from './utils.js';
import { toast, showModal, confirmDialog } from './ui.js';
import { getUser } from './profile.js';
import { stopTyping } from './typing.js';
import { chatTitleFor } from './chatView.js';

// ============================================================
// SUBSCRIBE / RENDER
// ============================================================
export function subscribeMessages(chatId) {
  if (S.unsubMsgs) S.unsubMsgs();
  const q = query(
    collection(db, 'chats', chatId, 'messages'),
    orderBy('createdAt', 'asc'),
    limit(200)
  );
  S.unsubMsgs = onSnapshot(q, (snap) => {
    const msgs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderMessages(msgs);
    scrollChatToBottom();
    markMessagesRead(chatId, msgs);
  });
}

async function markMessagesRead(chatId, msgs) {
  const toUpdate = msgs.filter(m =>
    m.sender !== S.user.uid && !(m.readBy || []).includes(S.user.uid)
  );
  if (toUpdate.length === 0) return;
  const batch = writeBatch(db);
  toUpdate.forEach(m => {
    batch.update(doc(db, 'chats', chatId, 'messages', m.id), {
      readBy: arrayUnion(S.user.uid)
    });
  });
  await batch.commit().catch(() => {});
}

function renderMessages(msgs) {
  const container = $('#chat-messages');
  container.innerHTML = '';
  const isGroup = S.activeChatData?.type === 'group';
  let lastSender = null;

  msgs.forEach((m) => {
    const out = m.sender === S.user.uid;
    const isNewSender = m.sender !== lastSender;
    lastSender = m.sender;

    const row = document.createElement('div');
    row.className = 'msg-row ' + (out ? 'out' : 'in') + (isNewSender ? ' group-start' : '');
    row.dataset.msgId = m.id;

    if (m.deleted) {
      row.innerHTML = `<div class="bubble" style="opacity:.6;font-style:italic">This message was deleted</div>`;
      container.appendChild(row);
      return;
    }

    const bubble = document.createElement('div');
    bubble.className = 'bubble';

    let inner = '';

    if (isGroup && !out && isNewSender) {
      inner += `<div class="msg-sender">${escapeHtml(m.senderName || 'User')}</div>`;
    }

    if (m.replyTo) {
      inner += `<div class="msg-reply-preview"><b>${escapeHtml(m.replyTo.senderName || 'User')}</b>${escapeHtml((m.replyTo.text || '').slice(0, 100))}</div>`;
    }

    if (m.type === 'image' && m.fileURL) {
      inner += `<img class="msg-image" src="${m.fileURL}" onclick="window.open('${m.fileURL}','_blank')" alt="photo">`;
    } else if (m.type === 'file' && m.fileURL) {
      inner += `<a class="msg-file" href="${m.fileURL}" download="${escapeHtml(m.fileName || 'file')}">
        <div class="msg-file-icon">📎</div>
        <div>
          <div class="msg-file-name">${escapeHtml(m.fileName || 'file')}</div>
          <div class="msg-file-size">${formatBytes(m.fileSize || 0)}</div>
        </div>
      </a>`;
    } else {
      inner += `<div>${escapeHtml(m.text || '')}</div>`;
    }

    inner += `<div class="msg-meta">
      ${m.editedAt ? '<span class="edited">edited</span>' : ''}
      <span>${formatTime(m.createdAt)}</span>
      ${out ? `<span>${(m.readBy || []).length > 1 ? '✓✓' : '✓'}</span>` : ''}
    </div>`;

    if (m.reactions && Object.keys(m.reactions).length) {
      let rx = '<div class="reactions">';
      for (const [emoji, users] of Object.entries(m.reactions)) {
        if (!users || !users.length) continue;
        const mine = users.includes(S.user.uid);
        rx += `<div class="reaction-chip" data-emoji="${emoji}" style="${mine ? 'outline:1px solid var(--accent)' : ''}">${emoji} ${users.length}</div>`;
      }
      rx += '</div>';
      inner += rx;
    }

    bubble.innerHTML = inner;
    row.appendChild(bubble);
    container.appendChild(row);

    // Context menu (right-click on desktop)
    row.oncontextmenu = (e) => { e.preventDefault(); showMessageMenu(e.clientX, e.clientY, m, row); };

    // Long-press on mobile
    let touchTimer;
    row.addEventListener('touchstart', (e) => {
      touchTimer = setTimeout(() => {
        const t = e.touches[0];
        showMessageMenu(t.clientX, t.clientY, m, row);
      }, 500);
    }, { passive: true });
    row.addEventListener('touchend', () => clearTimeout(touchTimer));
    row.addEventListener('touchmove', () => clearTimeout(touchTimer));

    row.querySelectorAll('.reaction-chip').forEach(chip => {
      chip.onclick = (e) => { e.stopPropagation(); toggleReaction(S.activeChat, m, chip.dataset.emoji); };
    });
  });
}

function scrollChatToBottom() {
  const c = $('#chat-messages');
  requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; });
}

// ============================================================
// MESSAGE CONTEXT MENU (reactions + actions)
// ============================================================
function showMessageMenu(x, y, m, row) {
  const isMine = m.sender === S.user.uid;
  const menu = $('#context-menu');
  const reactions = ['❤️', '😂', '👍', '😮', '😢', '🙏'];

  menu.innerHTML = `
    <div class="reaction-picker" style="position:static;margin-bottom:6px;justify-content:center">
      ${reactions.map(r => `<button data-r="${r}">${r}</button>`).join('')}
    </div>
    <div class="ctx-item" data-a="reply">↩️ Reply</div>
    ${isMine ? `<div class="ctx-item" data-a="edit">✏️ Edit</div>` : ''}
    <div class="ctx-item" data-a="forward">↪️ Forward</div>
    <div class="ctx-item" data-a="star">⭐ ${(m.starredBy || []).includes(S.user.uid) ? 'Unstar' : 'Star'}</div>
    ${isMine ? `<div class="ctx-divider"></div><div class="ctx-item danger" data-a="delete">🗑️ Delete</div>` : ''}
    ${!isMine ? `<div class="ctx-divider"></div><div class="ctx-item danger" data-a="report">🚩 Report</div>` : ''}
  `;
  menu.style.left = Math.min(x, window.innerWidth - 220) + 'px';
  menu.style.top = Math.min(y, window.innerHeight - 320) + 'px';
  menu.classList.remove('hidden');

  const hideCtx = () => menu.classList.add('hidden');

  menu.querySelectorAll('[data-r]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    toggleReaction(S.activeChat, m, b.dataset.r);
    hideCtx();
  });
  menu.querySelectorAll('[data-a]').forEach(b => b.onclick = (e) => {
    e.stopPropagation();
    const a = b.dataset.a;
    if (a === 'reply') setReply(m);
    if (a === 'edit') editMessage(m);
    if (a === 'delete') deleteMessage(m);
    if (a === 'forward') forwardMessage(m);
    if (a === 'star') starMessage(m);
    if (a === 'report') reportMessage(m);
    hideCtx();
  });

  setTimeout(() => {
    document.addEventListener('click', function c(e) {
      if (!menu.contains(e.target)) {
        hideCtx();
        document.removeEventListener('click', c);
      }
    });
  }, 10);
}

async function toggleReaction(chatId, msg, emoji) {
  const ref = doc(db, 'chats', chatId, 'messages', msg.id);
  const key = `reactions.${emoji}`;
  const has = (msg.reactions?.[emoji] || []).includes(S.user.uid);
  await updateDoc(ref, {
    [key]: has ? arrayRemove(S.user.uid) : arrayUnion(S.user.uid)
  });
}

function setReply(m) {
  S.replyTo = {
    msgId: m.id,
    text: m.text || (m.type === 'image' ? '📷 Photo' : '📎 File'),
    senderName: m.senderName
  };
  $('#reply-preview').classList.remove('hidden');
  $('#reply-preview').innerHTML = `
    <div class="reply-preview-body">
      <b>Replying to ${escapeHtml(m.senderName || 'User')}</b>
      <div class="reply-preview-text">${escapeHtml(S.replyTo.text)}</div>
    </div>
    <div class="reply-close" id="reply-close">✕</div>
  `;
  $('#reply-close').onclick = () => {
    S.replyTo = null;
    $('#reply-preview').classList.add('hidden');
  };
  $('#message-input').focus();
}

async function editMessage(m) {
  showModal('Edit Message',
    `<input type="text" id="edit-msg" value="${escapeHtml(m.text)}">`,
    async () => {
      const t = $('#edit-msg').value.trim();
      if (!t) return false;
      await updateDoc(doc(db, 'chats', S.activeChat, 'messages', m.id), {
        text: t, editedAt: serverTimestamp()
      });
      toast('Edited ✅', 'success');
    }, 'Save');
}

async function deleteMessage(m) {
  confirmDialog('Delete', 'Delete this message?', async () => {
    await updateDoc(doc(db, 'chats', S.activeChat, 'messages', m.id), {
      deleted: true, text: '', fileURL: '', type: 'text'
    });
    toast('Deleted');
  }, 'Delete');
}

async function forwardMessage(m) {
  if (S.chats.length === 0) return toast('No chats to forward to');
  showModal('Forward to', S.chats.map(c => `
    <div class="list-item" data-fwd="${c.id}" style="cursor:pointer">
      <div class="list-body"><div class="list-name">${escapeHtml(chatTitleFor(c))}</div></div>
    </div>
  `).join(''), null);
  $('#modal-ok').classList.add('hidden');
  setTimeout(() => {
    $$('#modal-body [data-fwd]').forEach(el => el.onclick = async () => {
      const cid = el.dataset.fwd;
      await addDoc(collection(db, 'chats', cid, 'messages'), {
        sender: S.user.uid,
        senderName: S.profile.displayName,
        senderPhoto: S.profile.photoURL || '',
        text: m.text || '',
        type: m.type || 'text',
        fileURL: m.fileURL || '',
        fileName: m.fileName || '',
        fileSize: m.fileSize || 0,
        fileMime: m.fileMime || '',
        reactions: {},
        readBy: [S.user.uid],
        starredBy: [],
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db, 'chats', cid), {
        lastMessage: {
          text: m.text || (m.type === 'image' ? '📷 Photo' : '📎 ' + (m.fileName || 'File')),
          senderName: S.profile.displayName,
          senderId: S.user.uid,
          createdAt: serverTimestamp(),
          type: m.type || 'text'
        },
        updatedAt: serverTimestamp()
      });
      toast('Forwarded ✅', 'success');
      $('#modal').classList.add('hidden');
      $('#modal-ok').classList.remove('hidden');
    });
  }, 30);
}

async function starMessage(m) {
  const ref = doc(db, 'chats', S.activeChat, 'messages', m.id);
  const has = (m.starredBy || []).includes(S.user.uid);
  await updateDoc(ref, {
    starredBy: has ? arrayRemove(S.user.uid) : arrayUnion(S.user.uid)
  });
  toast(has ? 'Unstarred' : 'Starred ✅', 'success');
}

async function reportMessage(m) {
  showModal('Report', `
    <select id="report-reason">
      <option>Spam</option>
      <option>Harassment</option>
      <option>Inappropriate content</option>
      <option>Other</option>
    </select>
  `, async () => {
    await addDoc(collection(db, 'reports'), {
      reporter: S.user.uid,
      reported: m.sender,
      chatId: S.activeChat,
      messageId: m.id,
      reason: $('#report-reason').value,
      createdAt: serverTimestamp()
    });
    toast('Report submitted ✅', 'success');
  }, 'Report');
}

// ============================================================
// SEND MESSAGE
// ============================================================
export async function sendMessage() {
  const input = $('#message-input');
  const text = input.value.trim();
  if (!text || !S.activeChat) return;
  input.value = '';
  await stopTyping();

  // Check if other user blocked me
  const otherUids = (S.activeChatData?.members || []).filter(u => u !== S.user.uid);
  for (const uid of otherUids) {
    const p = S.userCache[uid] || await getUser(uid);
    if (p && (p.blocked || []).includes(S.user.uid)) {
      return toast('Cannot send — you are blocked', 'error');
    }
  }

  const msg = {
    sender: S.user.uid,
    senderName: S.profile.displayName,
    senderPhoto: S.profile.photoURL || '',
    text,
    type: 'text',
    reactions: {},
    readBy: [S.user.uid],
    starredBy: [],
    createdAt: serverTimestamp()
  };
  if (S.replyTo) {
    msg.replyTo = S.replyTo;
    S.replyTo = null;
    $('#reply-preview').classList.add('hidden');
  }

  await addDoc(collection(db, 'chats', S.activeChat, 'messages'), msg);

  // Increment unread for others
  const unreadUpdates = {};
  otherUids.forEach(uid => { unreadUpdates[`unread.${uid}`] = 1; });

  await updateDoc(doc(db, 'chats', S.activeChat), {
    lastMessage: {
      text,
      senderName: S.profile.displayName,
      senderId: S.user.uid,
      createdAt: serverTimestamp(),
      type: 'text'
    },
    updatedAt: serverTimestamp()
  });

  // Notify others
  for (const uid of otherUids) {
    await addDoc(collection(db, 'users', uid, 'notifications'), {
      icon: '💬',
      title: S.activeChatData.type === 'group'
        ? S.activeChatData.name
        : S.profile.displayName,
      text: text.slice(0, 60),
      chatId: S.activeChat,
      read: false,
      createdAt: serverTimestamp()
    });
  }
}

$('#send-btn').onclick = sendMessage;
$('#message-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
});
