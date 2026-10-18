import {useEffect,useMemo,useRef,useState} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Check,Copy,Download,ExternalLink,MessageSquare,Printer,Search,Shuffle,Upload,X} from 'lucide-react';
import {Inline} from './lesson-reader';
import {allTopics} from './map-config';
import {downloadText} from './local-progress';
import {interviewCards,interviewById,interviewCategories,interviewSource,interviewStatuses,filterInterviews,type InterviewCard} from './interview-data';
import {INTERVIEW_KEY,INTERVIEW_EVENT,loadInterviewProgress,saveInterviewProgress,interviewSnapshot,validateInterviewSnapshot,importInterviewProgress,type InterviewEntry,type InterviewSnapshot} from './interview-progress';

const topicTitles=Object.fromEntries(allTopics.map(t=>[t.code,t.title]));
const topicOptions=[...new Set(interviewCards.flatMap(c=>c.topicCodes))].sort((a,b)=>a.localeCompare(b,'ru',{numeric:true}));
function Text({value}:{value:string}){return <>{value.split(/\n\n+/).map((p,i)=><p key={i}><Inline text={p}/></p>)}</>}
function Items({items}:{items:string[]}){return <ul>{items.map((item,i)=><li key={i}><Inline text={item}/></li>)}</ul>}

