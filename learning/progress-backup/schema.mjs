// Build-time only: compact IDs and constraints, never user progress or lesson prose.
import fs from 'node:fs/promises';
import {MAPS, COURSES} from '../catalog.mjs';
const read = async path => JSON.parse(await fs.readFile(new URL(path, import.meta.url), 'utf8'));
export async function buildBackupSchema() {
  const cpp = await read('../../source/data/roadmap.json');
  const interviews = await read('../../source/data/interviews.json');
  const nms = await read('../nms/curriculum.json');
  const books = await read('../nms/books.json');
  const radio = await read('../radio-build/data.json');
  const courses = {};
  const scopes = {};
  for (const {id} of COURSES) {
    const data = await read('../data/' + id + '.json');
    courses[id] = {id, lessons: data.lessons.map(l => ({id:l.id, acceptance:l.acceptance.map(() => ''), prerequisites:l.prerequisites}))};
  }
  for (const {id} of MAPS) {
    const data = await read(id === 'cpp' ? '../../source/data/scope.json' : '../data/' + id + '-scope.json');
    scopes[id] = data.gaps.map(g => ({id:g.id}));
  }
  return {
    cppIds: [...cpp.modules.flatMap(m => m.rows.map(t => t.code)), ...cpp.modules.flatMap(m => [`note:${m.id}`, `practice:${m.id}`, ...m.checks.map((_,i) => `check:${m.id}:${i}`)]), ...Array.from({length:30}, (_,i) => `week:${i+1}`)],
    interviewIds: interviews.cards.map(c => c.id), courses, scopes,
    nms: {roadmapId:nms.roadmapId, currentTask:nms.currentTask, seed:{}, stages:nms.stages.map(s => ({tasks:s.tasks.map(t => ({id:t.id, checks:t.checks.map(() => ''), depends:t.depends}))})), bookStudy:{workshops:books.workshops.map(w => ({id:w.id, checks:w.checks.map(() => '')}))}},
    radio: {bom:radio.bom.map(x => ({id:x.id})), phases:radio.phases.map(p => ({id:p.id, checks:p.checks.map(() => '')}))}
  };
}
