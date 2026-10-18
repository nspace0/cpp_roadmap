import {esc} from './scope-kit.mjs';
const ordered=items=>'<ol>'+items.map(x=>'<li>'+esc(x)+'</li>').join('')+'</ol>';
export function glossaryBlock(lesson){
 if(!lesson.glossary?.length)return '';
 return '<section class="lesson-glossary"><h3>Словарь перед примером</h3><dl>'+lesson.glossary.map(x=>'<div><dt>'+esc(x.term)+'</dt><dd>'+esc(x.definition)+'</dd></div>').join('')+'</dl></section>';
}
export function walkthroughBlock(lesson){
 let html='';
 if(lesson.walkthrough?.length)html+='<section class="lesson-walkthrough"><h3>Разбор по шагам</h3>'+ordered(lesson.walkthrough)+'</section>';
 if(lesson.pitfalls?.length)html+='<aside class="lesson-pitfalls"><h3>Типичные ошибки</h3>'+ordered(lesson.pitfalls)+'</aside>';
 return html;
}
export function answersBlock(lesson){
 if(!lesson.defenseAnswers?.length)return '';
 return '<section class="lesson-answers"><h3>Проверь своё объяснение</h3><p class="muted">Сначала сформулируй ответ самостоятельно. Затем раскрой пояснение и сравни ход рассуждений.</p>'+lesson.defenseAnswers.map((item,i)=>{
 const a=typeof item==='string'?{question:lesson.defense?.[i]||'Вопрос '+(i+1),answer:item}:item;
 return '<details><summary>'+esc(a.question)+'</summary><p>'+esc(a.answer)+'</p></details>';
 }).join('')+'</section>';
}

