(function (root) {
  'use strict';
  const STATUSES = {todo:'Не начато',doing:'В работе',review:'На проверке',done:'Принято',blocked:'Есть препятствие'};
  function createEngine(data, input) {
    const tasks=data.stages.flatMap(s=>s.tasks), byId=Object.fromEntries(tasks.map(t=>[t.id,t]));
    const fresh=()=>({schemaVersion:1,roadmapId:data.roadmapId,currentTask:data.currentTask,hoursPerWeek:20,planned:['P01.1','P01.2','P01.3'],tasks:JSON.parse(JSON.stringify(data.seed))});
    let state=fresh();
    function validate(value) {
      if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Ожидается объект прогресса.');
      if(value.schemaVersion!==1||value.roadmapId!==data.roadmapId)throw Error('Этот файл относится к другой карте или версии формата.');
      if(!value.tasks||typeof value.tasks!=='object'||Array.isArray(value.tasks))throw Error('В файле нет корректного списка задач.');
      const clean=fresh(); clean.tasks={};
      for(const [id,raw] of Object.entries(value.tasks)) {
        if(!Object.hasOwn(byId,id))throw Error('Неизвестный код задания: '+id);
        if(!raw||typeof raw!=='object'||Array.isArray(raw)||!Object.hasOwn(STATUSES,raw.status))throw Error('Неверный статус '+id);
        const p={status:raw.status,notes:'',review:'',checks:[],spent:0,theoryRead:false};
        for(const k of ['notes','review']){if(raw[k]!==undefined&&(typeof raw[k]!=='string'||raw[k].length>100000))throw Error('Неверное поле '+k+' у '+id);p[k]=raw[k]||'';}
        if(raw.checks!==undefined&&(!Array.isArray(raw.checks)||raw.checks.some(n=>!Number.isInteger(n)||n<0||n>=byId[id].checks.length)))throw Error('Неверные критерии '+id);
        p.checks=[...new Set(raw.checks||[])];
        if(raw.spent!==undefined&&(typeof raw.spent!=='number'||!Number.isFinite(raw.spent)||raw.spent<0||raw.spent>10000))throw Error('Неверное время '+id);
        p.spent=raw.spent||0;p.theoryRead=raw.theoryRead===true;
        if(raw.updatedAt && typeof raw.updatedAt==='string')p.updatedAt=raw.updatedAt.slice(0,80);
        clean.tasks[id]=p;
      }
      if(value.currentTask!==undefined&&!Object.hasOwn(byId,value.currentTask))throw Error('Неизвестное текущее задание.');
      clean.currentTask=value.currentTask||data.currentTask;
      if(value.hoursPerWeek!==undefined&&(!Number.isFinite(value.hoursPerWeek)||value.hoursPerWeek<1||value.hoursPerWeek>60))throw Error('Нагрузка должна быть от 1 до 60 ч/нед.');
      clean.hoursPerWeek=value.hoursPerWeek||20;
      if(value.planned!==undefined&&(!Array.isArray(value.planned)||value.planned.length>tasks.length||value.planned.some(id=>typeof id!=='string'||!Object.hasOwn(byId,id))))throw Error('Некорректный план.');
      clean.planned=[...new Set(value.planned||[])];
      for(const [id,p] of Object.entries(clean.tasks))if(p.status==='done'){
        if(p.checks.length!==byId[id].checks.length||!p.review.trim())throw Error('У принятого задания '+id+' не заполнены критерии или итог ревью.');
        if(byId[id].depends.some(d=>clean.tasks[d]?.status!=='done'))throw Error('У принятого задания '+id+' не закрыты зависимости.');
      }
      return clean;
    }
    if(input)state=validate(input);
    const progress=id=>({status:'todo',notes:'',review:'',checks:[],spent:0,theoryRead:false,...state.tasks[id]});
    const unmet=id=>byId[id].depends.filter(d=>progress(d).status!=='done');
    const canAccept=id=>{
      const p=progress(id), reasons=[];
      if(p.checks.length!==byId[id].checks.length)reasons.push('Отметь все критерии после фактической проверки.');
      if(!p.review.trim())reasons.push('Запиши итог ревью в поле «Результат проверки».');
      if(unmet(id).length)reasons.push('Сначала прими предпосылки: '+unmet(id).join(', ')+'.');
      return reasons;
    };
    function update(id,patch){
      if(!byId[id])throw Error('Неизвестная задача.');
      if(patch.status&&!Object.hasOwn(STATUSES,patch.status))throw Error('Неизвестный статус.');
      if(patch.status==='done'){const reasons=canAccept(id);if(reasons.length)throw Error(reasons.join(' '));}
      if(patch.status && patch.status!=='done' && progress(id).status==='done') {
        const dependents=tasks.filter(t=>t.depends.includes(id)&&progress(t.id).status==='done');
        if(dependents.length)throw Error('Сначала верни на проверку принятые зависимые задачи: '+dependents.map(t=>t.id).join(', '));
      }
      const candidate={...progress(id),...patch,updatedAt:new Date().toISOString()};
      if(candidate.status==='done'&&(candidate.checks.length!==byId[id].checks.length||!candidate.review.trim()))throw Error('Сначала верни задание на проверку, затем изменяй критерии и итог.');
      state.tasks[id]=candidate;return candidate;
    }
    function filter({query='',route='all',status='all',stage='',ready=false}={}){
      const q=query.trim().toLocaleLowerCase('ru');
      return tasks.filter(t=>(route==='all'||t.route===route)&&(!stage||t.stage===stage)&&(status==='all'||progress(t.id).status===status)&&(!ready||(!unmet(t.id).length&&progress(t.id).status!=='done'))&&(!q||[t.id,t.title,t.theory,...t.topics,...t.steps].join(' ').toLocaleLowerCase('ru').includes(q)));
    }
    function stats(list=tasks){return {total:list.length,done:list.filter(t=>progress(t.id).status==='done').length,review:list.filter(t=>progress(t.id).status==='review').length,doing:list.filter(t=>progress(t.id).status==='doing').length,spent:list.reduce((n,t)=>n+progress(t.id).spent,0),min:list.reduce((n,t)=>n+t.hours[0]+t.hours[2],0),max:list.reduce((n,t)=>n+t.hours[1]+t.hours[3],0)};}
    return {data,tasks,byId,progress,unmet,canAccept,update,filter,stats,validate,export:()=>({...state,savedAt:new Date().toISOString()}),import:value=>{state=validate(value);return state;},get state(){return state;},statuses:STATUSES};
  }
  const api={createEngine,STATUSES};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.RoadmapCore=api;
})(typeof globalThis!=='undefined'?globalThis:this);
