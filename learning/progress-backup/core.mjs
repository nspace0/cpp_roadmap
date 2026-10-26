import {MAPS, storageKey} from '../catalog.mjs';
import {createCourse} from '../course-core.mjs';
import {validateScope} from '../scope-kit.mjs';
import {createBuildProgress} from '../radio-build/core.mjs';
import nmsCore from '../nms/core.js';

export const FORMAT = 'cpp-roadmap-backup';
export const VERSION = 1;
export const MAX_BYTES = 32 * 1024 * 1024;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const bytes = x => new TextEncoder().encode(x).length;

// Check even unrecognised nested fields before invoking the existing validators.
function safeJSON(raw) {
  if (typeof raw !== 'string' || bytes(raw) > MAX_BYTES) throw Error('Запись слишком велика или не является текстом JSON.');
  const value = JSON.parse(raw);
  function visit(x, depth) {
    if (depth > 40) throw Error('Слишком большая вложенность данных.');
    if (!x || typeof x !== 'object') return;
    for (const key of Object.keys(x)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('Недопустимое имя поля: ' + key);
      visit(x[key], depth + 1);
    }
  }
  visit(value, 0);
  return value;
}
function validateEntries(value, format, ids, timestamp, maxStatus, limit) {
  if (!object(value) || value.format !== format || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > limit) throw Error('Неверный формат прогресса или версия.');
  const known = new Set(ids), seen = new Set();
  for (const e of value.entries) {
    if (!object(e) || !known.has(e.id) || seen.has(e.id) || !Number.isInteger(e.status) || e.status < 0 || e.status > maxStatus || typeof e.notes !== 'string' || e.notes.length > 12000 || typeof e[timestamp] !== 'string' || !Number.isFinite(Date.parse(e[timestamp]))) throw Error('Неизвестная тема или повреждённая запись.');
    seen.add(e.id);
  }
}
export function createRegistry(schema) {
  const registry = new Map();
  for (const map of MAPS) {
    const validate = map.id === 'cpp'
      ? v => validateEntries(v, 'cpp-roadmap-progress', schema.cppIds, 'updated_at', 2, 1500)
      : map.id === 'nms' ? nmsCore.createEngine(schema.nms).validate
      : createCourse(schema.courses[map.id]).validate;
    registry.set(storageKey(map.id), {label:map.title, validate});
    registry.set('roadmap-scope-' + map.id + '-v1', {label:map.title + ' · пробелы', validate:v => validateScope(v, map.id, schema.scopes[map.id])});
  }
  registry.set('cpp-interview-progress-v1', {label:'Карточки собеседования', validate:v => validateEntries(v, 'cpp-interview-progress', schema.interviewIds, 'updatedAt', 3, schema.interviewIds.length)});
  registry.set('radio-build-progress-v1', {label:'Сборка радиотелескопа', validate:createBuildProgress(schema.radio).validate});
  return registry;
}
export function capture(storage, registry) {
  return [...registry.keys()].map(key => ({key, value:storage.getItem(key)}));
}
export function exportBackup(storage, registry, now = new Date()) {
  const entries = capture(storage, registry).filter(e => e.value !== null);
  const archive = {format:FORMAT, version:VERSION, exportedAt:now.toISOString(), entries};
  const text = JSON.stringify(archive, null, 2);
  if (bytes(text) > MAX_BYTES) throw Error('Резервная копия превышает 32 МиБ. Используй отдельные экспорты карт.');
  const warnings = [];
  for (const e of entries) {
    try { registry.get(e.key).validate(safeJSON(e.value)); }
    catch (err) { warnings.push(registry.get(e.key).label + ': ' + err.message); }
  }
  // Preserve damaged data too, for manual recovery. Import still rejects it.
  return {text, archive, warnings};
}
function legacyKey(value) {
  if (value.format === 'cpp-roadmap-progress') return 'cpp-roadmap-offline-v1';
  if (value.format === 'cpp-interview-progress') return 'cpp-interview-progress-v1';
  if (value.format === 'hands-on-roadmap') return 'hands-on-' + value.id + '-v1';
  if (value.format === 'roadmap-scope') return 'roadmap-scope-' + value.map + '-v1';
  if (value.format === 'radio-build') return 'radio-build-progress-v1';
  if (value.schemaVersion === 1 && value.roadmapId) return 'nms-development-roadmap-v1';
  throw Error('Неизвестный формат файла.');
}
export function parseBackup(text, registry) {
  if (typeof text !== 'string' || bytes(text) > MAX_BYTES) throw Error('Файл превышает 32 МиБ.');
  const value = safeJSON(text);
  if (!object(value)) throw Error('В файле нет объекта резервной копии.');
  let entries, legacy = false;
  if (value.format === FORMAT) {
    if (value.version !== VERSION) throw Error('Неподдерживаемая версия единого бэкапа. Открой новую версию сайта.');
    if (!Array.isArray(value.entries) || value.entries.length > registry.size) throw Error('Повреждён список разделов.');
    entries = value.entries;
  } else {
    legacy = true;
    entries = [{key:legacyKey(value), value:text}];
  }
  const seen = new Set();
  for (const e of entries) {
    if (!object(e) || typeof e.key !== 'string' || !registry.has(e.key)) throw Error('Неизвестный раздел. Обнови сайт; файл не изменён.');
    if (seen.has(e.key)) throw Error('Повторяющийся раздел: ' + e.key);
    seen.add(e.key);
    try { registry.get(e.key).validate(safeJSON(e.value)); }
    catch (err) { throw Error(registry.get(e.key).label + ': ' + err.message); }
  }
  return {entries, legacy};
}
const plans = new WeakMap();
export function prepareRestore(text, storage, registry) {
  const parsed = parseBackup(text, registry);
  const before = capture(storage, registry), values = new Map(before.map(e => [e.key, e.value]));
  const rows = parsed.entries.map(e => ({key:e.key, label:registry.get(e.key).label, action:values.get(e.key) === e.value ? 'unchanged' : values.get(e.key) === null ? 'add' : 'replace'}));
  const plan = Object.freeze({rows:Object.freeze(rows.map(Object.freeze)), omitted:registry.size - rows.length, legacy:parsed.legacy});
  plans.set(plan, {before, entries:parsed.entries.map(e => ({...e})), storage, registry});
  return plan;
}
export function applyRestore(plan, {confirmed = false} = {}) {
  if (!confirmed) throw Error('Восстановление требует явного подтверждения.');
  const state = plans.get(plan);
  if (!state) throw Error('Проверь файл заново перед восстановлением.');
  const {before, entries, storage, registry} = state;
  if (JSON.stringify(capture(storage, registry)) !== JSON.stringify(before)) throw Error('Прогресс изменился после проверки файла. Закрой другие вкладки и проверь файл заново.');
  plans.delete(plan);
  const old = new Map(before.map(e => [e.key, e.value]));
  const changed = entries.filter(e => old.get(e.key) !== e.value);
  const attempted = [];
  try {
    for (const e of changed) {
      attempted.push(e.key);
      storage.setItem(e.key, e.value);
      if (storage.getItem(e.key) !== e.value) throw Error('Браузер не подтвердил запись.');
    }
  } catch (err) {
    const failed = [];
    for (const key of attempted.reverse()) {
      try { old.get(key) === null ? storage.removeItem(key) : storage.setItem(key, old.get(key)); }
      catch { failed.push(key); }
    }
    const suffix = failed.length ? ' Откат неполный: ' + failed.join(', ') + '. Восстанови скачанную копию.' : ' Прежнее состояние восстановлено.';
    throw Error('Не удалось сохранить импорт: ' + err.message + suffix);
  }
  return changed.length;
}
