import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../source/node_modules/esbuild/lib/main.js';
import {prepareCourseScopes} from './prepare-scope.mjs';
import {MAPS,COURSES,GROUPS} from './catalog.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.dirname(root);
const read=p=>fs.readFile(path.join(root,p),'utf8');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=value=>JSON.stringify(value).replace(/</g,'\\u003c');
async function bundle(entry){const result=await build({entryPoints:[path.join(root,entry)],bundle:true,write:false,format:'iife',platform:'browser',target:['es2020'],charset:'utf8',minify:true});return result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');}
const [app,scopeApp,hubApp,style,scopeStyle,template]=await Promise.all([bundle('course-app.js'),bundle('nms-scope-entry.js'),bundle('hub-app.js'),read('course.css'),read('scope-kit.css'),read('course-template.html')]);
const meta=[],courses={};
await prepareCourseScopes();
for(const map of COURSES){
 const {id}=map,data=JSON.parse(await read('data/'+id+'.json')),scope=JSON.parse(await read('data/'+id+'-scope.json'));courses[id]=data;
 const total=data.lessons.reduce((a,l)=>a.map((v,i)=>v+l.theoryHours[i]+l.practiceHours[i]),[0,0]);
 const description=typeof data.positioning==='string'?data.positioning:data.positioning.description||'Теория, самостоятельные задания, проверка результата и границы каждой темы.';
 let html=template;
 for(const [key,value] of Object.entries({TITLE:escape(data.title),SHORT_TITLE:escape(map.title.toLocaleUpperCase('ru')),DESCRIPTION:escape(description),BASELINE:escape(map.baseline),COUNT:data.lessons.length,MODULES:data.modules.length,CSS:style+'\n'+scopeStyle,DATA:safe(data),SCOPE:safe(scope),APP:app}))html=html.replaceAll('__'+key+'__',String(value));
 if(/__(TITLE|SHORT_TITLE|DESCRIPTION|BASELINE|COUNT|MODULES|CSS|DATA|SCOPE|APP)__/.test(html))throw Error('Unfilled placeholder '+id);
 await fs.mkdir(path.join(repo,map.path),{recursive:true});await fs.writeFile(path.join(repo,map.path,'index.html'),html);
 meta.push({id,title:data.title,lessons:data.lessons.length,modules:data.modules.length,hours:total,gaps:data.gaps.length,bytes:Buffer.byteLength(html)});
}
let nms=await read('nms/template.html');for(const [key,value] of Object.entries({DATA:safe(JSON.parse(await read('nms/curriculum.json'))),CORE:await read('nms/core.js'),APP:await read('nms/app.js'),SCOPE:safe(JSON.parse(await read('data/nms-scope.json'))),SCOPE_CSS:scopeStyle,SCOPE_APP:scopeApp}))nms=nms.replace('__'+key+'__',value);
await fs.writeFile(path.join(repo,'development/index.html'),nms);
const cards=MAPS.map(m=>{const c=meta.find(c=>c.id===m.id);return {...m,count:c?c.modules+' модулей · '+c.lessons+' заданий':m.id==='cpp'?'75 модулей · 381 тема':'26 этапов · 112 задач'};});
const cardHtml=GROUPS.map(g=>`<section class="map-group" data-group="${g.id}"><div class="group-heading"><span class="eyebrow">${g.id==='science'?'ПОНИМАТЬ И ИССЛЕДОВАТЬ':g.id==='engineering'?'СОЗДАВАТЬ И ОТЛАЖИВАТЬ':'ИЗМЕРЯТЬ И ПРОВЕРЯТЬ'}</span><h2>${escape(g.title)}</h2></div><div class="grid">${cards.filter(m=>m.group===g.id).map(m=>`<article class="card"><span class="number">${escape(m.count)}</span><h3>${escape(m.title)}</h3><p>${escape(m.description)}</p><p class="progress" id="progress-${m.id}">Загружаем локальные отметки…</p><a class="action" href="../${m.path}">Открыть карту →</a></article>`).join('')}</div></section>`).join('');
const journey=JSON.parse(await read('data/observatory-path.json'));
for(const stage of journey.stages)for(const ref of stage.refs){const lesson=courses[ref.map]?.lessons.find(l=>l.id===ref.lesson);if(!lesson)throw Error('Unknown observatory route link '+ref.map+':'+ref.lesson);ref.title=lesson.title;ref.mapTitle=MAPS.find(m=>m.id===ref.map).title;ref.path='../'+MAPS.find(m=>m.id===ref.map).path+'#lesson='+encodeURIComponent(ref.lesson);}
const hub=(await read('hub-template.html')).replace('__CARDS__',cardHtml).replace('__APP__',hubApp).replace('__HUB_DATA__',safe({cards:cards.map(m=>({id:m.id})),journey}));
await fs.mkdir(path.join(repo,'maps'),{recursive:true});await fs.writeFile(path.join(repo,'maps/index.html'),hub);
await fs.writeFile(path.join(root,'data/build-summary.json'),JSON.stringify(meta,null,2)+'\n');
console.log(JSON.stringify(meta));
