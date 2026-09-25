/* ============================================================
   Tiny DOM query helpers, used across the whole app.
   ============================================================ */
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
