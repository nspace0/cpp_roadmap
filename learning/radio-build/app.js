import {createBuildProgress,cableEstimate} from './core.mjs';
const data=JSON.parse(document.getElementById('build-data').textContent),key='radio-build-progress-v1';
const $=s=>document.querySelector(s);let seed=null,warning='';
try{const v=localStorage.getItem(key);if(v)seed=JSON.parse(v);}catch{warning='Сохранение недоступно; используй экспорт JSON.';}
let E;try{E=createBuildProgress(data,seed);}catch(e){E=createBuildProgress(data);warning='Прогресс не прочитан: '+e.message+' Старые данные не удалены.';}
function notice(text){$('#notice').textContent=text;}
function save(){try{localStorage.setItem(key,JSON.stringify(E.export()));notice('Отметки сохранены в этом браузере.');}catch{notice('Сохранение недоступно. Экспортируй JSON перед закрытием.');}}
const money=n=>new Intl.NumberFormat('ru-RU').format(n)+' ₽';
function totals(){const b=E.budget();$('#estimate').textContent=money(b.range[0])+' – '+money(b.range[1]);$('#actual').textContent=money(b.actual+(b.reserve??0));$('#actual-label').textContent='Введено '+b.entered+' / '+b.total+' позиций; '+(b.reserve===null?'резерв не указан.':'резерв включён.');$('#owned').textContent=b.owned+' / '+b.total;$('#checked').textContent=b.checks+' / '+b.maxChecks;}
function hydrate(){
 for(const row of data.bom){const p=E.purchase(row.id);$('#owned-'+row.id).checked=p.owned;$('#price-'+row.id).value=p.actual??'';}
 for(const phase of data.phases){const p=E.step(phase.id);$('#notes-'+phase.id).value=p.notes;document.querySelectorAll('[data-phase="'+phase.id+'"]').forEach(el=>el.checked=p.checks.includes(Number(el.dataset.check)));}
 $('#reserve').value=E.export().reserve??'';totals();
}
function download(){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(E.export(),null,2)],{type:'application/json'}));a.href=url;a.download='radio-build-progress.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
document.addEventListener('change',async e=>{
 const el=e.target;
 try{
  if(el.dataset.owned){E.update('purchases',el.dataset.owned,{owned:el.checked});save();totals();}
  if(el.dataset.price){E.update('purchases',el.dataset.price,{actual:el.value===''?null:Number(el.value)});save();totals();}
  if(el.dataset.phase){const p=E.step(el.dataset.phase),n=Number(el.dataset.check);E.update('steps',el.dataset.phase,{checks:el.checked?[...new Set([...p.checks,n])]:p.checks.filter(x=>x!==n)});save();totals();}
  if(el.id==='reserve'){E.setReserve(el.value===''?null:Number(el.value));save();totals();}
  if(el.id==='import'){
   const f=el.files[0];if(!f)return;if(f.size>1000000)throw Error('Файл больше 1 МБ.');
   const clean=E.validate(JSON.parse(await f.text()));if(!confirm('Заменить отметки комплекта? Перед заменой сохраним резервную копию в этом браузере.'))return;
   localStorage.setItem(key+'-before-import',JSON.stringify(E.export()));E.import(clean);save();hydrate();
  }
 }catch(err){notice('Не сохранено: '+err.message);hydrate();}finally{if(el.id==='import')el.value='';}
});
document.addEventListener('input',e=>{const el=e.target;if(el.dataset.notes){try{E.update('steps',el.dataset.notes,{notes:el.value});save();}catch(err){notice(err.message);}}if(el.id==='length')renderCable();});
$('#export').addEventListener('click',download);$('#print').addEventListener('click',()=>window.print());
function renderCable(){const length=Number($('#length').value);if(!Number.isFinite(length)||length<1||length>30){$('#cable-result').textContent='Укажи от 1 до 30 метров.';return;}const c=cableEstimate(length);$('#cable-result').textContent=length+' м: потери ≈'+c.lossDb.toFixed(2)+' dB; петля DC ≈'+c.loopOhm.toFixed(3)+' Ω; падение при 120 mA ≈'+c.dropV.toFixed(3)+' V; расчётное питание LNA ≈'+c.lnaV.toFixed(2)+' V. Разъёмы и допуски источника не учтены.';}
hydrate();renderCable();if(warning)notice(warning);
