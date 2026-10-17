import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from '../source/node_modules/esbuild/lib/main.js';
import {prepareCourseScopes} from './prepare-scope.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),repo=path.dirname(root);
const read=p=>fs.readFile(path.join(root,p),'utf8');
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safe=value=>JSON.stringify(value).replace(/</g,'\\u003c');
async function bundle(entry){const result=await build({entryPoints:[path.join(root,entry)],bundle:true,write:false,format:'iife',platform:'browser',target:['es2020'],charset:'utf8',minify:true});return result.outputFiles[0].text.replace(/<\/script/gi,'<\\/script');}
const [app,scopeApp,style,scopeStyle,template]=await Promise.all([bundle('course-app.js'),bundle('nms-scope-entry.js'),read('course.css'),read('scope-kit.css'),read('course-template.html')]);
const meta=[];
await prepareCourseScopes();
for(const id of ['ros','electronics']){
 const data=JSON.parse(await read('data/'+id+'.json')),scope=JSON.parse(await read('data/'+id+'-scope.json'));
 const total=data.lessons.reduce((a,l)=>a.map((v,i)=>v+l.theoryHours[i]+l.practiceHours[i]),[0,0]);
 const description=typeof data.positioning==='string'?data.positioning:data.positioning.description||'Теория, самостоятельные задания, проверка результата и границы каждой темы.';
 const baseline=id==='ros'?'Базовый стенд: Ubuntu 24.04 · ROS 2 Jazzy · Gazebo Harmonic · C++17. Устаревшие задания курса сверяются отдельно.':'Расчёт и симуляция → безопасный низковольтный стенд → схемы и платы → микроконтроллеры. Платформы курса проверяются отдельно.';
 let html=template;
 for(const [key,value] of Object.entries({TITLE:escape(data.title),SHORT_TITLE:id==='ros'?'ROS 2':'ЭЛЕКТРОТЕХНИКА',DESCRIPTION:escape(description),BASELINE:escape(baseline),COUNT:data.lessons.length,MODULES:data.modules.length,CSS:style+'\n'+scopeStyle,DATA:safe(data),SCOPE:safe(scope),APP:app}))html=html.replaceAll('__'+key+'__',String(value));
 if(/__[A-Z_]+__/.test(html))throw Error('Unfilled placeholder '+id);
 await fs.mkdir(path.join(repo,id),{recursive:true});await fs.writeFile(path.join(repo,id,'index.html'),html);
 meta.push({id,title:data.title,lessons:data.lessons.length,modules:data.modules.length,hours:total,gaps:data.gaps.length,bytes:Buffer.byteLength(html)});
}
let nms=await read('nms/template.html');for(const [key,value] of Object.entries({DATA:safe(JSON.parse(await read('nms/curriculum.json'))),CORE:await read('nms/core.js'),APP:await read('nms/app.js'),SCOPE:safe(JSON.parse(await read('data/nms-scope.json'))),SCOPE_CSS:scopeStyle,SCOPE_APP:scopeApp}))nms=nms.replace('__'+key+'__',value);
await fs.writeFile(path.join(repo,'development/index.html'),nms);
const cards=[
 {id:'cpp',title:'C / C++ и системная база',path:'../',count:'75 модулей · 381 тема',description:'Язык, Linux, сборка и отладка, сети, Qt и системные специализации. Существующий учебник дополнен границами всех тем.'},
 {id:'nms',title:'Разработка NMS',path:'../development/',count:'26 этапов · 112 задач',description:'От первого CLI до карты сети, проверок устройств, GUI, упаковки и эксплуатации. Продуктовый маршрут и отдельные направления углубления.'},
 ...meta.map(m=>({id:m.id,title:m.title,path:'../'+m.id+'/',count:m.modules+' модулей · '+m.lessons+' заданий',description:m.id==='ros'?'От Linux и ROS-графа до симуляции, управления, навигации и интеграции. Отдельные задачи буткемпа и ограничения переноса старых примеров.':'От расчёта и измерений до схем, плат и микроконтроллеров. ESP32, Arduino и STM32 различаются в заданиях, а симуляция — в критериях проверки.'}))
];
const cardHtml=cards.map((m,i)=>`<article class="card"><span class="number">0${i+1} / ${escape(m.count)}</span><h2>${escape(m.title)}</h2><p>${escape(m.description)}</p><p class="progress" id="progress-${m.id}">Загружаем локальные отметки…</p><a class="action" href="${m.path}">Открыть карту →</a></article>`).join('');
const hub=(await read('hub-template.html')).replace('__CARDS__',cardHtml).replace('__APP__',await read('hub-app.js'));
await fs.mkdir(path.join(repo,'maps'),{recursive:true});await fs.writeFile(path.join(repo,'maps/index.html'),hub);
await fs.writeFile(path.join(root,'data/build-summary.json'),JSON.stringify(meta,null,2)+'\n');
console.log(JSON.stringify(meta));
