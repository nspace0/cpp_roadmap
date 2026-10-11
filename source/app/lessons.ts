import content from '@/data/lessons.json';
import notes from '@/data/module-lessons.json';

export type Resource = {title:string;url:string;language:'ru'|'en';focus:string};
export type Lesson = {
 summary:string;
 outcomes:string[];
 sections:{title:string;paragraphs:string[];bullets?:string[]}[];
 example:{title:string;language:string;intro:string;code:string;explanation:string[]};
 practice:{task:string;steps:string[];solution:string;criteria:string[]};
 questions:{question:string;answer:string}[];
 pitfalls:string[];
 resources:Resource[];
 related?:string[];
};
export type ModuleLesson = {orientation:string;capstone:string;readyWhen:string[]};
export const lessons=content as Record<string,Lesson>;
export const moduleLessons=notes as Record<string,ModuleLesson>;
export const lessonCount=Object.keys(lessons).length;
// Build the index once; searching stays local even in the downloaded HTML.
export const lessonSearchText=Object.fromEntries(Object.entries(lessons).map(([id,l])=>[id,[l.summary,...l.outcomes,...l.sections.flatMap(s=>[s.title,...s.paragraphs,...(s.bullets||[])]),l.example.title,l.example.intro,l.example.code,...l.example.explanation,l.practice.task,l.practice.solution,...l.questions.flatMap(q=>[q.question,q.answer]),...l.pitfalls].join(' ').toLowerCase()]));
export function readingMinutes(lesson:Lesson){
 const text=[lesson.summary,...lesson.outcomes,...lesson.sections.flatMap(s=>[s.title,...s.paragraphs,...(s.bullets||[])]),lesson.example.intro,...lesson.example.explanation,...lesson.pitfalls].join(' ');
 return Math.max(4,Math.ceil(text.split(/\s+/).length/110));
}
