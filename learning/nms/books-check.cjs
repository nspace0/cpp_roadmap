const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {execFileSync}=require('node:child_process');
const {createEngine}=require('./core.js');
const UI=require('./books-ui.js');
const data={...JSON.parse(fs.readFileSync(path.join(__dirname,'curriculum.json'),'utf8')),bookStudy:JSON.parse(fs.readFileSync(path.join(__dirname,'books.json'),'utf8'))};
const fresh=()=>createEngine(data);
const snapshot=e=>JSON.parse(JSON.stringify(e.state));
const full=(e,id)=>({status:'applied',checks:e.bookById[id].checks.map((_,i)=>i),evidence:'Commit abc; Windows/MSVC; command --help; result checked.',spent:1.5});
test('eight workshops have valid links, reading, examples, practice and explicit limits',()=>{
 const e=fresh();assert.equal(e.workshops.length,8);assert.equal(Object.keys(e.bookById).length,8);assert.equal(e.tasks.length,112);
 for(const w of e.workshops){
  assert.ok(data.bookStudy.books.some(b=>b.id===w.book));w.tasks.forEach(id=>assert.ok(Object.hasOwn(e.byId,id),id));
  assert.ok(w.reading.length>=2);assert.ok(w.theory.join(' ').split(/\s+/).length>=100);assert.ok(w.example.code&&w.example.expected);assert.ok(w.steps.length>=4&&w.checks.length>=3&&w.questions.length>=2&&w.notCovered.length>=2);
  w.questions.forEach(q=>assert.ok(q.q&&q.a));
 }
 for(const b of data.bookStudy.books){assert.ok(b.source.startsWith('https://www.informit.com/'));for(const r of b.remaining)r.tasks.forEach(id=>assert.ok(e.byId[id],id));}
});
test('legacy JSON preserves task notes, checks, accepted status, plan and current task',()=>{
 const e=fresh(),t=e.byId['P01.1'];
 e.update(t.id,{checks:t.checks.map((_,i)=>i),notes:'Мой старый прогресс',review:'Проверено',spent:3,theoryRead:true});e.update(t.id,{status:'done'});
 e.state.currentTask='P01.2';e.state.planned=['P01.2','P01.3'];e.state.hoursPerWeek=14;
 const legacy=e.export();delete legacy.books;const loaded=createEngine(data,legacy);
 assert.deepEqual(loaded.state.tasks,e.state.tasks);assert.deepEqual(loaded.state.planned,e.state.planned);assert.equal(loaded.state.currentTask,'P01.2');assert.equal(loaded.state.hoursPerWeek,14);assert.deepEqual(loaded.state.books,{});
 assert.equal(loaded.stats().done,1);assert.equal(loaded.bookStats().read,0);
});
test('book progress round trips independently and evidence gates are atomic',()=>{
 const e=fresh(),before=snapshot(e);assert.throws(()=>e.updateBook('BC01',{status:'applied'}));assert.deepEqual(snapshot(e),before);
 e.updateBook('BC01',{status:'read',notes:'разобрать владение'});assert.equal(e.bookStats().read,1);
 e.updateBook('BC01',full(e,'BC01'));const applied=snapshot(e);assert.throws(()=>e.updateBook('BC01',{status:'reviewed'}));assert.deepEqual(snapshot(e),applied);
 e.updateBook('BC01',{status:'reviewed',review:'Объяснил причины; ревью принято'});
 assert.equal(e.bookStats().reviewed,1);assert.equal(e.stats().done,0);assert.equal(e.stats().spent,0);assert.equal(e.bookStats().spent,1.5);
 const restored=createEngine(data,e.export());assert.deepEqual(snapshot(restored),snapshot(e));
 assert.throws(()=>e.updateBook('BC01',{checks:[]}));assert.equal(e.bookProgress('BC01').status,'reviewed');
 e.updateBook('BC01',{status:'read',checks:[],review:''});assert.equal(e.bookStats().applied,0);
});
test('malformed imports never replace existing state',()=>{
 const e=fresh();e.updateBook('BA02',{status:'read',notes:'keep'});const before=snapshot(e);
 const bads=[null,[],{'unknown':{status:'todo'}},{BC01:{status:'done'}},{BC01:{status:'read',checks:[-1]}},{BC01:{status:'read',checks:[999]}},{BC01:{status:'read',spent:Infinity}},{BC01:{status:'read',notes:42}},{BC01:{status:'reviewed',checks:[0,1,2],evidence:'ok',review:'  '}},JSON.parse('{"__proto__":{"status":"todo"}}')];
 for(const books of bads){assert.throws(()=>e.import({...e.export(),books}));assert.deepEqual(snapshot(e),before);}
});
test('rendering escapes notes, evidence, answers and code; task links and reports are usable',()=>{
 const e=fresh();e.updateBook('BC01',{status:'read',notes:'</textarea><script>alert(1)</script>',evidence:'<img src=x onerror=alert(1)>'});
 const html=UI.render(e,'BC01');assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('&lt;QCoreApplication&gt;'));assert.ok(!html.includes('<img src=x'));assert.ok(html.includes('data-workshop="BC01"'));assert.ok(UI.related(e,'P01.3').includes('data-book="BC01"'));assert.ok(UI.report(e,'BC01').includes('Мои заметки:'));
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);assert.equal(new Set(ids).size,ids.length);
 for(const w of e.workshops)assert.ok(UI.render(e,w.id).includes('id="book-form"'));
});
test('C++20 model example and refusal case compile and run with strict warnings',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'nms-book-'));
 try{
  const e=fresh(),source=e.bookById.BC03.example.code+'\n'+e.bookById.BC04.example.code+'\n'+e.bookById.BA02.example.code+'\nint main(){ duplicateDoesNotChangeMap(); std::vector<Device> d; assert(addDevice(d,{"", "empty"})==AddDeviceResult::emptyId); assert(d.empty()); assert(addDevice(d,{"sw-1", "ok"})==AddDeviceResult::added); assert(d.size()==1); }\n';
  fs.writeFileSync(path.join(dir,'example.cpp'),source);execFileSync('c++',['-std=c++20','-Wall','-Wextra','-Werror',path.join(dir,'example.cpp'),'-o',path.join(dir,'example')]);execFileSync(path.join(dir,'example'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
