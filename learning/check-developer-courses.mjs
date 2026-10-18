import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {glossaryBlock,walkthroughBlock,answersBlock} from './lesson-extras.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('./data/'+name+'.json',import.meta.url),'utf8'));
for(const name of ['assembly','cpp-tools']){
 const data=read(name);
 test(name+': detailed explanation, worked steps, independent practice and answers in all lessons',()=>{
  for(const l of data.lessons){
   assert.ok(l.theory.length>=4,l.id+' needs connected paragraphs');
   assert.ok(l.theory.join(' ').split(/\s+/).length>=200,l.id+' theory depth');
   assert.ok(l.example.explanation.split(/\s+/).length>=40,l.id+' example explanation');
   for(const [key,min] of [['glossary',3],['walkthrough',4],['pitfalls',3],['practice',5],['acceptance',4],['defense',3]])assert.ok(l[key]?.length>=min,l.id+' '+key);
   assert.equal(l.defenseAnswers.length,l.defense.length);
   l.defenseAnswers.forEach((a,i)=>{assert.equal(a.question,l.defense[i]);assert.ok(a.answer.length>=35,l.id+' answer '+i);});
   l.glossary.forEach(g=>assert.ok(g.term&&g.definition));
   for(const render of [glossaryBlock,walkthroughBlock,answersBlock])assert.ok(render(l).length>100,l.id+' visible extras');
   assert.ok(!/\n\+/.test(JSON.stringify(l).replaceAll('\\n','\n')),l.id+' stray patch marker');
  }
  assert.equal(data.lessons.length,name==='assembly'?36:42);
  if(name==='cpp-tools')assert.equal(data.lessons.filter(l=>/^CT0[4-9]\./.test(l.id)).length,18);
 });
}
test('Optional lesson sections preserve old cards and escape code-like prose',()=>{
 for(const render of [glossaryBlock,walkthroughBlock,answersBlock])assert.equal(render({}),'');
 const payload='<img src=x onerror=alert(1)>';
 const lesson={glossary:[{term:payload,definition:payload}],walkthrough:[payload],pitfalls:[payload],defense:[payload],defenseAnswers:[{question:payload,answer:payload}]};
 for(const render of [glossaryBlock,walkthroughBlock,answersBlock]){
  const html=render(lesson);assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));
 }
 const html=answersBlock(lesson);assert.ok(html.includes('<details>'));assert.ok(!html.includes('<details open'));
});
test('Download contains full programs, a first session, commands and an evidence template',()=>{
 const files=read('developer-labs').files;
 for(const key of ['README-RU.md','GDB-CHEATSHEET.md','REPORT-TEMPLATE.md','starter/CMakeLists.txt','starter/CMakePresets.json','starter/main.cpp','starter/tests.cpp','gdb/gdb-lab.cpp','gdb/range-sum.cpp','asm-pair/CMakeLists.txt','asm-pair/add_nasm.asm','asm-pair/add_masm.asm'])assert.ok(files[key]?.length>30,key);
 assert.equal(JSON.parse(files['starter/CMakePresets.json']).version,3);
 assert.ok(files['README-RU.md'].includes('НАМЕРЕННАЯ'));
 assert.ok(files['GDB-CHEATSHEET.md'].includes('target remote | ssh -T'));
 assert.ok(files['gdb/range-sum.cpp'].includes('return result == 16 ? 0 : 1'));
});

