"use client";
// Operations console: batch runs (SCC-009), goal templates & recipes (SCC-010/012), team (SCC-013),
// usage, limits and bring-your-own-key credentials (SCC-014), exports and retention (SCC-016).
import React,{useEffect,useState} from 'react';
import {useEngineSession,DOMAIN_OPERATIONS} from './engine-session.mjs';
import {GOAL_TEMPLATES,templateSpec,evaluateChecklist,mapLimited} from './templates.mjs';
import {describeEngineError,buildOperationInput,modelKey,parseModelKey} from './workbench.mjs';
const h=React.createElement;
const usd=m=>'$'+(Number(m||0)/1e6).toFixed(4);
function useLoad(fn,deps){const [v,setV]=useState(null),[err,setErr]=useState('');const load=()=>fn().then(x=>{setV(x);setErr('')}).catch(e=>setErr(describeEngineError(e)));useEffect(()=>{load()},deps);return [v,err,load,setErr];}
function useChatModels(client){const [m]=useLoad(async()=>client?((await client.models({capability:'chat'})).items||[]).filter(x=>x.available):[],[client]);return m||[];}
function ModelSelect({models,value,onChange}){return h('label',null,'Model ',h('select',{value,onChange:e=>onChange(e.target.value)},h('option',{value:''},'Engine default'),...models.map(m=>h('option',{key:modelKey(m),value:modelKey(m)},(m.label||m.model)+(m.simulated?' — simulator':'')))))}

export function BatchPanel(){
 const {client}=useEngineSession();const models=useChatModels(client);
 const [projects]=useLoad(async()=>client?(await client.projects()).items||[]:[],[client]);
 const [ws]=useLoad(async()=>client?(await client.workspaces()).items||[]:[],[client]);
 const ops=(ws||[]).flatMap(w=>w.operations);
 const [picked,setPicked]=useState([]),[opId,setOpId]=useState(''),[values,setValues]=useState({}),[model,setModel]=useState(''),[rows,setRows]=useState([]),[busy,setBusy]=useState(false),[err,setErr]=useState('');
 const op=ops.find(o=>o.id===opId);
 async function refresh(list=rows){setRows(await Promise.all(list.map(async r=>r.runId?{...r,run:await client.run(r.runId).catch(()=>r.run)}:r)));}
 async function start(){
  setBusy(true);setErr('');const batch=crypto.randomUUID();
  const res=await mapLimited(picked,4,pid=>client.runOperation(pid,op.id,buildOperationInput(op.inputSchema,values),{model:parseModelKey(model),idempotencyKey:batch+':'+pid}));
  const next=res.map((r,i)=>({projectId:picked[i],runId:r.ok?r.value.id:null,run:r.ok?r.value:null,error:r.ok?null:describeEngineError(r.error)}));
  setRows(next);setBusy(false);
 }
 useEffect(()=>{if(!rows.some(r=>r.run&&['queued','running'].includes(r.run.status)))return;const t=setTimeout(()=>refresh(),2000);return()=>clearTimeout(t)},[rows]);
 async function cancelAll(){await mapLimited(rows.filter(r=>r.run&&['queued','running','awaiting_approval'].includes(r.run.status)),4,r=>client.cancelRun(r.runId));await refresh();}
 const title=id=>(projects||[]).find(p=>p.id===id)?.title||id;
 return h('section',{className:'manage-section'},h('h2',null,'Batch operations'),
  h('p',null,'Run one domain operation across several projects at once (at most four start concurrently; the engine queues the rest and applies each run’s budget).'),
  h('fieldset',null,h('legend',null,'Projects'),...(projects||[]).map(p=>h('label',{key:p.id,className:'check'},h('input',{type:'checkbox',checked:picked.includes(p.id),onChange:e=>setPicked(s=>e.target.checked?[...s,p.id]:s.filter(x=>x!==p.id))}),' '+p.title+' ('+p.kind+')'))),
  h('label',null,'Operation ',h('select',{value:opId,onChange:e=>{setOpId(e.target.value);setValues({})}},h('option',{value:''},'Choose…'),...ops.map(o=>h('option',{key:o.id,value:o.id},o.title)))),
  ...(op?Object.entries(op.inputSchema.properties).map(([k,s])=>h('label',{key:k},(s.title||k)+(op.inputSchema.required.includes(k)?' *':'')+' ',h('input',{value:values[k]||'',onChange:e=>setValues(v=>({...v,[k]:e.target.value}))}))):[]),
  h(ModelSelect,{models,value:model,onChange:setModel}),
  h('div',{className:'row'},h('button',{type:'button',disabled:busy||!op||!picked.length,onClick:start},busy?'Starting…':'Run on '+picked.length+' project(s)'),rows.length?h('button',{type:'button',onClick:cancelAll},'Cancel unfinished'):null),
  rows.length?h('table',null,h('thead',null,h('tr',null,h('th',null,'Project'),h('th',null,'Status'),h('th',null,'Cost'))),h('tbody',null,...rows.map(r=>h('tr',{key:r.projectId},h('td',null,title(r.projectId)),h('td',null,r.error||r.run?.status),h('td',null,r.run?usd(r.run.spentMicro):''))))):null,
  err?h('p',{role:'alert'},err):null);
}

