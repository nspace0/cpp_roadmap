import raw from '@/data/interviews.json';

export type InterviewExample={title:string;language:string;kind:'run'|'compile'|'illustrative'|'text';code:string;expected:string;explanation:string[];flags?:string[]};
export type InterviewCard={
 id:string;title:string;category:string;level:string;standards:string[];topicCodes:string[];
 shortAnswer:string;explanation:{title:string;paragraphs:string[]}[];example:InterviewExample;
 followUps:{question:string;answer:string}[];pitfalls:string[];
 practice:{task:string;criteria:string[];solution:string};
 variants:{number:number;question:string;answer:string;sourceUrl?:string|null}[];
 resources:{title:string;url:string;focus:string}[];clarification?:string;
};
export const interviewCards=raw.cards as InterviewCard[];
export const interviewById=Object.fromEntries(interviewCards.map(c=>[c.id,c]));
export const interviewSource=raw.source;
export const interviewCategories:Record<string,string>={containers:'Контейнеры и алгоритмы',ownership:'Память и владение',exceptions:'Исключения и время жизни',language:'Язык и сборка',design:'ООП, проекты и собеседование',systems:'Потоки и системные темы'};
export const interviewStatuses=['Не разбирал','Разобрал','Объясняю без подсказки','Выполнил практику'] as const;
export const interviewsByTopic:Record<string,InterviewCard[]>={};
for(const c of interviewCards)for(const code of c.topicCodes)(interviewsByTopic[code]??=[]).push(c);
export const interviewSearch=Object.fromEntries(interviewCards.map(c=>[c.id,[c.id,c.title,c.shortAnswer,...c.topicCodes,...c.standards,...c.variants.flatMap(v=>[String(v.number),v.question]),...c.explanation.flatMap(s=>[s.title,...s.paragraphs]),...c.followUps.map(q=>q.question)].join(' ').toLocaleLowerCase('ru')]));
export type InterviewFilter={query?:string;category?:string;topic?:string;status?:string};
export function filterInterviews(cards:InterviewCard[],entries:Record<string,{status:number}>,filter:InterviewFilter){
 const terms=(filter.query||'').toLocaleLowerCase('ru').trim().split(/\s+/).filter(Boolean);
 return cards.filter(c=>(!filter.category||c.category===filter.category)&&(!filter.topic||c.topicCodes.includes(filter.topic))&&(!filter.status||String(entries[c.id]?.status??0)===filter.status)&&terms.every(t=>interviewSearch[c.id].includes(t)));
}
