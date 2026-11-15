"use client";
// Live AI workbench: streaming generation and domain operations on the engine, with run following.
import React,{useEffect,useRef,useState} from 'react';
import {useEngineSession,operationsForDomain} from './engine-session.mjs';

const KIND={poetry:'writing','persuasive-writing':'writing',workflow:'cross-media'};
export const projectKindFor=domain=>KIND[domain]||domain;
const usd=micro=>'$'+(Number(micro||0)/1e6).toFixed(4);
export const modelKey=m=>m.provider+'|'+m.model;
export function parseModelKey(k){const i=String(k||'').indexOf('|');return i>0?{provider:k.slice(0,i),model:k.slice(i+1)}:undefined}
export function describeEngineError(err){
 const code=err?.code||err?.body?.code;
 return {budget_exceeded:'Spending limit reached. The operator must raise the cap or fund this workspace before paid models can run.',
  global_limit_exceeded:'The operator-wide spending cap is $0 or exhausted; only the simulator can run until it is raised.',
  tenant_limit_exceeded:'This workspace has reached its spending limit. The operator must fund it before paid models can run.',
  run_budget_exceeded:'This run reached its budget ceiling.',
  provider_unconfigured:'That provider has no API key configured on the engine.',price_unknown:'That model has no known price, so it cannot be budgeted.',
  no_model_available:'No model is available for this operation.',unauthenticated:'Your session expired. Sign in again.'}[code]
  ||(err?.message?String(err.message):'Request failed');
}
function inputFor(schema,k,s,value,onChange){
 const h=React.createElement,common={name:k,value:value??'',onChange:e=>onChange(k,e.target.value),required:schema.required?.includes(k)};
 if(s.enum)return h('select',common,h('option',{value:''},'—'),...s.enum.map(v=>h('option',{key:v,value:v},v)));
 if(s.type==='array'||['text','data','instructions','premise','thesis','question','task','brief','prompt','idea'].includes(k))return h('textarea',{...common,rows:s.type==='array'?3:4,placeholder:s.type==='array'?'One per line':''});
 return h('input',{...common,type:s.type==='integer'?'number':'text'});
}
export function buildOperationInput(schema,values){
 const out={};
 for(const [k,s] of Object.entries(schema.properties||{})){
  const v=values[k];if(v===undefined||v==='')continue;
  out[k]=s.type==='integer'?Number(v):s.type==='array'?String(v).split('\n').map(x=>x.trim()).filter(Boolean):v;
 }
 return out;
}

