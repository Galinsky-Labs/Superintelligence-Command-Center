import test from 'node:test';import assert from 'node:assert/strict';
import {GOAL_TEMPLATES,templateSpec,evaluateChecklist,mapLimited} from '../components/templates.mjs';
test('templates produce engine specs with inputs and model; checklists need real node evidence',()=>{
 for(const t of GOAL_TEMPLATES){const s=templateSpec(t,{model:{provider:'p',model:'m'}});assert.ok(s.nodes.length>=2);for(const c of t.checklist)assert.ok(s.nodes.some(n=>n.key===c.node),t.id+':'+c.node);}
 const t=GOAL_TEMPLATES[0];
 assert.deepEqual(evaluateChecklist(t,{nodes:[{key:'questions',state:'succeeded'},{key:'report',state:'succeeded',artifactId:null}]}).map(c=>c.done),[true,false]);
 assert.deepEqual(evaluateChecklist(t,{nodes:[{key:'questions',state:'succeeded'},{key:'report',state:'succeeded',artifactId:'a'}]}).map(c=>c.done),[true,true]);
});
test('mapLimited bounds concurrency and keeps order and failures',async()=>{
 let live=0,peak=0;const r=await mapLimited([1,2,3,4,5,6],2,async x=>{live++;peak=Math.max(peak,live);await new Promise(s=>setTimeout(s,5));live--;if(x===3)throw new Error('x');return x*2;});
 assert.equal(peak,2);assert.deepEqual(r.map(x=>x.ok?x.value:'err'),[2,4,'err',8,10,12]);
});
