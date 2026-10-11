import {useEffect,useRef,useState,type ReactNode} from 'react';
import {ArrowLeft,ArrowRight,BookOpen,Check,CheckCircle2,Clock,Copy,ExternalLink,FileText,GraduationCap,Lightbulb,Printer} from 'lucide-react';
import {type Lesson,readingMinutes} from './lessons';
import {type Topic,type Mod,range,difficulty} from './map-config';

// A small safe inline renderer: lesson text stays text, never executable HTML.
export function Inline({text}:{text:string}){
 return <>{text.split(/(`[^`\n]+`|\*\*[^*\n]+\*\*)/g).map((part,i)=>part.startsWith('`')&&part.endsWith('`')?<code key={i}>{part.slice(1,-1)}</code>:part.startsWith('**')&&part.endsWith('**')?<strong key={i}>{part.slice(2,-2)}</strong>:part)}</>;
}
function Paragraphs({text}:{text:string}){return <>{text.split(/\n\n+/).filter(Boolean).map((p,i)=><p key={i}><Inline text={p}/></p>)}</>}
function Items({items,ordered=false}:{items:string[];ordered?:boolean}){const children=items.map((x,i)=><li key={i}><Inline text={x}/></li>);return ordered?<ol>{children}</ol>:<ul>{children}</ul>}

type Props={lesson:Lesson;topic:Topic;module:Mod;status:number;disabled:boolean;onStatus:(n:number)=>void;onTopic:(code:string)=>void;onBack:()=>void};
export default function LessonReader({lesson,topic,module,status,disabled,onStatus,onTopic,onBack}:Props){
 const body=useRef<HTMLDivElement>(null);
 const [copied,setCopied]=useState(false),[copyError,setCopyError]=useState('');
 const index=module.rows.findIndex(t=>t.code===topic.code),previous=module.rows[index-1],next=module.rows[index+1];
 useEffect(()=>{body.current?.scrollTo({top:0});setCopied(false);setCopyError('')},[topic.code]);
 useEffect(()=>{let expanded:[HTMLDetailsElement,boolean][]=[];const before=()=>{expanded=Array.from(body.current?.querySelectorAll('details')||[]).map(el=>[el,el.open]);expanded.forEach(([el])=>el.open=true)};const after=()=>expanded.forEach(([el,open])=>el.open=open);window.addEventListener('beforeprint',before);window.addEventListener('afterprint',after);return()=>{window.removeEventListener('beforeprint',before);window.removeEventListener('afterprint',after)}},[]);
 function jump(id:string){body.current?.querySelector<HTMLElement>(`[data-lesson-section="${id}"]`)?.scrollIntoView({block:'start',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'})}
 async function copy(){try{await navigator.clipboard.writeText(lesson.example.code);setCopied(true);setCopyError('')}catch{setCopyError('Выдели пример и скопируй его вручную.')}}
 function section(id:string,title:string,children:ReactNode){return <section className="lesson-section" data-lesson-section={id} aria-labelledby={`lesson-${id}`}><div className="lesson-section-label">{id==='theory'?'01':id==='example'?'02':id==='practice'?'03':id==='questions'?'04':'05'}</div><h2 id={`lesson-${id}`}>{title}</h2>{children}</section>}
 return <div className="lesson-layout">
  <nav className="lesson-nav" aria-label="Разделы урока">
   <button onClick={()=>jump('theory')}>Теория</button><button onClick={()=>jump('example')}>Пример</button><button onClick={()=>jump('practice')}>Практика</button><button onClick={()=>jump('questions')}>Проверка</button><button onClick={()=>jump('resources')}>Источники</button>
   <button className="lesson-print" onClick={()=>window.print()} aria-label="Распечатать урок"><Printer size={17}/></button>
  </nav>
  <div className="lesson-body" ref={body}>
   <div className="lesson-reading-meta"><span><Clock size={15}/>{readingMinutes(lesson)} мин чтения с разбором</span><span className={`difficulty d-${topic.level.split(' ')[0]}`}>{difficulty[topic.level.split(' ')[0]]||topic.level}</span><span>Практика: {range(topic.practice)} ч по плану</span></div>
   <p className="lesson-context"><b>Опора для урока:</b> {module.need} · тема {index+1} из {module.rows.length} в модуле.</p>
   <div className="lesson-outcomes"><div><GraduationCap size={21}/><h2>После урока ты сможешь</h2></div><Items items={lesson.outcomes}/></div>
   {section('theory','Разбираемся в теме',<>{lesson.sections.map((s,i)=><section className="lesson-theory-block" key={i}><h3>{s.title}</h3>{s.paragraphs.map((p,j)=><Paragraphs text={p} key={j}/>)}{s.bullets?.length?<Items items={s.bullets}/>:null}</section>)}<aside className="lesson-pitfalls"><h3><Lightbulb size={19}/>На чём легко ошибиться</h3><Items items={lesson.pitfalls}/></aside></>)}
   {section('example',lesson.example.title,<><Paragraphs text={lesson.example.intro}/><div className="lesson-code"><div className="lesson-codebar"><span>{lesson.example.language}</span><button onClick={()=>void copy()}>{copied?<Check size={15}/>:<Copy size={15}/>} {copied?'Скопировано':'Копировать'}</button></div><pre tabIndex={0} aria-label="Пример кода или расчёта"><code>{lesson.example.code}</code></pre></div>{copyError&&<p role="status">{copyError}</p>}<h3>Почему это работает</h3><Items items={lesson.example.explanation} ordered/></>)}
   {section('practice','Попробуй самостоятельно',<><Paragraphs text={lesson.practice.task}/><Items items={lesson.practice.steps} ordered/><div className="lesson-criteria"><h3>Как проверить результат</h3><Items items={lesson.practice.criteria}/></div><details className="lesson-answer"><summary><FileText size={17}/>Показать разбор задания</summary><div><Paragraphs text={lesson.practice.solution}/></div></details></>)}
   {section('questions','Проверь понимание',<><p className="lesson-muted">Сначала ответь своими словами, затем открой объяснение.</p>{lesson.questions.map((q,i)=><details key={`${topic.code}-${i}`} className="lesson-answer"><summary><span className="question-number">{i+1}</span><span className="question-text"><Inline text={q.question}/></span></summary><div><Paragraphs text={q.answer}/></div></details>)}</>)}
   {section('resources','Если хочешь углубиться',<><p className="lesson-muted">Основной материал уже в уроке. Здесь — дополнительные объяснения и первоисточники. Язык ссылки указан отдельно.</p><div className="lesson-resources">{[...lesson.resources].sort((a,b)=>a.language===b.language?0:a.language==='ru'?-1:1).map((r,i)=><a key={i} className="lesson-resource" href={r.url} target="_blank" rel="noopener noreferrer"><span className={`resource-language ${r.language==='ru'?'russian':''}`}>{r.language==='ru'?'РУС':'ENG'}</span><span><strong>{r.title}</strong><small>{r.focus}</small></span><ExternalLink size={16}/></a>)}</div></>)}
   <div className="lesson-completion"><div><CheckCircle2 size={23}/><span><b>{status===2?'Тема отмечена пройденной':'Закрепи материал практикой'}</b><small>Отметка остаётся за тобой: чтение само по себе не завершает тему.</small></span></div><div className="lesson-status-actions"><button disabled={disabled} onClick={()=>onStatus(status===1?0:1)}>{status===1?'Отменить «Изучаю»':'Изучаю'}</button><button className="primary-button" disabled={disabled} onClick={()=>onStatus(status===2?0:2)}>{status===2?'Снять отметку':'Понял и выполнил практику'}</button></div></div>
   <div className="lesson-pagination"><button disabled={!previous} onClick={()=>previous&&onTopic(previous.code)}><ArrowLeft size={17}/><span><small>Предыдущая тема</small><b>{previous?.title||'Начало модуля'}</b></span></button><button disabled={!next} onClick={()=>next&&onTopic(next.code)}><span><small>Следующая тема</small><b>{next?.title||'Модуль завершён'}</b></span><ArrowRight size={17}/></button></div>
   <button className="lesson-return" onClick={onBack}><BookOpen size={17}/>Вернуться ко всем темам модуля {module.id}</button>
  </div>
 </div>;
}
