import {mountScope} from './scope-kit.mjs';
const data=JSON.parse(document.getElementById('scope-data').textContent);
mountScope({id:'nms',title:'Разработка Network Monitor',data,status:id=>{const s=window.NMSRoadmap.engine.progress(id).status;return s==='done'?2:s==='todo'?0:1;},openTopic:id=>window.NMSRoadmap.openTask(id)});