type Props={selectedId:string;topic:string;onSelect:(id:string,topic?:string)=>void;onTopic:(code:string)=>void};
export default function InterviewBank({selectedId,topic,onSelect,onTopic}:Props){
 const [entries,setEntries]=useState<Record<string,InterviewEntry>>({}),[ready,setReady]=useState(false),[warning,setWarning]=useState(''),[problem,setProblem]=useState(''),[message,setMessage]=useState('');
 const [query,setQuery]=useState(''),[category,setCategory]=useState(''),[status,setStatus]=useState(''),[topicFilter,setTopicFilter]=useState(topic);
 const [rehearsal,setRehearsal]=useState(false),[revealed,setRevealed]=useState(true),[promptNumber,setPromptNumber]=useState<number|null>(null),[copied,setCopied]=useState(false);
 const [staged,setStaged]=useState<InterviewSnapshot|null>(null);
 const input=useRef<HTMLInputElement>(null),reader=useRef<HTMLElement>(null),readerTitle=useRef<HTMLHeadingElement>(null);
 const card=interviewById[selectedId];
 useEffect(()=>setTopicFilter(topic),[topic]);
 useEffect(()=>{
  const sync=()=>{try{const data=loadInterviewProgress();setEntries(data.entries);setWarning(data.warning);setReady(true);}catch(e){setProblem((e as Error).message);}};
  const storage=(e:StorageEvent)=>{if(e.key===INTERVIEW_KEY)sync();};
  sync();window.addEventListener('storage',storage);window.addEventListener(INTERVIEW_EVENT,sync);
  return()=>{window.removeEventListener('storage',storage);window.removeEventListener(INTERVIEW_EVENT,sync);};
 },[]);
 useEffect(()=>{
  if(!card)return;
  readerTitle.current?.focus({preventScroll:true});reader.current?.scrollIntoView({block:'start'});setCopied(false);setMessage('');
  document.body.classList.add('interview-reader-open');
  let opened:[HTMLDetailsElement,boolean][]=[];
  const before=()=>{opened=Array.from(reader.current?.querySelectorAll('details')||[]).map(el=>[el,el.open]);opened.forEach(([el])=>el.open=true);};
  const after=()=>opened.forEach(([el,open])=>el.open=open);
  window.addEventListener('beforeprint',before);window.addEventListener('afterprint',after);
  return()=>{document.body.classList.remove('interview-reader-open');window.removeEventListener('beforeprint',before);window.removeEventListener('afterprint',after);};
 },[selectedId]);
 const filtered=useMemo(()=>filterInterviews(interviewCards,entries,{query,category,topic:topicFilter,status}),[entries,query,category,topicFilter,status]);
 const stats=[0,1,2,3].map(s=>interviewCards.filter(c=>(entries[c.id]?.status??0)===s).length);
 const currentEntry=card?entries[card.id]:undefined;
 const prompt=card?.variants.find(v=>v.number===promptNumber);
 const currentIndex=filtered.findIndex(c=>c.id===selectedId);
 function browse(id:string){setRehearsal(false);setRevealed(true);setPromptNumber(null);onSelect(id,topicFilter);}
 function random(){
  const available=filtered.filter(c=>c.id!==selectedId),pool=available.length?available:filtered;if(!pool.length)return;
  const c=pool[Math.floor(Math.random()*pool.length)],v=c.variants[Math.floor(Math.random()*c.variants.length)];
  setRehearsal(true);setRevealed(false);setPromptNumber(v.number);onSelect(c.id,topicFilter);
 }
 function update(change:{status?:number;notes?:string}){
  if(!card)return;try{const data=saveInterviewProgress(card.id,change);setEntries(data.entries);setWarning(data.durable?'':'Автосохранение недоступно. Скачай JSON или HTML с прогрессом.');setProblem('');}catch(e){setProblem((e as Error).message);}
 }
 function exportFile(){loadInterviewProgress();downloadText(JSON.stringify(interviewSnapshot(),null,2),`C_CPP_Interview_${new Date().toISOString().slice(0,10)}.json`,'application/json;charset=utf-8');setMessage('JSON прогресса собеседования подготовлен.');}
 async function readFile(file?:File){
  if(!file)return;setStaged(null);setMessage('');setProblem('');try{if(file.size>5*1024*1024)throw Error('Максимальный размер JSON — 5 МБ.');setStaged(validateInterviewSnapshot(JSON.parse(await file.text())));}catch(e){setProblem((e as Error).message);}finally{if(input.current)input.current.value='';}
 }
 async function copy(){if(!card)return;try{await navigator.clipboard.writeText(card.example.code);setCopied(true);setProblem('');}catch{setProblem('Автоматическое копирование недоступно. Выдели код и скопируй вручную.');}}
 function resetFilters(){setQuery('');setCategory('');setStatus('');setTopicFilter('');onSelect('', '');}
 return <div className="interview-bank">
  <div className="interview-intro">
   <div><span className="interview-overline"><MessageSquare size={16}/>ОТ ВОПРОСА К ПОНИМАНИЮ</span><h2>{interviewSource.questionCount} вопросов · {interviewCards.length} разборов</h2><p>Теория, примеры, дополнительные вопросы и практика. Повторы объединены; каждая исходная формулировка сохранена и разобрана.</p></div>
   <div className="interview-score"><b>{stats[2]+stats[3]}<small> / {interviewCards.length}</small></b><span>могу объяснить без подсказки</span><small>{stats[3]} разборов закреплено практикой</small></div>
  </div>
  <div className="interview-tools"><button onClick={random} disabled={!filtered.length}><Shuffle size={16}/>Репетиция</button><button onClick={exportFile} disabled={!ready}><Download size={16}/>Экспорт отметок</button><button onClick={()=>input.current?.click()}><Upload size={16}/>Импорт отметок</button><input ref={input} className="offline-hidden" type="file" accept=".json,application/json" aria-label="JSON прогресса собеседования" onChange={e=>void readFile(e.target.files?.[0])}/></div>
  {warning&&<p className="interview-alert" role="alert">{warning}</p>}{problem&&<p className="interview-alert" role="alert">{problem}</p>}{message&&<p className="interview-message" role="status">{message}</p>}
  {staged&&<div className="interview-import"><b>В файле {staged.entries.length} отметок</b><p>Объединим их с текущими: для одного разбора сохранится более поздняя запись. Прогресс уроков не изменится.</p><button className="primary-button" onClick={()=>{try{const data=importInterviewProgress(staged);setEntries(data.entries);setWarning(data.durable?'':'Импорт сохранён в памяти окна. Скачай копию перед закрытием.');setStaged(null);setMessage('Прогресс собеседования объединён.');setProblem('');}catch(e){setProblem((e as Error).message);}}}>Объединить</button><button onClick={()=>setStaged(null)}>Отмена</button></div>}
  {!card&&<>
   <details className="interview-scope"><summary>Как заниматься и что эта колода не покрывает</summary><div><p>Сначала изучи связанные уроки, затем ответь вслух без подсказки. Открой разбор, проверь уточнения и выполни практику. Статусы — твоя самооценка по {interviewCards.length} разборам, а не результат проверки из чата и не процент знания C/C++.</p><p>Колода преимущественно про C++. Она не заменяет подготовку по C, алгоритмические задачи, сетевые протоколы, Linux и разработку проекта. Новые вопросы добавляй и по требованиям конкретной вакансии.</p><div className="interview-topic-links">{['1.2','1.4','1.6','3.4','4.1','5.3','8.1','Y1.1','Y1.2'].map(code=><button key={code} onClick={()=>onTopic(code)}>{code} · {topicTitles[code]}</button>)}</div><p>У каждого урока также есть «Что ещё изучить». Исходные проценты колоды Anki не перенесены в отметки. Прогресс собеседования хранится отдельно в этом браузере; JSON этой вкладки переносит только его. «Мои файлы → Скачать HTML с прогрессом» включает и учебную карту, и собеседование. Автоматической синхронизации между устройствами нет.</p></div></details>
   <div className="interview-filters"><label className="interview-search"><Search size={17}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Вопрос, термин или номер: noexcept, IQ006…" aria-label="Поиск вопросов собеседования"/>{query&&<button aria-label="Очистить поиск вопросов" onClick={()=>setQuery('')}><X size={16}/></button>}</label><label><span>Раздел</span><select value={category} onChange={e=>setCategory(e.target.value)}><option value="">Все разделы</option>{Object.entries(interviewCategories).map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label><label><span>Готовность</span><select value={status} onChange={e=>setStatus(e.target.value)}><option value="">Все отметки</option>{interviewStatuses.map((s,i)=><option key={s} value={i}>{s}</option>)}</select></label><label><span>Урок роадмапа</span><select value={topicFilter} onChange={e=>setTopicFilter(e.target.value)}><option value="">Все связанные уроки</option>{topicOptions.map(code=><option key={code} value={code}>{code} · {topicTitles[code]}</option>)}</select></label></div>
   <div className="interview-list-caption"><span>Найдено {filtered.length} разборов · {filtered.reduce((n,c)=>n+c.variants.length,0)} исходных вопросов</span>{(query||category||status||topicFilter)&&<button onClick={resetFilters}>Сбросить фильтры</button>}</div>
   {filtered.length?<div className="interview-grid">{filtered.map(c=><button className={`interview-card interview-state-${entries[c.id]?.status??0}`} key={c.id} onClick={()=>browse(c.id)}><div><span>{c.id} · {interviewCategories[c.category]}</span><b>{c.variants.length}</b></div><h3>{c.title}</h3><p>{c.variants[0]?.question}</p><footer><span>{interviewStatuses[entries[c.id]?.status??0]}</span><ArrowRight size={17}/></footer></button>)}</div>:<div className="interview-empty"><p>Под эти фильтры пока нет вопросов.</p><button onClick={resetFilters}>Показать весь банк</button></div>}
  </>}
  {!!selectedId&&!card&&<p className="interview-alert">Такой разбор не найден. Выбери вопрос из списка.</p>}
  {card&&<article ref={reader} className="interview-reader">
   <div className="interview-reader-tools"><button onClick={()=>browse('')}><ArrowLeft size={17}/>Все вопросы</button><span>{card.id} · {interviewCategories[card.category]}</span><button onClick={()=>window.print()}><Printer size={17}/><span>Печать</span></button></div>
   <header><div className="interview-tags"><span>{card.level}</span>{card.standards.map(s=><span key={s}>{s}</span>)}<span>{card.variants.length} исходных вопросов</span></div><h2 ref={readerTitle} tabIndex={-1}>{rehearsal&&prompt?prompt.question:card.title}</h2>{rehearsal&&<p className="interview-rehearsal">Ответь вслух за 30–60 секунд. Объясни причину и приведи пример; затем сравни с разбором.</p>}<div className="interview-topic-links">{card.topicCodes.map(code=><button key={code} onClick={()=>onTopic(code)}><BookOpen size={14}/>{code} · {topicTitles[code]}</button>)}</div></header>
   {rehearsal&&!revealed&&<div className="interview-reveal"><button className="primary-button" onClick={()=>setRevealed(true)}>Показать ответ и подробный разбор</button></div>}
   <div className="interview-answers" hidden={!revealed}>
    {card.clarification&&<aside className="interview-clarification"><b>Уточнение формулировки</b><Text value={card.clarification}/></aside>}
    <section className="interview-short"><h3>Ответ на собеседовании</h3><Text value={prompt?.answer||card.shortAnswer}/>{prompt&&<details><summary>Общий ответ по теме</summary><Text value={card.shortAnswer}/></details>}</section>
    <section><h3>Подробный разбор</h3>{card.explanation.map((s,i)=><div key={i} className="interview-explanation"><h4>{s.title}</h4>{s.paragraphs.map((p,j)=><Text value={p} key={j}/>)}</div>)}</section>
    <section><h3>{card.example.title}</h3><div className="interview-code"><div><span>{card.example.language} · {card.example.kind==='run'?'самостоятельная программа':card.example.kind==='compile'?'проверка компиляции':card.example.kind==='text'?'пример ответа или сценария':'иллюстрация, см. ограничения'}</span><button onClick={()=>void copy()}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Скопировано':'Копировать'}</button></div><pre tabIndex={0}><code>{card.example.code}</code></pre></div><h4>Результат и ограничения</h4><Text value={card.example.expected}/><Items items={card.example.explanation}/></section>
    <section><h3>Что могут спросить дальше</h3>{card.followUps.map((q,i)=><details className="interview-detail" key={i}><summary><Inline text={q.question}/></summary><div><Text value={q.answer}/></div></details>)}</section>
    <section className="interview-pitfalls"><h3>Частые ошибки</h3><Items items={card.pitfalls}/></section>
    <section><h3>Самостоятельная практика</h3><Text value={card.practice.task}/><h4>Критерии проверки</h4><Items items={card.practice.criteria}/><details className="interview-detail"><summary>Разбор практического задания</summary><div><Text value={card.practice.solution}/></div></details></section>
    <section><h3>Все исходные вопросы этой группы</h3><p className="interview-muted">Формулировки из C_C++.apkg сохранены, включая неточности. Ответ под каждой уточняет именно этот вопрос.</p>{card.variants.map(v=><details className="interview-detail" key={v.number} open={prompt?.number===v.number?true:undefined}><summary><span className="interview-prompt-number">{v.number}</span><Inline text={v.question}/></summary><div><Text value={v.answer}/>{v.sourceUrl&&<a className="interview-origin" href={v.sourceUrl} target="_blank" rel="noopener noreferrer">Ссылка, указанная в исходной колоде <ExternalLink size={12}/></a>}</div></details>)}</section>
    {card.resources.length>0&&<section><h3>Первоисточники и дальнейшее чтение</h3><p className="interview-muted">Объяснения и примеры написаны для этой карты. Условия конкретного стандарта и платформы сверяй по ссылкам.</p><div className="interview-resources">{card.resources.map((r,i)=><a key={i} href={r.url} target="_blank" rel="noopener noreferrer"><b>{r.title}</b><span>{r.focus}</span><ExternalLink size={15}/></a>)}</div></section>}
   </div>
   <section className="interview-self-assessment"><h3>Моя готовность по этому разбору</h3><p>Чтение ответа не меняет отметку автоматически. «Практика» означает самостоятельное выполнение критериев выше.</p><div className="interview-status-buttons">{interviewStatuses.map((s,i)=><button key={s} disabled={!ready} aria-pressed={(currentEntry?.status??0)===i} onClick={()=>update({status:i})}>{i>0&&<Check size={14}/>} {s}</button>)}</div><label htmlFor="interview-notes">Мой ответ, ссылка на код и что осталось уточнить</label><textarea id="interview-notes" maxLength={12000} value={currentEntry?.notes??''} disabled={!ready} onChange={e=>update({notes:e.target.value})} placeholder="Например: объяснил rehash, но пока путаю итераторы и ссылки. Код упражнения: …"/><small>Сохраняется в этом браузере. Проверку решения в чате нужно отметить вручную.</small></section>
   <footer className="interview-pagination"><button disabled={currentIndex<=0} onClick={()=>browse(filtered[currentIndex-1].id)}><ArrowLeft size={16}/>Предыдущий</button><button onClick={random} disabled={!filtered.length}><Shuffle size={16}/>Другой вопрос</button><button disabled={currentIndex<0||currentIndex>=filtered.length-1} onClick={()=>browse(filtered[currentIndex+1].id)}>Следующий<ArrowRight size={16}/></button></footer>
  </article>}
 </div>;
}
