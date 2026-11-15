// SCC-010/012: goal templates with output checklists. A template becomes a saved, versioned engine
// workflow ("recipe") in a project and can be re-run with new inputs.
export const GOAL_TEMPLATES=Object.freeze([
 {id:'research-report',title:'Research report',domain:'research',inputs:{topic:'grid-scale energy storage'},
  checklist:[{node:'questions',label:'Research questions'},{node:'report',label:'Cited report artifact',artifact:true}],
  spec:{title:'Research report',nodes:[
   {key:'questions',type:'agent',role:'research lead',instructions:'List four answerable research questions about {{inputs.topic}}, each with the evidence that would answer it.'},
   {key:'report',type:'agent',dependsOn:['questions'],instructions:'Write a cited research report on {{inputs.topic}} answering: {{nodes.questions.text}}. Mark unverified claims.',artifact:{title:'Research report'}}]}},
 {id:'campaign-kit',title:'Campaign kit',domain:'persuasive-writing',inputs:{cause:'a neighbourhood tree-planting day'},
  checklist:[{node:'message',label:'Core message'},{node:'article',label:'Op-ed artifact',artifact:true},{node:'social',label:'Social posts artifact',artifact:true},{node:'gate',label:'Human approval before publishing'}],
  spec:{title:'Campaign kit',nodes:[
   {key:'message',type:'agent',instructions:'Write a one-paragraph core message and three supporting points for {{inputs.cause}}.'},
   {key:'article',type:'agent',dependsOn:['message'],instructions:'Write a 400-word op-ed from this message: {{nodes.message.text}}',artifact:{title:'Op-ed'}},
   {key:'social',type:'agent',dependsOn:['message'],instructions:'Write five social posts (under 280 characters) from: {{nodes.message.text}}',artifact:{title:'Social posts'}},
   {key:'gate',type:'approval',dependsOn:['article','social'],effect:'publish',summary:'Approve the campaign kit for publication?'}]}},
 {id:'bill-package',title:'Legislation package',domain:'legislation',inputs:{subject:'e-bike battery safety',jurisdiction:'a US state'},
  checklist:[{node:'bill',label:'Draft bill artifact',artifact:true},{node:'analysis',label:'Section-by-section analysis artifact',artifact:true},{node:'summary',label:'Plain-language summary artifact',artifact:true}],
  spec:{title:'Legislation package',nodes:[
   {key:'bill',type:'agent',instructions:'Draft a bill on {{inputs.subject}} for {{inputs.jurisdiction}} with findings, definitions, requirements, enforcement and effective date.',artifact:{title:'Draft bill'}},
   {key:'analysis',type:'agent',dependsOn:['bill'],instructions:'Write a section-by-section analysis of: {{nodes.bill.text}}',artifact:{title:'Section-by-section analysis'}},
   {key:'summary',type:'agent',dependsOn:['bill'],instructions:'Write a 200-word plain-language summary of: {{nodes.bill.text}}',artifact:{title:'Plain-language summary'}}]}}
]);
/** Builds a workflow spec from a template, its inputs and an optional default model. */
export function templateSpec(template,{inputs={},model}={}){
 const spec=JSON.parse(JSON.stringify(template.spec));
 spec.inputs={...template.inputs,...inputs};
 if(model)spec.nodes=spec.nodes.map(n=>n.type==='agent'?{...n,model}:n);
 return spec;
}
/** Checklist status from an engine run: each item is met only by actual node state/artifact evidence. */
export function evaluateChecklist(template,run){
 const nodes=new Map((run?.nodes||[]).map(n=>[n.key,n]));
 return template.checklist.map(item=>{const n=nodes.get(item.node);
  const done=Boolean(n&&n.state==='succeeded'&&(!item.artifact||n.artifactId));
  return {...item,done,state:n?.state||'not started',artifactId:n?.artifactId||null,simulated:Boolean(n?.output?.simulated)};});
}
/** Runs fn over items with at most `limit` in flight; returns settled results in input order. */
export async function mapLimited(items,limit,fn){
 const out=new Array(items.length);let next=0;
 await Promise.all(Array.from({length:Math.min(limit,items.length)},async()=>{while(next<items.length){const i=next++;try{out[i]={ok:true,value:await fn(items[i],i)}}catch(e){out[i]={ok:false,error:e}}}}));
 return out;
}
