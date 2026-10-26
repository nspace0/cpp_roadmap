import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildBackupSchema} from './schema.mjs';
import {FORMAT, createRegistry, capture, exportBackup, prepareRestore, applyRestore, parseBackup, MAX_BYTES} from './core.mjs';
import {createCourse} from '../course-core.mjs';
import {freshScope} from '../scope-kit.mjs';
import {MAPS, storageKey} from '../catalog.mjs';
import nmsCore from '../nms/core.js';
import {createBuildProgress} from '../radio-build/core.mjs';

const schema = await buildBackupSchema(), registry = createRegistry(schema);
class Storage {
  constructor(entries = []) { this.data = new Map(entries); this.writes = 0; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.writes++; if (this.fail?.(key, this.writes)) throw Error('QuotaExceededError'); this.data.set(key, String(value)); }
  removeItem(key) { this.writes++; if (this.fail?.(key, this.writes)) throw Error('QuotaExceededError'); this.data.delete(key); }
}
const stamp = '2026-10-18T12:00:00.000Z';
const cpp = (notes='заметка', status=1) => ({format:'cpp-roadmap-progress',version:1,exportedAt:stamp,entries:[{id:schema.cppIds[0],status,notes,updated_at:stamp}]});
const cppKey = 'cpp-roadmap-offline-v1';
const legacy = value => JSON.stringify(value);
const archive = entries => JSON.stringify({format:FORMAT,version:1,exportedAt:stamp,entries});
const entry = (key, value) => ({key, value:JSON.stringify(value)});
function allStores() {
  const entries = [];
  for (const map of MAPS) {
    let value;
    if (map.id === 'cpp') value = cpp();
    else if (map.id === 'nms') {
      const engine = nmsCore.createEngine(schema.nms);
      engine.update(engine.tasks[0].id, {notes:'NMS заметка',status:'doing'});
      engine.updateBook(schema.nms.bookStudy.workshops[0].id, {status:'read',notes:'Книга'});
      value = engine.export();
    } else {
      const engine = createCourse(schema.courses[map.id]);
      engine.update(engine.state.current, {status:'reading',notes:'Теория',hours:1});
      value = engine.export();
    }
    entries.push([storageKey(map.id), JSON.stringify(value, null, 2)]);
    const scope = freshScope(map.id);
    scope.custom.push({id:'custom-note',title:'Мой пробел',why:'Нужен в проекте',priority:'later'});
    scope.entries['custom-note'] = {needed:true,verified:false,evidence:'Пока разбираю'};
    entries.push(['roadmap-scope-' + map.id + '-v1', JSON.stringify(scope)]);
  }
  entries.push(['cpp-interview-progress-v1', JSON.stringify({format:'cpp-interview-progress',version:1,entries:[{id:schema.interviewIds[0],status:1,notes:'Повторить',updatedAt:stamp}]})]);
  const radio = createBuildProgress(schema.radio);
  radio.update('steps', schema.radio.phases[0].id, {notes:'Мой стенд',checks:[0]});
  radio.update('purchases', schema.radio.bom[0].id, {owned:true,actual:0});
  entries.push(['radio-build-progress-v1', JSON.stringify(radio.export())]);
  return entries;
}

test('all 12 directions, 12 journals, interviews, NMS books and radio build round-trip byte-for-byte', () => {
  const source = new Storage(allStores()), original = capture(source, registry);
  source.data.set('unrelated-site-data', 'secret');
  source.data.set(cppKey+'-before-import', 'old');
  source.data.set('nms-development-roadmap-v1-theme', 'dark');
  const result = exportBackup(source, registry);
  assert.equal(result.archive.entries.length, 26);
  assert.deepEqual(result.warnings, []);
  assert.equal(source.writes, 0);
  assert.ok(!result.text.includes('secret'));
  const dest = new Storage([['unrelated-site-data','untouched']]);
  const plan = prepareRestore(result.text, dest, registry);
  assert.equal(dest.writes, 0);
  assert.equal(applyRestore(plan, {confirmed:true}), 26);
  assert.deepEqual(capture(dest, registry), original);
  assert.equal(dest.getItem('unrelated-site-data'), 'untouched');
});

