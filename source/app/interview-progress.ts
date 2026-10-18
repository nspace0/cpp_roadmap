import {interviewCards} from './interview-data';
export const INTERVIEW_KEY='cpp-interview-progress-v1';
export const INTERVIEW_FORMAT='cpp-interview-progress';
export const INTERVIEW_EVENT='cpp-interview-progress-change';
export type InterviewEntry={id:string;status:number;notes:string;updatedAt:string};
export type InterviewSnapshot={format:typeof INTERVIEW_FORMAT;version:1;exportedAt:string;entries:InterviewEntry[]};
const allowed=new Set(interviewCards.map(c=>c.id));
let memory:Record<string,InterviewEntry>={};
let loadedSeed=false;

export function validateInterviewSnapshot(value:unknown):InterviewSnapshot{
 if(!value||typeof value!=='object')throw Error('В файле нет объекта прогресса.');
 const d=value as Record<string,unknown>;
 if(d.format!==INTERVIEW_FORMAT||d.version!==1||!Array.isArray(d.entries)||d.entries.length>allowed.size)throw Error('Нужен JSON прогресса собеседования версии 1. Прогресс учебной карты импортируется в «Мои файлы».');
 const seen=new Set<string>();
 const entries=d.entries.map((item:unknown)=>{
  if(!item||typeof item!=='object')throw Error('Повреждённая запись.');
  const e=item as Record<string,unknown>;
  if(typeof e.id!=='string'||!allowed.has(e.id)||seen.has(e.id)||!Number.isInteger(e.status)||![0,1,2,3].includes(e.status as number)||typeof e.notes!=='string'||e.notes.length>12000||typeof e.updatedAt!=='string'||!Number.isFinite(Date.parse(e.updatedAt)))throw Error('Неизвестный вопрос или повреждённая запись прогресса.');
  seen.add(e.id);return {id:e.id,status:e.status as number,notes:e.notes,updatedAt:new Date(e.updatedAt).toISOString()};
 });
 return {format:INTERVIEW_FORMAT,version:1,exportedAt:typeof d.exportedAt==='string'?d.exportedAt:new Date().toISOString(),entries};
}
export function mergeInterviewEntries(base:Record<string,InterviewEntry>,incoming:InterviewEntry[]){
 const result={...base};for(const e of incoming){const old=result[e.id];if(!old||Date.parse(e.updatedAt)>=Date.parse(old.updatedAt))result[e.id]={...e};}return result;
}
export function interviewSnapshot():InterviewSnapshot{return {format:INTERVIEW_FORMAT,version:1,exportedAt:new Date().toISOString(),entries:Object.values(memory)};}
function browserEntries(){const value=localStorage.getItem(INTERVIEW_KEY);return value?validateInterviewSnapshot(JSON.parse(value)).entries:[];}
function persist(){let durable=true;try{localStorage.setItem(INTERVIEW_KEY,JSON.stringify(interviewSnapshot()));}catch{durable=false;}return {entries:{...memory},durable};}
export function loadInterviewProgress(){
 let warning='',durable=true,seedChanged=false;
 if(!loadedSeed&&typeof document!=='undefined'){
  const seed=document.getElementById('interview-seed')?.textContent;
  if(seed)try{const imported=validateInterviewSnapshot(JSON.parse(seed));memory=mergeInterviewEntries(memory,imported.entries);seedChanged=imported.entries.length>0;}catch{warning='Не удалось прочитать встроенный прогресс собеседования.';}
  loadedSeed=true;
 }
 try{memory=mergeInterviewEntries(memory,browserEntries());}catch{durable=false;warning='Не удалось прочитать прогресс собеседования в браузере. Сохраняй JSON или HTML перед закрытием.';}
 const result=seedChanged?persist():{entries:{...memory},durable};if(!result.durable)warning='Автосохранение собеседования недоступно. Скачай JSON или HTML с прогрессом перед закрытием.';
 return {...result,warning};
}
export function saveInterviewProgress(id:string,change:{status?:number;notes?:string}){
 if(!allowed.has(id)||(change.status!==undefined&&![0,1,2,3].includes(change.status))||(change.notes!==undefined&&(typeof change.notes!=='string'||change.notes.length>12000)))throw Error('Некорректная отметка. Максимальная длина заметки — 12 000 символов.');
 try{memory=mergeInterviewEntries(memory,browserEntries());}catch{}
 memory[id]={id,status:change.status??memory[id]?.status??0,notes:change.notes??memory[id]?.notes??'',updatedAt:new Date().toISOString()};
 const result=persist();if(typeof window!=='undefined')window.dispatchEvent(new Event(INTERVIEW_EVENT));return result;
}
export function importInterviewProgress(value:unknown){
 const data=validateInterviewSnapshot(value);loadInterviewProgress();memory=mergeInterviewEntries(memory,data.entries);
 const result=persist();if(typeof window!=='undefined')window.dispatchEvent(new Event(INTERVIEW_EVENT));return result;
}
export function portableInterviewSeed(){loadInterviewProgress();return JSON.stringify(interviewSnapshot()).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026');}
