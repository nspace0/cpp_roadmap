import {modules,allTopics,type Entry,type Update} from './map-config';

export const STORAGE_KEY='cpp-roadmap-offline-v1';
export const FORMAT='cpp-roadmap-progress';
const allowed=new Set<string>([
 ...allTopics.map(t=>t.code),
 ...modules.flatMap(m=>[`note:${m.id}`,`practice:${m.id}`,...m.checks.map((_,i)=>`check:${m.id}:${i}`)]),
 ...Array.from({length:30},(_,i)=>`week:${i+1}`)
]);
export type Snapshot={format:typeof FORMAT;version:1;exportedAt:string;entries:Entry[]};
let memory:Record<string,Entry>={};
let storageWorks=true;

export function validateSnapshot(value:unknown):Snapshot{
 if(!value||typeof value!=='object')throw Error('В файле нет объекта прогресса.');
 const d=value as Record<string,unknown>;
 if(d.format!==FORMAT||d.version!==1||!Array.isArray(d.entries)||d.entries.length>1500)throw Error('Это не файл прогресса C++ Roadmap версии 1.');
 const seen=new Set<string>();
 const entries=d.entries.map((v:unknown)=>{
  if(!v||typeof v!=='object')throw Error('Повреждена запись прогресса.');
  const e=v as Record<string,unknown>;
  if(typeof e.id!=='string'||!allowed.has(e.id)||seen.has(e.id)||!Number.isInteger(e.status)||![0,1,2].includes(e.status as number)||typeof e.notes!=='string'||e.notes.length>12000||typeof e.updated_at!=='string'||!Number.isFinite(Date.parse(e.updated_at)))throw Error('Файл содержит неизвестную тему или повреждённые данные.');
  seen.add(e.id);
  return {id:e.id,status:e.status as number,notes:e.notes,updated_at:new Date(e.updated_at).toISOString()};
 });
 return {format:FORMAT,version:1,exportedAt:typeof d.exportedAt==='string'?d.exportedAt:new Date().toISOString(),entries};
}

export function snapshot(entries:Record<string,Entry>=memory):Snapshot{
 return {format:FORMAT,version:1,exportedAt:new Date().toISOString(),entries:Object.values(entries)};
}

export function mergeEntries(base:Record<string,Entry>,incoming:Entry[]):Record<string,Entry>{
 const result={...base};
 for(const e of incoming){const old=result[e.id];if(!old||Date.parse(e.updated_at)>=Date.parse(old.updated_at))result[e.id]={...e};}
 return result;
}

function readBrowser():Entry[]{
 const text=localStorage.getItem(STORAGE_KEY);
 return text?validateSnapshot(JSON.parse(text)).entries:[];
}

export function loadLocal(){
 let warning='';
 const seed=document.getElementById('roadmap-seed')?.textContent;
 if(seed){try{memory=mergeEntries(memory,validateSnapshot(JSON.parse(seed)).entries)}catch{warning='Не удалось прочитать встроенную копию прогресса. Можно импортировать резервный JSON.'}}
 try{memory=mergeEntries(memory,readBrowser());localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot()));storageWorks=true}
 catch{storageWorks=false;warning='Автосохранение в браузере недоступно. Перед закрытием скачай HTML-копию с прогрессом.'}
 return {entries:{...memory},durable:storageWorks,warning};
}

function persist(entries:Record<string,Entry>){
 memory=entries;
 try{localStorage.setItem(STORAGE_KEY,JSON.stringify(snapshot()));storageWorks=true}catch{storageWorks=false}
 return {entries:{...memory},durable:storageWorks};
}

export function saveLocal(updates:Update[]){
 let current={...memory};
 try{current=mergeEntries(current,readBrowser())}catch{}
 const now=new Date().toISOString();
 for(const u of updates){
  if(!allowed.has(u.id)||(u.status!==undefined&&![0,1,2].includes(u.status))||(u.notes!==undefined&&(typeof u.notes!=='string'||u.notes.length>12000)))throw Error('Некорректная запись прогресса. Максимум 12 000 символов в заметке.');
  current[u.id]={id:u.id,status:u.status??current[u.id]?.status??0,notes:u.notes??current[u.id]?.notes??'',updated_at:now};
 }
 return persist(current);
}

export function importLocal(value:unknown){
 const valid=validateSnapshot(value);
 let current={...memory};try{current=mergeEntries(current,readBrowser())}catch{}
 return persist(mergeEntries(current,valid.entries));
}

export function downloadText(text:string,name:string,type:string){
 const url=URL.createObjectURL(new Blob([text],{type}));
 const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}

export function portableHtml(progress:Snapshot){
 const style=document.getElementById('roadmap-styles')?.textContent;
 const code=document.getElementById('roadmap-app')?.textContent;
 const icon=document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.href||'';
 if(!style||!code)throw Error('Не удалось прочитать приложение для сохранения.');
 const safe=JSON.stringify(progress).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');
 return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'"><title>C++ Roadmap — автономная карта</title><link rel="icon" href="${icon}"><style id="roadmap-styles">${style}</style></head><body><div id="root"></div><noscript>Для карты нужен JavaScript. Интернет и аккаунт не нужны.</noscript><script id="roadmap-seed" type="application/json">${safe}</script><script id="roadmap-app">${code}</script></body></html>`;
}
