export const statuses={todo:'Не начато',reading:'Изучаю теорию',practice:'Практикуюсь',review:'На проверке',done:'Принято по результату'};
export function createCourse(data,input){
 const lessons=data.lessons,byId=Object.fromEntries(lessons.map(l=>[l.id,l]));
 const fresh=()=>({format:'hands-on-roadmap',version:1,id:data.id,current:lessons[0].id,hoursPerWeek:15,planned:[lessons[0].id],lessons:{}});
 function validate(value){
  if(!value||value.format!=='hands-on-roadmap'||value.version!==1||value.id!==data.id||!value.lessons||typeof value.lessons!=='object'||Array.isArray(value.lessons))throw Error('Нужен файл прогресса именно этой карты.');
  const s=fresh();if(!Object.hasOwn(byId,value.current))throw Error('Неизвестная текущая задача.');s.current=value.current;
  if(!Number.isFinite(value.hoursPerWeek)||value.hoursPerWeek<1||value.hoursPerWeek>60)throw Error('Нагрузка должна быть от 1 до 60 часов.');s.hoursPerWeek=value.hoursPerWeek;
  if(!Array.isArray(value.planned)||value.planned.length>lessons.length||value.planned.some(id=>!Object.hasOwn(byId,id)))throw Error('Неизвестные задания в плане.');s.planned=[...new Set(value.planned)];
  for(const [id,p] of Object.entries(value.lessons)){
   if(!Object.hasOwn(byId,id)||!p||!Object.hasOwn(statuses,p.status)||typeof p.notes!=='string'||p.notes.length>12000||typeof p.evidence!=='string'||p.evidence.length>12000||!Number.isFinite(p.hours)||p.hours<0||p.hours>10000||!Array.isArray(p.checks)||p.checks.some(n=>!Number.isInteger(n)||n<0||n>=byId[id].acceptance.length))throw Error('Повреждена запись задания '+id);
   s.lessons[id]={status:p.status,notes:p.notes,evidence:p.evidence,hours:p.hours,checks:[...new Set(p.checks)]};
  }
  for(const [id,p] of Object.entries(s.lessons))if(p.status==='done'&&(p.checks.length!==byId[id].acceptance.length||!p.evidence.trim()||byId[id].prerequisites.some(dep=>s.lessons[dep]?.status!=='done')))throw Error('Для принятого задания нужны критерии, результат проверки и принятые предпосылки: '+id);
  return s;
 }
 let state=input?validate(input):fresh();
 const progress=id=>({status:'todo',notes:'',evidence:'',hours:0,checks:[],...state.lessons[id]});
 function update(id,patch){if(!Object.hasOwn(byId,id))throw Error('Неизвестное задание.');const next=JSON.parse(JSON.stringify(state));next.lessons[id]={...progress(id),...patch};state=validate(next);return progress(id);}
 function edit(patch){state=validate({...state,...patch});}
 const stats=()=>({total:lessons.length,done:lessons.filter(l=>progress(l.id).status==='done').length,active:lessons.filter(l=>['reading','practice','review'].includes(progress(l.id).status)).length,hours:lessons.reduce((sum,l)=>sum+progress(l.id).hours,0)});
 return {byId,progress,update,edit,stats,validate,import:value=>{state=validate(value);return state;},export:()=>JSON.parse(JSON.stringify(state)),get state(){return state;}};
}