export function RecipesPanel(){
 const {client}=useEngineSession();const models=useChatModels(client);
 const [projects]=useLoad(async()=>client?(await client.projects()).items||[]:[],[client]);
 const [projectId,setProjectId]=useState(''),[tplId,setTplId]=useState(GOAL_TEMPLATES[0].id),[inputs,setInputs]=useState({}),[model,setModel]=useState('');
 const [recipes,recErr,loadRecipes]=useLoad(async()=>client&&projectId?(await client.workflows(projectId)).items||[]:[],[client,projectId]);
 const [run,setRun]=useState(null),[runTpl,setRunTpl]=useState(null),[err,setErr]=useState(''),[msg,setMsg]=useState('');
 const tpl=GOAL_TEMPLATES.find(t=>t.id===tplId);
 useEffect(()=>{setInputs({...tpl.inputs})},[tplId]);
 useEffect(()=>{if(!run||!['queued','running'].includes(run.status))return;const t=setTimeout(async()=>setRun(await client.run(run.id)),2000);return()=>clearTimeout(t)},[run]);
 const spec=()=>templateSpec(tpl,{inputs,model:parseModelKey(model)});
 async function save(){try{await client.saveWorkflow(projectId,{title:tpl.title,description:'Goal template '+tpl.id,spec:spec()});setMsg('Saved as a recipe in this project.');loadRecipes()}catch(e){setErr(describeEngineError(e))}}
 async function runNow(){try{setRunTpl(tpl);setRun(await client.startRun(projectId,spec(),{idempotencyKey:crypto.randomUUID()}))}catch(e){setErr(describeEngineError(e))}}
 async function runRecipe(r){try{const t=GOAL_TEMPLATES.find(x=>'Goal template '+x.id===r.description)||null;setRunTpl(t);setRun(await client.runWorkflow(r.id,{inputs}))}catch(e){setErr(describeEngineError(e))}}
 const checklist=run&&runTpl?evaluateChecklist(runTpl,run):[];
 return h('section',{className:'manage-section'},h('h2',null,'Goal templates and recipes'),
  h('label',null,'Project ',h('select',{value:projectId,onChange:e=>setProjectId(e.target.value)},h('option',{value:''},'Choose…'),...(projects||[]).map(p=>h('option',{key:p.id,value:p.id},p.title)))),
  h('label',null,'Template ',h('select',{value:tplId,onChange:e=>setTplId(e.target.value)},...GOAL_TEMPLATES.map(t=>h('option',{key:t.id,value:t.id},t.title)))),
  ...Object.keys(tpl.inputs).map(k=>h('label',{key:k},k+' ',h('input',{value:inputs[k]??'',onChange:e=>setInputs(v=>({...v,[k]:e.target.value}))}))),
  h(ModelSelect,{models,value:model,onChange:setModel}),
  h('p',null,'Output checklist: '+tpl.checklist.map(c=>c.label).join(' · ')),
  h('div',{className:'row'},h('button',{type:'button',disabled:!projectId,onClick:runNow},'Run template'),h('button',{type:'button',disabled:!projectId,onClick:save},'Save as recipe')),
  projectId&&recipes?h('div',null,h('h3',null,'Saved recipes in this project'),recipes.length?h('ul',null,...recipes.map(r=>h('li',{key:r.id},r.title+' · v'+r.version+' ',h('button',{type:'button',onClick:()=>runRecipe(r)},'Run with the inputs above')))):h('p',null,'None yet.')):null,
  run?h('div',{className:'checklist'},h('h3',null,'Run '+run.status+' · '+usd(run.spentMicro)),
   checklist.length?h('ul',null,...checklist.map(c=>h('li',{key:c.node},(c.done?'✓ ':'○ ')+c.label+' — '+c.state+(c.simulated?' (SIMULATED)':'')))):null,
   (run.approvals||[]).filter(a=>a.status==='pending').map(a=>h('div',{key:a.id},h('p',null,'Approval needed: '+a.summary),h('button',{type:'button',onClick:async()=>{await client.decide(a.id,'approve');setRun(await client.run(run.id))}},'Approve'),h('button',{type:'button',onClick:async()=>{await client.decide(a.id,'deny');setRun(await client.run(run.id))}},'Deny')))):null,
  msg?h('p',{role:'status'},msg):null,(err||recErr)?h('p',{role:'alert'},err||recErr):null);
}

