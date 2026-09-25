/* ============================================================
   Generic UI primitives: toast, modal, confirm dialog,
   loader/auth/main screen toggles. No Firebase / state logic here.
   ============================================================ */
import { $ } from './dom.js';
import { escapeHtml } from './utils.js';

export function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  $('#toast-container').appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

export function showModal(title, bodyHtml, onOk, okText = 'OK') {
  const modal = $('#modal');
  $('#modal-title').textContent = title;
  $('#modal-body').innerHTML = bodyHtml;
  $('#modal-ok').textContent = okText;
  $('#modal-ok').classList.remove('hidden');
  modal.classList.remove('hidden');
  const cleanup = () => {
    modal.classList.add('hidden');
    $('#modal-ok').onclick = null;
    $('#modal-cancel').onclick = null;
  };
  $('#modal-ok').onclick = () => { const r = onOk && onOk(); if (r !== false) cleanup(); };
  $('#modal-cancel').onclick = cleanup;
}

export function confirmDialog(title, msg, onYes, yesText = 'Yes') {
  showModal(title, `<p style="margin-bottom:8px">${escapeHtml(msg)}</p>`, onYes, yesText);
}

export function showLoader(show = true) { $('#loader').classList.toggle('hidden', !show); }
export function showAuth(show = true) { $('#auth-screen').classList.toggle('hidden', !show); }
export function showMain(show = true) { $('#main-screen').classList.toggle('hidden', !show); }
