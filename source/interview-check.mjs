import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';

const root=path.dirname(fileURLToPath(import.meta.url));
const data=JSON.parse(fs.readFileSync(path.join(root,'data/interviews.json'),'utf8'));
const provenance=JSON.parse(fs.readFileSync(path.join(root,'data/interview-source.json'),'utf8'));
const roadmap=JSON.parse(fs.readFileSync(path.join(root,'data/roadmap.json'),'utf8'));
const topics=new Set(roadmap.modules.flatMap(m=>m.rows.map(t=>t.code)));
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cpp-interview-tests-'));
const require=createRequire(import.meta.url);
const entry=path.join(tmp,'entry.ts');
fs.writeFileSync(entry,`export * from ${JSON.stringify(path.join(root,'app/interview-progress.ts'))}; export * from ${JSON.stringify(path.join(root,'app/interview-data.ts'))}; export {portableHtml,validateSnapshot as validateRoadmapSnapshot} from ${JSON.stringify(path.join(root,'app/local-progress.ts'))}; export {default as InterviewBank} from ${JSON.stringify(path.join(root,'app/interview-bank.tsx'))}; export {createElement} from ${JSON.stringify(require.resolve('react'))}; export {renderToStaticMarkup} from ${JSON.stringify(require.resolve('react-dom/server'))};`);
buildSync({entryPoints:[entry],bundle:true,platform:'node',format:'cjs',outfile:path.join(tmp,'test.cjs'),tsconfig:path.join(root,'tsconfig.json'),logLevel:'silent'});
const lib=require(path.join(tmp,'test.cjs'));
process.on('exit',()=>fs.rmSync(tmp,{recursive:true,force:true}));
const originalByNumber=new Map(provenance.questions.map(q=>[q.number,q]));
const record=(id,status,notes='',updatedAt='2026-10-18T00:00:00Z')=>({id,status,notes,updatedAt});
const snapshot=entries=>({format:'cpp-interview-progress',version:1,exportedAt:'2026-10-18T00:00:00Z',entries});

