// Isolated synthetic browser profiles only. Never connects to the user's site.
import {chromium, firefox} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {buildBackupSchema} from '../schema.mjs';
import {createRegistry, exportBackup} from '../core.mjs';
import {createCourse} from '../../course-core.mjs';
import {freshScope} from '../../scope-kit.mjs';
const root = fileURLToPath(new URL('../../../',import.meta.url));
const out = new URL('./results/',import.meta.url);
await fs.mkdir(out,{recursive:true});
const server = createServer(async (req,res) => {
  try {
    const name = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    const local = path.resolve(root, '.'+name, name.endsWith('/') ? 'index.html' : '');
    if (!local.startsWith(root)) throw Error('path');
    res.setHeader('Content-Type',local.endsWith('.html')?'text/html; charset=utf-8':'application/octet-stream');
    res.end(await fs.readFile(local));
  } catch {res.statusCode=404;res.end('not found');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const base = `http://127.0.0.1:${server.address().port}`;
const schema = await buildBackupSchema(), registry = createRegistry(schema);
const c = createCourse(schema.courses['cpp-tools']);
c.update(c.state.current,{status:'reading',notes:'Синтетическая заметка: <img src=x onerror=alert(1)>',hours:2});
const initial = {'hands-on-cpp-tools-v1':JSON.stringify(c.export()),'roadmap-scope-cpp-tools-v1':JSON.stringify(freshScope('cpp-tools'))};
const testStamp = '2026-10-18T00:00:00.000Z';
const oldCpp = JSON.stringify({format:'cpp-roadmap-progress',version:1,entries:[{id:schema.cppIds[0],status:1,notes:'До импорта',updated_at:testStamp}]});
const cppKey = 'cpp-roadmap-offline-v1';
const read = page => page.evaluate(()=>Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)])));
const loadFile = (page,text) => page.locator('#backup-file').setInputFiles({name:'backup.json',mimeType:'application/json',buffer:Buffer.from(text)});
const results = [];
const browsers = [];
try {
  const chrome = await chromium.launch({headless:true,timeout:20000}); browsers.push(chrome);
  const source = await chrome.newContext({acceptDownloads:true});
  const page = await source.newPage();
  const errors = []; page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/maps/');
  await page.evaluate(value=>{for(const [k,v] of Object.entries(value))localStorage.setItem(k,v);},initial);
  await page.reload();
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#backup-export').click();
  const download = await downloadEvent;
  const backupPath = fileURLToPath(new URL('export.json',out));
  await download.saveAs(backupPath);
  const backupText = await fs.readFile(backupPath,'utf8');
  assert.equal(JSON.parse(backupText).entries.length,2);
  assert.deepEqual(await read(page),initial);
  results.push('Chromium: export downloads a portable JSON without changing progress');

  console.log('Chromium export passed; launching Firefox');
  const fox = await firefox.launch({headless:true,timeout:20000}); browsers.push(fox);
  const target = await fox.newContext({acceptDownloads:true});
  const dest = await target.newPage(); dest.on('pageerror',e=>errors.push(e.message));
  await dest.goto(base+'/maps/');
  await dest.evaluate(({key,raw})=>localStorage.setItem(key,raw),{key:cppKey,raw:oldCpp});
  await loadFile(dest,backupText);
  await dest.locator('#backup-preview').waitFor({state:'visible'});
  assert.equal(await dest.locator('#backup-restore').isDisabled(),true);
  assert.deepEqual(await read(dest),{[cppKey]:oldCpp});
  const previous = dest.waitForEvent('download');
  await dest.locator('#backup-before').click();
  const previousFile = await previous;
  const previousPath = fileURLToPath(new URL('before.json',out));
  await previousFile.saveAs(previousPath);
  assert.equal(JSON.parse(await fs.readFile(previousPath,'utf8')).entries[0].value,oldCpp);
  dest.once('dialog',d=>d.dismiss());
  await dest.locator('#backup-restore').click();
  assert.deepEqual(await read(dest),{[cppKey]:oldCpp});
  dest.once('dialog',d=>d.accept());
  await dest.locator('#backup-restore').click();
  await dest.getByText('Восстановлено разделов: 2.',{exact:false}).waitFor();
  assert.deepEqual(await read(dest),{[cppKey]:oldCpp,...initial});
  results.push('Chromium → Firefox: preview, backup of destination, cancel, confirm, partial restore');

  await dest.goto(base+'/cpp-tools/');
  assert.equal((await read(dest))['hands-on-cpp-tools-v1'],initial['hands-on-cpp-tools-v1']);
  assert.ok((await dest.textContent('body')).includes('Инструменты'));
  const editor = dest;
  const hub = await target.newPage();
  await hub.goto(base+'/maps/');
  const changed = JSON.parse(initial['hands-on-cpp-tools-v1']);
  changed.lessons[changed.current].notes='После восстановления';
  await loadFile(hub,JSON.stringify(changed));
  await hub.locator('#backup-preview').waitFor({state:'visible'});
  await hub.locator('#backup-save-first').uncheck();
  hub.once('dialog',d=>d.accept());
  await hub.locator('#backup-restore').click();
  await editor.getByRole('dialog',{name:'Прогресс изменён в другой вкладке'}).waitFor();
  await editor.getByRole('button',{name:'Перезагрузить страницу'}).click();
  assert.equal(JSON.parse((await read(editor))['hands-on-cpp-tools-v1']).lessons[changed.current].notes,'После восстановления');
  results.push('Old editor is blocked until reload after restore from another tab');

  const preserved = await read(hub);
  await loadFile(hub,'{"format":"cpp-roadmap-backup","version":99,"entries":[]}');
  await hub.getByText('Импорт отклонён:',{exact:false}).waitFor();
  assert.deepEqual(await read(hub),preserved);
  await loadFile(hub,'{broken');
  await hub.getByText('Импорт отклонён:',{exact:false}).waitFor();
  assert.deepEqual(await read(hub),preserved);
  results.push('Malformed and future files do not write localStorage');

  const legacy = JSON.parse(oldCpp); legacy.entries[0].notes='Старый отдельный экспорт';
  await loadFile(hub,JSON.stringify(legacy));
  await hub.locator('#backup-preview').waitFor({state:'visible'});
  await hub.locator('#backup-save-first').uncheck();
  hub.once('dialog',d=>d.accept());
  await hub.locator('#backup-restore').click();
  assert.equal(JSON.parse((await read(hub))[cppKey]).entries[0].notes,legacy.entries[0].notes);
  await hub.goto(base+'/'); // Existing C++ reader accepts restored legacy bytes.
  assert.equal(JSON.parse((await read(hub))[cppKey]).entries[0].notes,legacy.entries[0].notes);
  results.push('Legacy standalone C++ JSON imports and opens in original reader');

  await page.goto(base+'/maps/#backup');
  await page.setViewportSize({width:1280,height:1000});
  await page.locator('#backup').screenshot({path:fileURLToPath(new URL('backup-desktop.png',out))});
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);
  await page.locator('#backup').screenshot({path:fileURLToPath(new URL('backup-mobile.png',out))});
  results.push('Desktop and mobile layout captured; no horizontal overflow');
  assert.deepEqual(errors,[]);
  await fs.writeFile(new URL('report.json',out),JSON.stringify({status:'passed',results},null,2));
  console.log(JSON.stringify({status:'passed',results},null,2));
} finally {
  await Promise.all(browsers.map(b=>b.close()));
  await new Promise(r=>server.close(r));
}
