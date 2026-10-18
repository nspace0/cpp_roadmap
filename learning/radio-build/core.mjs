export function createBuildProgress(data,input){
 const items=new Set(data.bom.map(x=>x.id)),phases=Object.fromEntries(data.phases.map(x=>[x.id,x]));
 const fresh=()=>({format:'radio-build',version:1,purchases:{},steps:{},reserve:null});
 function validate(s){
  if(!s||s.format!=='radio-build'||s.version!==1)throw Error('Нужен JSON комплекта радиотелескопа версии 1.');
  const out=fresh();
  for(const field of ['purchases','steps'])if(!s[field]||typeof s[field]!=='object'||Array.isArray(s[field]))throw Error('Повреждено поле '+field);
  for(const [id,p] of Object.entries(s.purchases)){
   if(!items.has(id)||!p||typeof p.owned!=='boolean'||!(p.actual===null||Number.isFinite(p.actual)&&p.actual>=0&&p.actual<=1e7))throw Error('Неверная позиция закупки: '+id);
   out.purchases[id]={owned:p.owned,actual:p.actual};
  }
  for(const [id,p] of Object.entries(s.steps)){
   if(!Object.hasOwn(phases,id)||!p||typeof p.notes!=='string'||p.notes.length>12000||!Array.isArray(p.checks)||p.checks.some(i=>!Number.isInteger(i)||i<0||i>=phases[id].checks.length))throw Error('Неверная запись этапа: '+id);
   out.steps[id]={notes:p.notes,checks:[...new Set(p.checks)]};
  }
  if(!(s.reserve===null||Number.isFinite(s.reserve)&&s.reserve>=0&&s.reserve<=1e7))throw Error('Неверный резерв.');
  out.reserve=s.reserve;return out;
 }
 let state=input?validate(input):fresh();
 const purchase=id=>({owned:false,actual:null,...state.purchases[id]});
 const step=id=>({notes:'',checks:[],...state.steps[id]});
 function update(field,id,patch){const candidate=structuredClone(state);if(field==='purchases')candidate.purchases[id]={...purchase(id),...patch};else if(field==='steps')candidate.steps[id]={...step(id),...patch};else throw Error('Неизвестное поле');state=validate(candidate);}
 function budget(){const entered=data.bom.filter(x=>purchase(x.id).actual!==null);return {range:[0,1].map(i=>data.bom.reduce((s,x)=>s+x.price[i],0)+data.reserve[i]),entered:entered.length,total:data.bom.length,actual:entered.reduce((s,x)=>s+purchase(x.id).actual,0),reserve:state.reserve,owned:data.bom.filter(x=>purchase(x.id).owned).length,checks:data.phases.reduce((n,p)=>n+step(p.id).checks.length,0),maxChecks:data.phases.reduce((n,p)=>n+p.checks.length,0)};}
 return {purchase,step,update,budget,validate,export:()=>structuredClone(state),import:s=>{state=validate(s);},setReserve:n=>{state=validate({...state,reserve:n});}};
}
export function cableEstimate(length=20,fMHz=1420.40575,current=.120){
 if(!Number.isFinite(length)||length<0||!Number.isFinite(fMHz)||fMHz<=0||!Number.isFinite(current)||current<0)throw Error('Неверные параметры кабеля');
 const db100ft=.242080*Math.sqrt(fMHz)+.000330*fMHz;
 const loop=(10.5+12.8)*length/1000;
 return {lossDb:db100ft*length/30.48,loopOhm:loop,dropV:loop*current,lnaV:4.5-loop*current};
}