export default function Workbench({domain}){
 const h=React.createElement,s=useEngineSession(),client=s.client;
 const [projects,setProjects]=useState([]),[projectId,setProjectId]=useState(''),[newTitle,setNewTitle]=useState('');
 const [models,setModels]=useState([]),[model,setModel]=useState('');
 const [workspaces,setWorkspaces]=useState([]),[mode,setMode]=useState('generate');
 const [prompt,setPrompt]=useState(''),[output,setOutput]=useState(''),[info,setInfo]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const [opId,setOpId]=useState(''),[values,setValues]=useState({}),[run,setRun]=useState(null),[events,setEvents]=useState([]);
 const abort=useRef(null);
 useEffect(()=>{if(!client)return;let live=true;setError('');
  Promise.all([client.projects(),client.models({capability:'chat'}),client.workspaces()]).then(([p,m,w])=>{if(!live)return;
   const items=p.items||[];setProjects(items);
   const usable=(m.items||[]).filter(x=>x.available);setModels(usable);
   setModel(prev=>usable.some(x=>modelKey(x)===prev)?prev:(usable.find(x=>!x.simulated)||usable[0])?modelKey(usable.find(x=>!x.simulated)||usable[0]):'');
   setWorkspaces(w.items||[]);
  }).catch(e=>{if(live)setError(describeEngineError(e))});
  return()=>{live=false;abort.current?.abort()}},[client]);
 const ops=operationsForDomain(workspaces,domain);
 useEffect(()=>{setOpId(ops[0]?.id||'');setValues({})},[domain,workspaces.length]);
 useEffect(()=>{const fit=projects.filter(p=>p.kind===projectKindFor(domain));setProjectId(prev=>projects.some(p=>p.id===prev)?prev:fit[0]?.id||'')},[domain,projects]);
 if(s.status!=='signed-in')return h('section',{className:'workbench','aria-label':'AI workbench'},h('h2',null,'AI workbench'),
  h('p',null,s.status==='checking'?'Checking your session…':'Sign in with your engine identity to generate, run domain operations and follow jobs. ',s.status==='checking'?null:h('a',{href:'/signin'},'Sign in')));
 const selectedModel=models.find(m=>modelKey(m)===model);
 async function ensureProject(){
  if(projectId)return projectId;
  const p=await client.createProject({title:newTitle.trim()||('Untitled '+domain),kind:projectKindFor(domain)});
  setProjects(prev=>[p,...prev]);setProjectId(p.id);setNewTitle('');return p.id;
 }
 async function generate(e){
  e.preventDefault();setBusy(true);setError('');setOutput('');setInfo('Streaming…');
  abort.current?.abort();abort.current=new AbortController();
  try{
   const pid=await ensureProject();
   const stream=await client.generateStream(pid,{prompt,model:parseModelKey(model),title:prompt.slice(0,60)},{signal:abort.current.signal});
   for await(const ev of stream){
    if(ev.event==='token')setOutput(prev=>prev+ev.data.text);
    else if(ev.event==='result')setInfo('Done · cost '+usd(ev.data.costMicro)+' · saved as an artifact'+(ev.data.output?.simulated?' · SIMULATED output (deterministic simulator, not a real model)':''));
    else if(ev.event==='error')throw Object.assign(new Error(ev.data.message||ev.data.code),{code:ev.data.code});
   }
  }catch(err){if(err.name!=='AbortError'){setError(describeEngineError(err));setInfo('')}}
  finally{setBusy(false)}
 }
 async function follow(id){
  setEvents([]);
  try{
   const stream=await client.followRun(id,{signal:abort.current?.signal});
   for await(const ev of stream){
    if(ev.event==='node.delta'||ev.event==='replay-end')continue;
    setEvents(prev=>[...prev.slice(-199),(ev.data?.node?'['+ev.data.node+'] ':'')+ev.event+(ev.data?.payload?.error?': '+ev.data.payload.error:'')]);
    setRun(await client.run(id));
   }
  }catch{}
  setRun(await client.run(id).catch(()=>null));
 }
 async function runOperation(e){
  e.preventDefault();setBusy(true);setError('');setRun(null);
  abort.current?.abort();abort.current=new AbortController();
  try{
   const op=ops.find(o=>o.id===opId);const pid=await ensureProject();
   const r=await client.runOperation(pid,op.id,buildOperationInput(op.inputSchema,values),{model:parseModelKey(model)});
   setRun(r);follow(r.id);
  }catch(err){setError(describeEngineError(err))}
  finally{setBusy(false)}
 }
 async function decide(approvalId,decision){try{await client.decide(approvalId,decision);setRun(await client.run(run.id))}catch(err){setError(describeEngineError(err))}}
 const op=ops.find(o=>o.id===opId);
 const finalOutputs=(run?.nodes||[]).filter(n=>n.output);
 return h('section',{className:'workbench','aria-label':'AI workbench'},
  h('div',{className:'workbench-head'},h('h2',null,'AI workbench'),
   h('div',{role:'tablist','aria-label':'Workbench mode'},
    ...[['generate','Generate'],['operation','Domain operation']].map(([k,l])=>h('button',{key:k,type:'button',role:'tab','aria-selected':mode===k,className:mode===k?'active':'',onClick:()=>setMode(k)},l)))),
  h('div',{className:'workbench-row'},
   h('label',null,'Project',h('select',{value:projectId,onChange:e=>setProjectId(e.target.value),'aria-label':'Project'},
    h('option',{value:''},'New project…'),...projects.map(p=>h('option',{key:p.id,value:p.id},p.title+' ('+p.kind+')')))),
   projectId?null:h('label',null,'New project title',h('input',{value:newTitle,onChange:e=>setNewTitle(e.target.value),placeholder:'Untitled '+domain})),
   h('label',null,'Model',h('select',{value:model,onChange:e=>setModel(e.target.value),'aria-label':'Model'},
    models.length?null:h('option',{value:''},'No available models'),...models.map(m=>h('option',{key:modelKey(m),value:modelKey(m)},(m.label||m.model)+(m.simulated?' — simulator':'')))))),
  selectedModel?.simulated?h('p',{className:'workbench-warning'},'Simulator selected: outputs are deterministic placeholders labelled SIMULATED, not real model output. Add a provider key on the engine for real generation.'):null,
  mode==='generate'?h('form',{onSubmit:generate,className:'workbench-form'},
    h('label',null,'Prompt',h('textarea',{value:prompt,onChange:e=>setPrompt(e.target.value),rows:4,required:true,'aria-label':'Prompt'})),
    h('div',{className:'workbench-actions'},h('button',{type:'submit',disabled:busy||!model||!prompt.trim()},busy?'Generating…':'Generate'),
     busy?h('button',{type:'button',onClick:()=>abort.current?.abort()},'Stop'):null),
    h('p',{role:'status','aria-live':'polite',className:'workbench-info'},info),
    output?h('pre',{className:'workbench-output','aria-label':'Generated output'},output):null):
   h('form',{onSubmit:runOperation,className:'workbench-form'},
    ops.length?h('label',null,'Operation',h('select',{value:opId,onChange:e=>{setOpId(e.target.value);setValues({})},'aria-label':'Operation'},...ops.map(o=>h('option',{key:o.id,value:o.id},o.title)))):h('p',null,'No engine operations for this workspace yet.'),
    op?h('p',{className:'workbench-info'},op.description):null,
    ...(op?Object.entries(op.inputSchema.properties).map(([k,sch])=>h('label',{key:op.id+k},(sch.title||k)+(op.inputSchema.required.includes(k)?' *':''),inputFor(op.inputSchema,k,sch,values[k],(key,v)=>setValues(prev=>({...prev,[key]:v}))))):[]),
    h('div',{className:'workbench-actions'},h('button',{type:'submit',disabled:busy||!op||!model},busy?'Starting…':'Run operation')),
    run?h('div',{className:'workbench-run'},
     h('p',null,h('strong',null,run.title||run.kind),' · ',h('span',{className:'state'},run.status),' · cost '+usd(run.spentMicro)),
     ...(run.approvals||[]).filter(a=>a.status==='pending').map(a=>h('div',{key:a.id,className:'workbench-approval'},h('p',null,'Approval needed: '+a.action),h('pre',null,a.summary),
      h('button',{type:'button',onClick:()=>decide(a.id,'approve')},'Approve'),h('button',{type:'button',onClick:()=>decide(a.id,'deny')},'Deny'))),
     h('ol',{className:'workbench-nodes'},...(run.nodes||[]).map(n=>h('li',{key:n.key},n.key+' — '+n.state+(n.error?' ('+n.error+')':'')))),
     ...finalOutputs.map(n=>h('details',{key:n.key},h('summary',null,n.key+' output'+(n.output.simulated?' (SIMULATED)':'')),h('pre',null,typeof n.output.text==='string'?n.output.text:JSON.stringify(n.output.data??n.output,null,2)))),
     events.length?h('details',null,h('summary',null,'Live events ('+events.length+')'),h('pre',null,events.join('\n'))):null):null),
  error?h('p',{role:'alert',className:'workbench-error'},error):null);
}