export function TeamPanel(){
 const s=useEngineSession();const client=s.client;
 const [members,err,load,setErr]=useLoad(async()=>client?(await client.members()).items||[]:[],[client]);
 const [email,setEmail]=useState(''),[role,setRole]=useState('member');
 const myRole=s.tenants.find(t=>t.id===s.tenantId)?.role;
 async function add(){try{await client.setMember({email,role});setEmail('');load()}catch(e){setErr(describeEngineError(e))}}
 async function change(identityId,r){try{await client.setMember({identityId,role:r});load()}catch(e){setErr(describeEngineError(e))}}
 async function remove(identityId){try{await client.request('DELETE',`/v1/tenants/${s.tenantId}/members/${identityId}`);load()}catch(e){setErr(describeEngineError(e))}}
 const admin=['owner','admin'].includes(myRole);
 return h('section',{className:'manage-section'},h('h2',null,'Team'),
  h('p',null,'Everyone in this workspace shares its projects according to their role (viewer < member < admin < owner); the engine enforces this with row-level security. Your role: '+(myRole||'unknown')+'.'),
  members?h('table',null,h('thead',null,h('tr',null,h('th',null,'Member'),h('th',null,'Role'),h('th',null,''))),h('tbody',null,...members.map(m=>h('tr',{key:m.identityId},h('td',null,(m.displayName||m.email||m.identityId)),
   h('td',null,admin&&m.identityId!==s.identity?.id?h('select',{value:m.role,onChange:e=>change(m.identityId,e.target.value),'aria-label':'Role for '+(m.displayName||m.identityId)},...['viewer','member','admin','owner'].map(r=>h('option',{key:r,value:r},r))):m.role),
   h('td',null,admin&&m.identityId!==s.identity?.id?h('button',{type:'button',onClick:()=>remove(m.identityId)},'Remove'):null))))):h('p',null,'Loading…'),
  admin?h('div',{className:'row'},h('label',null,'Add by email ',h('input',{type:'email',value:email,onChange:e=>setEmail(e.target.value)})),h('select',{value:role,onChange:e=>setRole(e.target.value),'aria-label':'Role'},...['viewer','member','admin'].map(r=>h('option',{key:r,value:r},r))),h('button',{type:'button',disabled:!email,onClick:add},'Add member')):null,
  h('p',{className:'small'},'A person must already have an engine identity (signed in once via SSO, or created by the operator) before they can be added.'),
  err?h('p',{role:'alert'},err):null);
}

