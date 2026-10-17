import {useEffect} from 'react';
import content from '@/data/scope.json';
import {mountScope} from '../../learning/scope-kit.mjs';
import {STORAGE_KEY} from './local-progress';
type Boundary={title:string;covered:string[];notCovered:string[];next:{title:string;reason:string;target:string|null;priority:string}[];level:string};
const topics=content.topics as Record<string,Boundary>;
export function ScopeNavigation(){
 useEffect(()=>{mountScope({id:'cpp',title:'C / C++ и системная разработка',data:content,status:(id:string)=>{try{const raw=JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}');return raw.entries?.find((e:{id:string;status:number})=>e.id===id)?.status||0;}catch{return 0;}},openTopic:(id:string)=>{window.location.hash='lesson='+encodeURIComponent(id);}});},[]);
 return null;
}
export function ScopeBoundary({id,onTopic}:{id:string;onTopic:(id:string)=>void}){
 const t=topics[id];if(!t)return null;
 const depth:Record<string,string>={intro:'Введение',applied:'Учебное применение',advanced:'Углублённая задача'};
 return <div className="scope-boundary"><span className="scope-depth">Глубина карточки: {depth[t.level]||t.level}</span><h3>Границы темы {id}</h3><h4>Что проверяем этим уроком</h4><ul>{t.covered.map((x,i)=><li key={i}>{x}</li>)}</ul><h4>Что остаётся за границами этого урока</h4><ul>{t.notCovered.map((x,i)=><li key={i}>{x}</li>)}</ul><h4>Следующее углубление</h4><ul>{t.next.map((x,i)=><li key={i}>{x.target?<button onClick={()=>onTopic(x.target!)}>{x.title}</button>:<b>{x.title}</b>} — {x.reason}</li>)}</ul><p className="scope-note">Галочка подтверждает практику этого урока. Самостоятельность проверяется новым случаем и объяснением ограничений. Полный обзор смежных тем — в кнопке «Что ещё изучить» над картой.</p></div>;
}
