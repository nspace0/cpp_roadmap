import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createCourse} from './course-core.mjs';
import {freshScope,validateScope} from './scope-kit.mjs';
import {MAPS,COURSES,storageKey} from './catalog.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.dirname(root);
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
for(const {id:name,prefix} of COURSES){
 const data=json('data/'+name+'.json'),audit=json('data/'+name+'-scope.json');
 test(name+': every lesson has theory, measurable practice, boundaries and valid sources',()=>{
  assert.equal(data.id,name);assert.ok(data.title&&data.modules.length&&Object.keys(data.sources).length);
  const ids=new Set(data.lessons.map(l=>l.id));assert.equal(ids.size,data.lessons.length);assert.ok(ids.size>=36);
  const visits=new Set(),stack=new Set(),byId=Object.fromEntries(data.lessons.map(l=>[l.id,l]));
  function visit(id){assert.ok(ids.has(id),'Missing prerequisite '+id);assert.ok(!stack.has(id),'Cyclic prerequisites '+id);if(visits.has(id))return;stack.add(id);byId[id].prerequisites.forEach(visit);stack.delete(id);visits.add(id);}
  for(const l of data.lessons){
   visit(l.id);assert.match(l.id,new RegExp('^'+prefix+'\\d{2}\\.\\d+$'));assert.ok(['core','extension','specialization'].includes(l.priority),l.id+' priority');
   assert.ok(l.theory.length>=2,l.id+' theory paragraphs');assert.ok(l.theory.join(' ').split(/\s+/).length>=80,l.id+' theory too thin');assert.ok(l.practice.length>=3);assert.ok(l.acceptance.length>=3);assert.ok(l.defense.length>=2);assert.ok(l.covered.length>=3);assert.ok(l.notCovered.length>=2);assert.ok(l.nextLevel.length>=1);assert.ok(l.example.code&&l.example.expected);assert.ok(l.sources.length);l.sources.forEach(k=>assert.ok(data.sources[k]?.url?.startsWith('https://'),l.id+' source '+k));[l.theoryHours,l.practiceHours].forEach(h=>assert.ok(h.length===2&&h[0]>=0&&h[1]>=h[0]));
   if(l.priority==='core')for(const p of l.prerequisites)assert.equal(byId[p].priority,'core',l.id+' core depends on optional '+p);
   for(const next of l.nextLevel){const target=/^([A-Z]+\d{2}\.\d+)/.exec(next)?.[1];if(target)assert.ok(ids.has(target),l.id+' next '+target);}
   for(const c of l.connections||[]){assert.ok(MAPS.some(m=>m.id===c.map),l.id+' map '+c.map);assert.ok(['before','alongside','next'].includes(c.relation));assert.ok(c.topic&&c.why);if(c.lesson){const target=json('data/'+c.map+'.json');assert.ok(target.lessons.some(x=>x.id===c.lesson),l.id+' cross-map lesson '+c.lesson);}}
  }
  const mapped=data.modules.flatMap(m=>m.lessonIds);assert.equal(mapped.length,ids.size);assert.deepEqual(new Set(mapped),ids);assert.deepEqual(new Set(Object.keys(audit.topics)),ids);assert.ok(audit.gaps.length>=10);
  for(const m of data.modules)for(const id of m.lessonIds)assert.equal(byId[id].module,m.id,id+' module ownership');
  for(const row of data.courseCrosswalk||[])row.lessonIds.forEach(id=>assert.ok(ids.has(id),'Crosswalk '+row.id+' -> '+id));
  assert.equal(new Set(data.gaps.map(g=>g.id)).size,data.gaps.length);
  for(const g of data.gaps){assert.ok(g.title&&g.why&&g.proof.length,g.id+' gap criteria');for(const id of g.entryAfter)assert.ok(ids.has(id),g.id+' entry '+id);for(const s of g.sources)assert.ok(data.sources[s]?.url?.startsWith('https://'),g.id+' source '+s);}
  const e=createCourse(data);assert.equal(e.stats().done,0);for(const id of visits){const l=byId[id];e.update(id,{status:'done',checks:l.acceptance.map((_,i)=>i),evidence:'Validation fixture: all prerequisite results reviewed.'});}assert.equal(e.stats().done,data.lessons.length);
 });
 test(name+': acceptance needs evidence, criteria and prerequisites; rejected updates are atomic',()=>{
  const e=createCourse(data),first=data.lessons.find(l=>!l.prerequisites.length);assert.ok(first);const before=e.export();assert.throws(()=>e.update(first.id,{status:'done'}));assert.deepEqual(e.export(),before);
  e.update(first.id,{checks:first.acceptance.map((_,i)=>i),evidence:'Independent test on changed inputs; reviewed results.'});e.update(first.id,{status:'done'});assert.equal(e.stats().done,1);
  const pending=data.lessons.find(l=>l.prerequisites.some(id=>id!==first.id));if(pending){assert.throws(()=>e.update(pending.id,{status:'done',checks:pending.acceptance.map((_,i)=>i),evidence:'has evidence'}));}
  const approved=e.export();assert.throws(()=>e.update(first.id,{checks:[]}));assert.deepEqual(e.export(),approved);
 });
 test(name+': notes, time and plan survive import; wrong-roadmap and malformed imports preserve state',()=>{
  const e=createCourse(data),id=data.lessons[0].id;e.update(id,{status:'practice',notes:'Измерил: 3,3 В. <script>not executable</script>',hours:2.25});e.edit({planned:data.lessons.slice(0,3).map(l=>l.id),hoursPerWeek:12});const copy=createCourse(data,e.export());assert.deepEqual(copy.export(),e.export());const before=copy.export();const bad=e.export();bad.id='other-map';assert.throws(()=>copy.import(bad));assert.deepEqual(copy.export(),before);const corrupt=e.export();corrupt.lessons['__invalid__']={status:'done'};assert.throws(()=>copy.import(corrupt));assert.deepEqual(copy.export(),before);
 });
 test(name+': gap imports distinguish selected goals from proven practice',()=>{
  const initial=freshScope(name),id=audit.gaps[0].id;initial.entries[id]={needed:true,verified:false,evidence:''};assert.deepEqual(validateScope(initial,name,audit.gaps),initial);initial.entries[id].verified=true;assert.throws(()=>validateScope(initial,name,audit.gaps));initial.entries[id].evidence='Report with tested operating limits';assert.equal(validateScope(initial,name,audit.gaps).entries[id].verified,true);const wrong=structuredClone(initial);wrong.map='wrong';assert.throws(()=>validateScope(wrong,name,audit.gaps));const custom=structuredClone(initial);custom.custom.push({id:'custom-fieldbus',title:'Промышленная шина',why:'Потребовалась в проекте',priority:'specialist'});custom.entries['custom-fieldbus']={needed:true,verified:false,evidence:''};assert.equal(validateScope(custom,name,audit.gaps).custom.length,1);
 });
}
test('Existing C++ and NMS: every original topic retains identity and gets concrete boundaries',()=>{
 const cpp=JSON.parse(fs.readFileSync(path.join(repo,'source/data/roadmap.json'))),old=JSON.parse(fs.readFileSync(path.join(repo,'source/data/lessons.json'))),scope=JSON.parse(fs.readFileSync(path.join(repo,'source/data/scope.json')));
 const ids=cpp.modules.flatMap(m=>m.rows.map(t=>t.code));assert.equal(ids.length,381);assert.deepEqual(new Set(Object.keys(old)),new Set(ids));assert.deepEqual(new Set(Object.keys(scope.topics)),new Set(ids));
 const nms=json('nms/curriculum.json'),audit=json('data/nms-scope.json'),nids=nms.stages.flatMap(s=>s.tasks.map(t=>t.id));assert.equal(nids.length,112);assert.deepEqual(new Set(Object.keys(audit.topics)),new Set(nids));assert.deepEqual(nms.seed,{});
 for(const a of [scope,audit]){assert.ok(a.gaps.length>=20);for(const [id,t] of Object.entries(a.topics)){assert.ok(t.title&&t.covered.length>=1&&t.notCovered.length>=2&&t.next.length>=1,id);for(const n of t.next)if(n.target)assert.ok(a.topics[n.target],id+' next '+n.target);}for(const g of a.gaps){assert.ok(['core','later','specialist'].includes(g.priority));for(const id of g.coveredBy)assert.ok(a.topics[id],g.id+' gap '+id);}}
});
test('Published standalone pages have intact data, parseable scripts, unique IDs and no private progress seed',()=>{
 for(const name of [...COURSES.map(c=>c.id),'development','maps']){
  const html=fs.readFileSync(path.join(repo,name,'index.html'),'utf8');assert.ok(html.startsWith('<!doctype html>')||html.startsWith('<!DOCTYPE html>'));const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];assert.ok(scripts.length>=(name==='maps'?2:3));assert.ok(!/__(PROJECT_LINK|UPDATED_AT|TITLE|SHORT_TITLE|DESCRIPTION|BASELINE|COUNT|MODULES|CSS|DATA|SCOPE|APP|HUB_DATA|CARDS)__/.test(html),'Unfilled placeholder '+name);
  const shell=html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/<style[^>]*>[\s\S]*?<\/style>/g,'');const elementIds=[...shell.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(elementIds).size,elementIds.length,'Duplicate static IDs in '+name);
  for(const [i,m] of scripts.entries()){if(m[1].includes('application/json'))JSON.parse(m[2]);else new vm.Script(m[2],{filename:name+'-'+i+'.js'});}
  for(const s of ['27 сентября ты сообщил','Visual Studio установлена','пользователь сообщил'])assert.ok(!html.includes(s));assert.ok(html.includes('Что ещё изучить'));
 }
});
test('Shared catalog keeps old progress keys and connects every map to the hub',()=>{
 assert.equal(storageKey('cpp'),'cpp-roadmap-offline-v1');assert.equal(storageKey('nms'),'nms-development-roadmap-v1');assert.equal(storageKey('ros'),'hands-on-ros-v1');assert.equal(storageKey('electronics'),'hands-on-electronics-v1');
 assert.equal(MAPS.length,12);assert.equal(new Set(MAPS.map(m=>m.id)).size,12);assert.equal(new Set(MAPS.map(m=>m.path)).size,12);
 const html=fs.readFileSync(path.join(repo,'maps/index.html'),'utf8');
 const data=JSON.parse(/<script id="hub-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)[1]);
 for(const map of MAPS){assert.ok(fs.existsSync(path.join(repo,map.path,'index.html')));assert.ok(html.includes('id="progress-'+map.id+'"'));assert.ok(html.includes('href="../'+map.path+'"'));}
 for(const stage of data.journey.stages)for(const ref of stage.refs){const lesson=json('data/'+ref.map+'.json').lessons.find(l=>l.id===ref.lesson);assert.ok(lesson);assert.equal(lesson.title,ref.title);assert.ok(ref.path.endsWith('#lesson='+ref.lesson));}
 assert.ok(html.includes('id="journey-content"'));assert.equal(data.journey.stages.length,6);
});