test('no confirmation and cancelling preview never write; plans cannot be forged or reused', () => {
  const store = new Storage([[cppKey, legacy(cpp('old'))]]);
  const plan = prepareRestore(legacy(cpp('new')), store, registry);
  assert.throws(() => applyRestore(plan), /подтверждения/);
  assert.equal(store.writes, 0);
  assert.throws(() => applyRestore({...plan}, {confirmed:true}), /заново/);
  applyRestore(plan, {confirmed:true});
  assert.throws(() => applyRestore(plan, {confirmed:true}), /заново/);
});

test('partial archive preserves omitted stores and replaces only included sections', () => {
  const store = new Storage(allStores()), old = capture(store, registry);
  const plan = prepareRestore(archive([entry(cppKey, cpp('new'))]), store, registry);
  assert.equal(plan.omitted, 25);
  applyRestore(plan, {confirmed:true});
  for (const e of old) if (e.key !== cppKey) assert.equal(store.getItem(e.key), e.value);
  assert.equal(JSON.parse(store.getItem(cppKey)).entries[0].notes, 'new');
});

test('empty included section explicitly clears that section, empty archive changes nothing', () => {
  const store = new Storage([[cppKey, legacy(cpp())]]);
  const empty = {...cpp(),entries:[]};
  assert.equal(applyRestore(prepareRestore(legacy(empty), store, registry), {confirmed:true}), 1);
  assert.deepEqual(JSON.parse(store.getItem(cppKey)).entries, []);
  const count = store.writes;
  assert.equal(applyRestore(prepareRestore(archive([]), store, registry), {confirmed:true}), 0);
  assert.equal(store.writes, count);
});

test('all existing standalone JSON v1 formats import without rewriting legacy fields', () => {
  for (const [key, raw] of allStores()) {
    const store = new Storage();
    const plan = prepareRestore(raw, store, registry);
    assert.equal(plan.legacy, true);
    assert.equal(plan.rows[0].key, key);
    applyRestore(plan, {confirmed:true});
    assert.equal(store.getItem(key), raw);
  }
});

test('old NMS export predating books and optional fields remains valid', () => {
  const old = {schemaVersion:1,roadmapId:schema.nms.roadmapId,tasks:{}};
  const store = new Storage();
  applyRestore(prepareRestore(legacy(old), store, registry), {confirmed:true});
  assert.deepEqual(JSON.parse(store.getItem('nms-development-roadmap-v1')), old);
});

test('incomplete/malformed payload rejects the whole archive before any write', () => {
  const store = new Storage(allStores()), before = capture(store, registry);
  const good = entry(cppKey,cpp('incoming'));
  for (const broken of [null, [], {}, {format:'hands-on-roadmap',version:1,id:'math',lessons:{}}, {...cpp(),entries:[{id:schema.cppIds[0],status:2}]}]) {
    assert.throws(() => prepareRestore(archive([good,{key:'hands-on-math-v1',value:JSON.stringify(broken)}]), store, registry));
  }
  for (const text of ['{', 'null', '[1]', archive([{key:cppKey,value:null}])]) assert.throws(() => prepareRestore(text,store,registry));
  assert.deepEqual(capture(store,registry), before);
  assert.equal(store.writes, 0);
});

test('future and unsupported old versions, unknown IDs/keys and duplicate sections rejected', () => {
  const store = new Storage();
  for (const version of [0,2,'1']) assert.throws(() => prepareRestore(JSON.stringify({format:FORMAT,version,entries:[]}),store,registry), /версия/);
  assert.throws(() => prepareRestore(legacy({...cpp(),version:2}),store,registry));
  assert.throws(() => prepareRestore(archive([entry('hands-on-new-course-v1',{})]),store,registry));
  assert.throws(() => prepareRestore(archive([entry(cppKey,cpp()),entry(cppKey,cpp())]),store,registry), /Повторяющийся/);
  assert.throws(() => prepareRestore(legacy({...cpp(),entries:[{...cpp().entries[0],id:'future-topic'}]}),store,registry));
  assert.throws(() => prepareRestore(legacy({...cpp(),entries:[cpp().entries[0],cpp().entries[0]]}),store,registry));
  assert.equal(store.writes,0);
});

