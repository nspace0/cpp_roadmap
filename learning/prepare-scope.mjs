import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {COURSES} from './catalog.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const priority=p=>['core','mandatory_core'].includes(p)?'core':['later','extension'].includes(p)?'later':'specialist';
export async function prepareCourseScopes(){
 for(const {id} of COURSES){
  const data=JSON.parse(await fs.readFile(path.join(root,'data',id+'.json'),'utf8'));
  const lessons=Object.fromEntries(data.lessons.map(l=>[l.id,l]));
  const topics=Object.fromEntries(data.lessons.map(l=>[l.id,{
   title:l.title,covered:l.covered,notCovered:l.notCovered,level:l.priority==='core'?'applied':'advanced',
   next:l.nextLevel.map(text=>{const match=/^([A-Z]+\d{2}\.\d+)(?::\s*(.*))?$/.exec(text),target=match&&lessons[match[1]];return target?{title:target.id+' · '+target.title,reason:match[2]?match[2]+'. Проверь объём и критерии связанной задачи.':'Связанная задача для следующего шага; её критерии проверяются отдельно.',target:target.id,priority:priority(target.priority)}:{title:text,reason:'Дополнительное направление; завершение текущего урока его не подтверждает.',target:null,priority:'later'};})
  }]));
  const gaps=data.gaps.map(g=>({id:g.id,title:g.title,why:g.why,priority:priority(g.priority),coveredBy:g.entryAfter||[],missing:g.missing||[],evidence:Array.isArray(g.proof)?g.proof:[g.proof].filter(Boolean),sources:(g.sources||[]).map(s=>data.sources[s]?.url||s).filter(s=>/^https:\/\//.test(s))}));
  for(const g of gaps)for(const start of g.coveredBy)if(!lessons[start])throw Error(id+': missing gap entry '+start);
  await fs.writeFile(path.join(root,'data',id+'-scope.json'),JSON.stringify({version:1,scopeNote:'Границы учебных заданий и открытый список дальнейших направлений. Отметка не является полной квалификацией.',topics,gaps},null,2)+'\n');
 }
}