export function UsagePanel(){
 const s=useEngineSession();const client=s.client;
 const [budget,err]=useLoad(async()=>client?client.budget():null,[client]);
 const [providers,pErr,loadProviders,setPErr]=useLoad(async()=>client?(await client.providers()).items||[]:[],[client]);
 const [provider,setProvider]=useState(''),[key,setKey]=useState(''),[baseUrl,setBaseUrl]=useState(''),[msg,setMsg]=useState('');
 async function saveKey(){try{await client.setProviderCredential(provider,{apiKey:key,baseUrl:baseUrl||undefined});setKey('');setMsg('Key stored encrypted on the engine for this workspace. It is never shown again.');loadProviders()}catch(e){setPErr(describeEngineError(e))}}
 async function removeKey(p){try{await client.request('DELETE','/v1/providers/'+encodeURIComponent(p));loadProviders()}catch(e){setPErr(describeEngineError(e))}}
 return h('section',{className:'manage-section'},h('h2',null,'Usage, limits and keys'),
  budget?h('div',null,
   h('p',null,'Workspace: funded '+usd(budget.tenant.fundedMicro)+' · limit '+usd(budget.tenant.hardLimitMicro)+' · spent '+usd(budget.tenant.spentMicro)+' · reserved '+usd(budget.tenant.reservedMicro)),
   h('p',null,'Operator-wide cap: '+usd(budget.global.hardLimitMicro)+(budget.global.hardLimitMicro===0?' — paid model calls are blocked until the operator raises it; the simulator still works.':'')),
   h('table',null,h('thead',null,h('tr',null,h('th',null,'Provider / model'),h('th',null,'Operation'),h('th',null,'Calls'),h('th',null,'Tokens in/out'),h('th',null,'Cost'))),
    h('tbody',null,...budget.usage.map((u,i)=>h('tr',{key:i},h('td',null,u.provider+' / '+u.model+(u.simulated?' (sim)':'')),h('td',null,u.operation),h('td',null,u.calls),h('td',null,u.inputTokens+' / '+u.outputTokens),h('td',null,usd(u.costMicro))))))):h('p',null,err||'Loading usage…'),
  h('h3',null,'Provider keys (bring your own key)'),
  providers?h('ul',null,...providers.filter(p=>!p.simulated).map(p=>h('li',{key:p.id},p.label+': '+(p.configured?'configured ('+p.source+(p.fingerprint?', fingerprint '+p.fingerprint:'')+')':'not configured')+' ',p.source==='tenant'?h('button',{type:'button',onClick:()=>removeKey(p.id)},'Remove'):null))):null,
  h('div',{className:'row'},h('select',{value:provider,onChange:e=>setProvider(e.target.value),'aria-label':'Provider'},h('option',{value:''},'Provider…'),...(providers||[]).filter(p=>!p.simulated).map(p=>h('option',{key:p.id,value:p.id},p.label))),
   h('input',{type:'password',autoComplete:'off',value:key,onChange:e=>setKey(e.target.value),placeholder:'API key','aria-label':'API key'}),
   provider==='openai-compatible'?h('input',{value:baseUrl,onChange:e=>setBaseUrl(e.target.value),placeholder:'https://…/v1','aria-label':'Base URL'}):null,
   h('button',{type:'button',disabled:!provider||key.length<8,onClick:saveKey},'Store key')),
  h('p',{className:'small'},'Keys are sent once to the engine, encrypted at rest and used only server-side. Spending still needs the operator cap and workspace funding.'),
  msg?h('p',{role:'status'},msg):null,pErr?h('p',{role:'alert'},pErr):null);
}

export function DataPanel(){
 const {client,tenantId}=useEngineSession();
 const [projects,err,load,setErr]=useLoad(async()=>client?(await client.projects()).items||[]:[],[client]);
 const [confirm,setConfirm]=useState({}),[msg,setMsg]=useState('');
 async function download(p,format){
  const r=await fetch(`/v1/projects/${p.id}/export${format==='zip'?'?format=zip':''}`,{headers:{'X-Tenant-Id':tenantId}});
  if(!r.ok){setErr('Export failed ('+r.status+')');return}
  const url=URL.createObjectURL(await r.blob());const a=document.createElement('a');a.href=url;a.download=p.title+(format==='zip'?'.zip':'.json');a.click();URL.revokeObjectURL(url);
 }
 async function importFile(file){try{const p=await client.importProject(JSON.parse(await file.text()));setMsg('Imported "'+p.title+'"');load()}catch(e){setErr(describeEngineError(e))}}
 async function remove(p){try{await client.deleteProject(p.id);setMsg('Deleted "'+p.title+'"');load()}catch(e){setErr(describeEngineError(e))}}
 return h('section',{className:'manage-section'},h('h2',null,'Data, exports and retention'),
  h('p',null,'Export any project as re-importable JSON (with checksums) or ZIP, import an export, or permanently delete a project and its artifact history.'),
  h('label',null,'Import a JSON export ',h('input',{type:'file',accept:'application/json',onChange:e=>e.target.files[0]&&importFile(e.target.files[0])})),
  projects?h('table',null,h('tbody',null,...projects.map(p=>h('tr',{key:p.id},h('td',null,p.title+' ('+p.artifactCount+' artifacts)'),
   h('td',null,h('button',{type:'button',onClick:()=>download(p,'json')},'JSON'),h('button',{type:'button',onClick:()=>download(p,'zip')},'ZIP')),
   h('td',null,h('input',{value:confirm[p.id]||'',onChange:e=>setConfirm(c=>({...c,[p.id]:e.target.value})),placeholder:'type the title to delete','aria-label':'Confirm deletion of '+p.title}),
    h('button',{type:'button',disabled:confirm[p.id]!==p.title,onClick:()=>remove(p)},'Delete')))))):h('p',null,'Loading…'),
  msg?h('p',{role:'status'},msg):null,err?h('p',{role:'alert'},err):null);
}
