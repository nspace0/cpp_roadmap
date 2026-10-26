import {mountBackup} from './progress-backup/app.mjs';
import {MAPS,storageKey} from './catalog.mjs';
import {esc} from './scope-kit.mjs';
const data=JSON.parse(document.getElementById('hub-data').textContent);
function readProgress(id){try{const s=JSON.parse(localStorage.getItem(storageKey(id))||'null');return s||{};}catch{return {};}}
function accepted(map,id){const s=readProgress(map);return map==='cpp'?s.entries?.some(p=>p.id===id&&p.status===2):map==='nms'?s.tasks?.[id]?.status==='done':s.lessons?.[id]?.status==='done';}
function refresh(){for(const m of MAPS){const el=document.getElementById('progress-'+m.id);try{const raw=localStorage.getItem(storageKey(m.id));if(!raw){el.textContent='В этом браузере ещё нет отметок.';continue;}const s=JSON.parse(raw);let done=0,active=0,current='';if(m.id==='cpp'){done=(s.entries||[]).filter(p=>p.status===2).length;active=(s.entries||[]).filter(p=>p.status===1).length;}else{const items=Object.values(m.id==='nms'?s.tasks||{}:s.lessons||{});done=items.filter(p=>p.status==='done').length;active=items.filter(p=>!['todo','done'].includes(p.status)).length;current=s.currentTask||s.current||'';}el.textContent=`Выполнено: ${done} · В работе: ${active}`+(current?` · Текущее: ${current}`:'');}catch{el.textContent='Сохранение недоступно. Проверь импорт внутри карты.';}}
 const j=data.journey;document.getElementById('journey-content').innerHTML=`<p>${esc(j.intro)}</p><div class="journey-grid">${j.stages.map(s=>{const count=s.refs.filter(r=>accepted(r.map,r.lesson)).length;return `<article class="journey-stage"><span class="number">${count} / ${s.refs.length} опорных задач отмечено</span><h3>${esc(s.title)}</h3><p>${esc(s.result)}</p><ul>${s.refs.map(r=>`<li><a href="${esc(r.path)}">${esc(r.lesson)} · ${esc(r.title)}</a><small>${esc(r.mapTitle)} · ${accepted(r.map,r.lesson)?'Отмечено выполненным':'Пока нет отметки'}</small></li>`).join('')}</ul></article>`;}).join('')}</div>`;
}
document.querySelectorAll('[data-filter]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));document.querySelectorAll('[data-group]').forEach(s=>s.hidden=b.dataset.filter!=='all'&&s.dataset.group!==b.dataset.filter);}));
refresh();window.addEventListener('storage',refresh);window.addEventListener('pageshow',refresh);

mountBackup(data.backupSchema, refresh);