test('nested prototype payload, excessive nesting and size are rejected; plain notes remain inert strings', () => {
  const store = new Storage();
  const raw = legacy(cpp()).replace('"entries":', '"__proto__":{"polluted":true},"entries":');
  assert.throws(() => prepareRestore(raw,store,registry), /имя поля/);
  assert.throws(() => parseBackup(' '.repeat(MAX_BYTES+1),registry), /32 МиБ/);
  const deep = '['.repeat(45) + '0' + ']'.repeat(45);
  assert.throws(() => parseBackup(deep,registry), /вложенность/);
  const hostileNote = '<img src=x onerror=alert(1)>';
  applyRestore(prepareRestore(legacy(cpp(hostileNote)),store,registry), {confirmed:true});
  assert.equal(JSON.parse(store.getItem(cppKey)).entries[0].notes,hostileNote);
  assert.equal({}.polluted, undefined);
});

test('changed destination since preview is detected even for omitted sections', () => {
  const store = new Storage(allStores());
  const plan = prepareRestore(legacy(cpp('incoming')),store,registry);
  store.setItem('roadmap-scope-ros-v1','changed in another tab');
  const count = store.writes;
  assert.throws(() => applyRestore(plan,{confirmed:true}), /изменился/);
  assert.equal(store.writes,count);
});

test('write failure rolls back raw previous values and removes newly created keys', () => {
  const source = new Storage(allStores());
  const dest = new Storage([[cppKey,legacy(cpp('before'))]]);
  const before = capture(dest,registry);
  const plan = prepareRestore(exportBackup(source,registry).text,dest,registry);
  dest.fail = (_,n) => n === 10;
  assert.throws(() => applyRestore(plan,{confirmed:true}), /Прежнее состояние восстановлено/);
  assert.deepEqual(capture(dest,registry),before);
});

test('persistent storage failures report incomplete rollback rather than success', () => {
  const dest = new Storage(allStores());
  const plan = prepareRestore(archive([entry(cppKey,cpp('new')),entry('cpp-interview-progress-v1',{format:'cpp-interview-progress',version:1,entries:[]})]),dest,registry);
  dest.fail = (_,n) => n >= 2;
  assert.throws(() => applyRestore(plan,{confirmed:true}), /Откат неполный/);
});

test('unavailable storage fails visibly; corrupt existing progress can be exported for recovery without mutation', () => {
  const denied = {getItem(){throw Error('SecurityError');}};
  assert.throws(() => exportBackup(denied,registry), /SecurityError/);
  assert.throws(() => prepareRestore(legacy(cpp()),denied,registry), /SecurityError/);
  const damaged = new Storage([[cppKey,'{broken']]);
  const result = exportBackup(damaged,registry);
  assert.equal(result.archive.entries[0].value,'{broken');
  assert.equal(result.warnings.length,1);
  assert.throws(() => prepareRestore(result.text,damaged,registry));
  assert.equal(damaged.writes,0);
});

test('accepted status is validated by original course dependency and evidence rules', () => {
  const course = createCourse(schema.courses['cpp-tools']).export();
  course.lessons[course.current] = {status:'done',notes:'',evidence:'',checks:[],hours:0};
  assert.throws(() => parseBackup(legacy(course),registry), /критерии/);
});

test('published hub embeds current registry schema and backup controls', () => {
  const html = fs.readFileSync(new URL('../../maps/index.html',import.meta.url),'utf8');
  const data = JSON.parse(html.match(/<script id="hub-data" type="application\/json">([^]*?)<\/script>/)[1]);
  assert.deepEqual(data.backupSchema,schema);
  for (const id of ['backup','backup-export','backup-file','backup-preview','backup-before','backup-restore','backup-cancel','backup-notice']) assert.ok(html.includes(`id="${id}"`));
});
