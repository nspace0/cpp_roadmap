import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createCourse} from './course-core.mjs';
import {freshScope,validateScope} from './scope-kit.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.dirname(root);
const json=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
for(const name of ['ros','electronics']){
 const data=json('data/'+name+'.json'),audit=json('data/'+name+'-scope.json');
 test(name+': every lesson has theory, measurable practice, boundaries and valid sources',()=>{
  const ids=new Set(data.lessons.map(l=>l.id));assert.equal(ids.size,data.lessons.length);assert.ok(ids.size>=36);
  const visits=new Set(),stack=new Set(),byId=Object.fromEntries(data.lessons.map(l=>[l.id,l]));
  function visit(id){assert.ok(ids.has(id),'Missing prerequisite '+id);assert.ok(!stack.has(id),'Cyclic prerequisites '+id);if(visits.has(id))return;stack.add(id);byId[id].prerequisites.forEach(visit);stack.delete(id);visits.add(id);}
  for(const l of data.lessons){visit(l.id);assert.ok(l.theory.length>=2,l.id+' theory paragraphs');assert.ok(l.theory.join(' ').split(/\s+/).length>=80,l.id+' theory too thin');assert.ok(l.practice.length>=3);assert.ok(l.acceptance.length>=3);assert.ok(l.defense.length>=2);assert.ok(l.covered.length>=3);assert.ok(l.notCovered.length>=2);assert.ok(l.nextLevel.length>=1);assert.ok(l.example.code&&l.example.expected);assert.ok(l.sources.length);l.sources.forEach(k=>assert.ok(data.sources[k]?.url?.startsWith('https://'),l.id+' source '+k));[l.theoryHours,l.practiceHours].forEach(h=>assert.ok(h.length===2&&h[0]>=0&&h[1]>=h[0]));}
  const mapped=data.modules.flatMap(m=>m.lessonIds);assert.equal(mapped.length,ids.size);assert.deepEqual(new Set(mapped),ids);assert.deepEqual(new Set(Object.keys(audit.topics)),ids);assert.ok(audit.gaps.length>=10);
  for(const row of data.courseCrosswalk||[])row.lessonIds.forEach(id=>assert.ok(ids.has(id),'Crosswalk '+row.id+' -> '+id));
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
 for(const name of ['ros','electronics','development']){
  const html=fs.readFileSync(path.join(repo,name,'index.html'),'utf8');assert.ok(html.startsWith('<!doctype html>')||html.startsWith('<!DOCTYPE html>'));const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];assert.ok(scripts.length>=3);
  const shell=html.replace(/<script[^>]*>[\s\S]*?<\/script>/g,'').replace(/<style[^>]*>[\s\S]*?<\/style>/g,'');const elementIds=[...shell.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(elementIds).size,elementIds.length,'Duplicate static IDs in '+name);
  for(const [i,m] of scripts.entries()){if(m[1].includes('application/json'))JSON.parse(m[2]);else new vm.Script(m[2],{filename:name+'-'+i+'.js'});}
  for(const s of ['27 сентября ты сообщил','Visual Studio установлена','пользователь сообщил'])assert.ok(!html.includes(s));assert.ok(html.includes('Что ещё изучить'));
 }
});
