import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createBuildProgress,cableEstimate} from './core.mjs';
import {createCourse} from '../course-core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const data=JSON.parse(read('learning/radio-build/data.json'));
const course=JSON.parse(read('learning/data/radiotelescope.json'));
const page=read('radiotelescope/build/index.html');

test('Guide has complete stages, valid lesson/source references and all downloads',()=>{
 assert.equal(data.phases.length,9);assert.equal(data.bom.length,12);
 assert.equal(new Set(data.phases.map(x=>x.id)).size,9);
 assert.equal(new Set(data.bom.map(x=>x.id)).size,12);
 const lessons=new Set(course.lessons.map(x=>x.id));
 for(const p of data.phases){
  assert.ok(p.theory.length>=2&&p.steps.length>=4&&p.checks.length>=3,p.id);
  for(const id of p.lessons)assert.ok(lessons.has(id),id);
  for(const s of p.sources)assert.ok(data.sources[s]?.url.startsWith('https://'),s);
 }
 for(const b of data.bom){
  assert.ok(b.price.length===2&&b.price[0]>0&&b.price[1]>=b.price[0],b.id);
  for(const s of b.sources)assert.ok(data.sources[s],s);
 }
 for(const d of data.downloads)assert.ok(fs.statSync(path.join(root,'radiotelescope/build',d.url)).size>0,d.url);
 assert.ok(fs.statSync(path.join(root,'radiotelescope/build/kit.zip')).size>0);
 assert.deepEqual(createBuildProgress(data).budget().range,[29600,49400]);
});
test('Progress roundtrip preserves prices, zero values, notes and checks; invalid imports are atomic',()=>{
 const p=createBuildProgress(data);
 p.update('purchases','sdr',{owned:true,actual:0});
 p.update('purchases','lna',{actual:8123});
 p.update('steps','RB01',{notes:'Не измерял; <script>text</script>',checks:[0,1,1]});
 p.setReserve(1000);
 assert.equal(p.budget().actual,8123);assert.equal(p.budget().entered,2);
 assert.deepEqual(p.step('RB01').checks,[0,1]);
 const original=p.export();assert.deepEqual(createBuildProgress(data,original).export(),original);
 for(const corrupt of [
  s=>s.version=2,
  s=>s.purchases.missing={owned:true,actual:1},
  s=>s.purchases.sdr.actual=-1,
  s=>s.purchases.sdr.actual=NaN,
  s=>s.steps.RB01.checks=[999],
  s=>s.steps.RB01.notes='x'.repeat(12001),
  s=>s.reserve='0',
 ]){const bad=structuredClone(original);corrupt(bad);assert.throws(()=>p.import(bad));assert.deepEqual(p.export(),original);}
 assert.throws(()=>p.update('purchases','sdr',{actual:-1}));assert.deepEqual(p.export(),original);
 const detached=p.export();detached.steps.RB01.notes='changed';assert.deepEqual(p.export(),original);
});
test('20 m engineering estimate agrees with independent datasheet checkpoints',()=>{
 const c=cableEstimate();
 assert.ok(Math.abs(c.lossDb-6.29)<.01);assert.ok(Math.abs(c.loopOhm-.466)<1e-10);
 assert.ok(Math.abs(c.dropV-.05592)<1e-10);assert.ok(Math.abs(c.lnaV-4.44408)<1e-10);
 assert.ok(Math.abs(cableEstimate(20,1500).lossDb-6.48)<.02);
 assert.equal(cableEstimate(0).lossDb,0);
 for(const v of [-1,NaN,Infinity])assert.throws(()=>cableEstimate(v));
});
test('Standalone HTML has intact JSON, parseable JS, unique IDs and real local links',()=>{
 const json=page.match(/<script id="build-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
 assert.deepEqual(JSON.parse(json),data);
 const ids=[...page.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);assert.equal(ids.length,new Set(ids).size);
 for(const m of page.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(m[1]);
 for(const m of page.matchAll(/(?:href|src)="([^"]+)"/g)){
  const link=m[1];
  if(link.startsWith('#'))assert.ok(ids.includes(link.slice(1)),link);
  else if(!link.startsWith('https://'))assert.ok(fs.existsSync(path.join(root,'radiotelescope/build',link)),link);
 }
 assert.ok(!page.includes('__PROJECT_LINK__'));
 for(const file of ['radiotelescope/index.html','radio-software/index.html','maps/index.html']){
  assert.ok(read(file).includes('radiotelescope/build/')||read(file).includes('href="build/"'),file);
 }
});
test('Original 36 tasks retain criteria, dependencies and accepted progress compatibility',()=>{
 const old=JSON.parse(execFileSync('git',['show','816d870fcb8223a2098c1e7f7c7d18404ccf1b01:learning/data/radiotelescope.json'],{cwd:root,encoding:'utf8'}));
 const contract=d=>d.lessons.map(l=>({id:l.id,acceptance:l.acceptance,prerequisites:l.prerequisites}));
 assert.equal(course.lessons.length,36);assert.deepEqual(contract(course),contract(old));
 const e=createCourse(old),first=old.lessons.find(l=>!l.prerequisites.length);
 e.update(first.id,{checks:first.acceptance.map((_,i)=>i),evidence:'Synthetic compatibility fixture, not user progress.',notes:'Saved note',hours:2,status:'done'});
 assert.deepEqual(createCourse(course,e.export()).export(),e.export());
});
