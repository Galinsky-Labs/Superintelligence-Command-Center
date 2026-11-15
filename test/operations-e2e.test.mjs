// Operations console flows against the pinned engine (PostgreSQL + simulator) through the same-origin proxy.
import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
const engineDeps=existsSync(new URL('../vendor/engine/node_modules/pg/package.json',import.meta.url));
const skip=!process.env.TEST_ADMIN_DATABASE_URL?'set TEST_ADMIN_DATABASE_URL':!engineDeps?'run npm run engine:deps':false;
test('batch runs, goal templates/recipes with checklists, usage, BYOK, team and exports',{skip,timeout:180000},async()=>{
 const {freshDatabase,startApp}=await import('../vendor/engine/test/helpers/harness.mjs');
 const {EngineClient}=await import('../vendor/engine/packages/sdk/src/index.mjs');
 const {POST:signIn}=await import('../app/api/session/route.mjs');const {proxyToEngine}=await import('../lib/engine-proxy.mjs');
 const {GOAL_TEMPLATES,templateSpec,evaluateChecklist,mapLimited}=await import('../components/templates.mjs');
 const db=await freshDatabase();const app=await startApp(db,{SIE_SIM_DELAY_MS:'1'});
 const ac=new AbortController();const loop=app.worker.run({signal:ac.signal});
 const saved={ENGINE_API_URL:process.env.ENGINE_API_URL,SCC_SESSION_SECRET:process.env.SCC_SESSION_SECRET};
 process.env.ENGINE_API_URL=app.base;process.env.SCC_SESSION_SECRET='8d'.repeat(32);
 const origin='https://command.test',sim={provider:'deterministic',model:'sim-text'};
 try{
  const token=(await (await fetch(app.base+'/v1/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"handle":"ops"}'})).json()).token;
  const cookie=(await signIn(new Request(origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})}))).headers.get('set-cookie').split(';')[0];
  const viaProxy=(url,init={})=>{const h=new Headers(init.headers);h.set('cookie',cookie);h.set('sec-fetch-site','same-origin');return proxyToEngine(new Request(url,{...init,headers:h}))};
  const base=new EngineClient({baseUrl:origin,fetchImpl:viaProxy});const c=base.forTenant((await base.tenants()).items[0].id);
  // batch (SCC-009)
  const projects=await Promise.all(['A','B','C'].map(t=>c.createProject({title:'Batch '+t,kind:'writing'})));
  const res=await mapLimited(projects,2,p=>c.runOperation(p.id,'writing.poem',{topic:'tides'},{model:sim,idempotencyKey:'b1:'+p.id}));
  assert.ok(res.every(r=>r.ok));
  for(const r of res)assert.equal((await c.waitForRun(r.value.id,{timeoutMs:60000})).status,'succeeded');
  const again=await c.runOperation(projects[0].id,'writing.poem',{topic:'tides'},{model:sim,idempotencyKey:'b1:'+projects[0].id});assert.equal(again.id,res[0].value.id,'batch retries are idempotent');
  // templates + recipes (SCC-010/012)
  for(const t of GOAL_TEMPLATES){
   const p=await c.createProject({title:t.title,kind:'general'});
   const run=await c.startRun(p.id,templateSpec(t,{model:sim}));
   let r=await c.waitForRun(run.id,{timeoutMs:60000});
   if(r.status==='awaiting_approval'){for(const a of r.approvals.filter(a=>a.status==='pending'))await c.decide(a.id,'approve');r=await c.waitForRun(run.id,{timeoutMs:60000});}
   assert.equal(r.status,'succeeded',t.id+': '+(r.error||''));
   assert.ok(evaluateChecklist(t,r).every(x=>x.done),t.id+' checklist');
  }
  const p=projects[0];const wf=await c.saveWorkflow(p.id,{title:'Research report',description:'Goal template research-report',spec:templateSpec(GOAL_TEMPLATES[0],{model:sim})});
  assert.equal((await c.workflows(p.id)).items.length,1);
  const wr=await c.runWorkflow(wf.id,{inputs:{topic:'tidal power'}});assert.equal((await c.waitForRun(wr.id,{timeoutMs:60000})).status,'succeeded');
  // usage + BYOK (SCC-014)
  const b=await c.budget();assert.equal(b.global.hardLimitMicro,0);assert.ok(b.usage.some(u=>u.provider==='deterministic'));
  await c.setProviderCredential('openai',{apiKey:'sk-test-'+'x'.repeat(20)});
  const prov=(await c.providers()).items.find(x=>x.id==='openai');assert.equal(prov.source,'tenant');assert.ok(prov.fingerprint);assert.equal(JSON.stringify(prov).includes('xxxxxxxx'),false);
  // team (SCC-013)
  const m=await c.members();assert.equal(m.items.length,1);assert.equal(m.items[0].role,'owner');
  // export / import / delete (SCC-016)
  const ex=await viaProxy(origin+`/v1/projects/${p.id}/export`,{headers:{'X-Tenant-Id':c.tenantId}});assert.equal(ex.status,200);
  const imported=await c.importProject(await ex.json());assert.notEqual(imported.id,p.id);
  const zip=await viaProxy(origin+`/v1/projects/${p.id}/export?format=zip`,{headers:{'X-Tenant-Id':c.tenantId}});assert.equal(zip.status,200);assert.equal(Buffer.from(await zip.arrayBuffer()).subarray(0,2).toString(),'PK');
  await c.deleteProject(imported.id);assert.ok(!(await c.projects()).items.some(x=>x.id===imported.id));
 }finally{
  for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  ac.abort();await loop;await app.stop();await db.drop();
 }
});