test('All 349 source questions appear once, with exact wording and provenance',()=>{
 assert.equal(data.cards.length,120);assert.equal(new Set(data.cards.map(c=>c.id)).size,120);
 const seen=new Set();
 for(const c of data.cards)for(const v of c.variants){assert.ok(!seen.has(v.number));seen.add(v.number);const original=originalByNumber.get(v.number);assert.ok(original);assert.equal(v.question,original.question);assert.equal(v.sourceUrl,original.sourceUrl);assert.equal(c.id,original.studyId);assert.ok(v.answer.trim().length>25);}
 assert.equal(seen.size,349);assert.deepEqual([...seen].sort((a,b)=>a-b),Array.from({length:349},(_,i)=>i+1));
});
test('Every study has substantive answers, examples, follow-ups, practice and valid lesson links',()=>{
 for(const c of data.cards){
  assert.ok(c.shortAnswer.length>80,c.id);assert.ok(c.explanation.length>=2,c.id);assert.ok(c.explanation.every(s=>s.title&&s.paragraphs.length&&s.paragraphs.every(p=>p.length>20)),c.id);
  assert.ok(c.example.code.length>20&&c.example.expected.trim().length>0&&c.example.explanation.length,c.id);assert.ok(['run','compile','illustrative','text'].includes(c.example.kind));
  assert.ok(c.followUps.length>=3&&c.followUps.every(q=>q.question&&q.answer.length>30),c.id);assert.ok(c.pitfalls.length>=2,c.id);assert.ok(c.practice.task&&c.practice.criteria.length&&c.practice.solution.length>30,c.id);
  assert.ok(c.topicCodes.length>0&&c.topicCodes.every(id=>topics.has(id)),c.id);assert.ok(c.resources.length>0||c.example.kind==='text',c.id);for(const r of c.resources){const u=new URL(r.url);assert.equal(u.protocol,'https:');assert.ok(r.title&&r.focus);}
 }
});
test('Incorrect or ambiguous original premises have explicit clarification',()=>{
 for(const number of [65,105,115,183,203,213,266,289]){const c=data.cards.find(c=>c.variants.some(v=>v.number===number));assert.ok(c.clarification?.length>30,`${number}: ${c.id}`);}
});
test('Question search covers exact source wording and topic filtering',()=>{
 const found=lib.filterInterviews(data.cards,{}, {query:'stack and reaping'});assert.ok(found.some(c=>c.id==='IQ105'));
 const last=lib.filterInterviews(data.cards,{}, {query:'349'});assert.ok(last.some(c=>c.variants.some(v=>v.number===349)));
 for(const c of data.cards){const result=lib.filterInterviews(data.cards,{}, {topic:c.topicCodes[0],category:c.category});assert.ok(result.some(r=>r.id===c.id));}
 assert.equal(lib.filterInterviews(data.cards,{}, {query:'несуществующий_термин_123xyz'}).length,0);
 assert.equal(lib.filterInterviews(data.cards,{}, {status:'3'}).length,0);
 const id=data.cards[0].id;assert.deepEqual(lib.filterInterviews(data.cards,{[id]:record(id,3)}, {status:'3'}).map(c=>c.id),[id]);
});
test('Progress rejects foreign formats, unknown questions, duplicates, invalid status and dates',()=>{
 const id=data.cards[0].id;assert.equal(lib.validateInterviewSnapshot(snapshot([record(id,3)])).entries.length,1);
 const invalid=[{format:'cpp-roadmap-progress',version:1,entries:[]},snapshot([record('__proto__',1)]),snapshot([record(id,4)]),snapshot([record(id,1.1)]),snapshot([record(id,1),record(id,2)]),snapshot([record(id,1,'x'.repeat(12001))]),snapshot([record(id,1,'','not-a-date')])];
 for(const v of invalid)assert.throws(()=>lib.validateInterviewSnapshot(v));
 assert.throws(()=>lib.validateRoadmapSnapshot(snapshot([])));
});
test('Merging imports preserves other questions and the newer note',()=>{
 const [a,b]=data.cards.map(c=>c.id),newer=record(a,3,'новее','2026-10-19T00:00:00Z'),older=record(a,1,'старее');
 const merged=lib.mergeInterviewEntries({[a]:newer},[older,record(b,2)]);assert.equal(merged[a].notes,'новее');assert.equal(merged[b].status,2);assert.equal(newer.notes,'новее');
});
test('Read, save, import and offline export survive blocked storage and escape HTML',()=>{
 const storage=new Map(),events=[];
 globalThis.localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
 globalThis.window={dispatchEvent:event=>events.push(event.type)};
 globalThis.document={getElementById:id=>id==='roadmap-styles'?{textContent:'body{}'}:id==='roadmap-app'?{textContent:'/*app*/'}:null,querySelector:()=>null};
 const id=data.cards[0].id;
 lib.loadInterviewProgress();lib.saveInterviewProgress(id,{status:2,notes:'</script><img src=x onerror=alert(1)>'});assert.equal(lib.loadInterviewProgress().entries[id].status,2);
 const before=storage.get(lib.INTERVIEW_KEY);lib.loadInterviewProgress();assert.equal(storage.get(lib.INTERVIEW_KEY),before,'Reading must not write back and cause cross-tab storage-event loops');
 const html=lib.portableHtml({format:'cpp-roadmap-progress',version:1,exportedAt:'2026-10-18T00:00:00Z',entries:[]});
 const seed=html.match(/<script id="interview-seed" type="application\/json">([\s\S]*?)<\/script>/);assert.ok(seed);assert.ok(!seed[1].includes('</script>'));assert.equal(JSON.parse(seed[1]).entries[0].notes,'</script><img src=x onerror=alert(1)>');
 globalThis.localStorage={getItem:()=>{throw Error('blocked')},setItem:()=>{throw Error('blocked')}};
 const result=lib.saveInterviewProgress(id,{status:3});assert.equal(result.durable,false);assert.equal(lib.interviewSnapshot().entries.find(e=>e.id===id).status,3);assert.ok(events.length>=2);
});

test('Every study renders its full answer, code and original variants without raw HTML execution',()=>{
 for(const c of data.cards){const html=lib.renderToStaticMarkup(lib.createElement(lib.InterviewBank,{selectedId:c.id,topic:'',onSelect:()=>{},onTopic:()=>{}}));assert.ok(html.includes('Подробный разбор'),c.id);assert.ok(html.includes('Самостоятельная практика'),c.id);assert.ok(html.includes(c.id),c.id);assert.ok(!/<script\b/i.test(html),c.id);assert.ok(html.includes('interview-self-assessment'));}
});
