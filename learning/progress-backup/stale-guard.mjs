import {MAPS, storageKey} from '../catalog.mjs';
// A restored store must not be overwritten by a still-open editor's old state.
export function guardStaleProgress(keys) {
  const watched = new Set(keys);
  let stale = false, dialog;
  const initial = new Map();
  try { for (const key of watched) initial.set(key, localStorage.getItem(key)); } catch { return; }
  function block() {
    if (stale) return;
    stale = true;
    dialog = document.createElement('dialog');
    dialog.setAttribute('aria-label', 'Прогресс изменён в другой вкладке');
    dialog.style.cssText = 'max-width:32rem;padding:2rem;border:1px solid #789;border-radius:12px;';
    const text = document.createElement('p');
    text.textContent = 'Прогресс изменён в другой вкладке. Сохрани отдельно незаписанный текст, затем перезагрузи страницу. Редактирование приостановлено, чтобы старое состояние не перезаписало восстановленные данные.';
    const button = document.createElement('button');
    button.textContent = 'Перезагрузить страницу';
    button.addEventListener('click', () => location.reload());
    dialog.append(text, button);
    dialog.addEventListener('cancel', e => e.preventDefault());
    document.body.append(dialog); dialog.showModal();
  }
  window.addEventListener('storage', event => {
    if (event.key === null || watched.has(event.key)) block();
  });
  // Freeze user-triggered saves in editors even if another dialog was already open.
  for (const type of ['click', 'input', 'change', 'submit', 'keydown']) document.addEventListener(type, event => {
    if (stale && !dialog.contains(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('pagehide', () => {
    if (stale) return;
    try { for (const key of watched) initial.set(key, localStorage.getItem(key)); } catch {}
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    try { for (const [key, value] of initial) if (localStorage.getItem(key) !== value) { block(); break; } } catch {}
  });
}
export function guardMapProgress(id) {
  if (!MAPS.some(m => m.id === id)) return;
  const keys = [storageKey(id), 'roadmap-scope-' + id + '-v1'];
  if (id === 'cpp') keys.push('cpp-interview-progress-v1');
  guardStaleProgress(keys);
}
