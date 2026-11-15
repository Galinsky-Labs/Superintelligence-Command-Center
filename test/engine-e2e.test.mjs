// Command Center against a real engine (vendor/engine at the pinned commit) with PostgreSQL and the
// deterministic simulator: token sign-in, same-origin proxy, streaming generation, domain operation run,
// job tray adapter and the proxy's refusal paths. Needs TEST_ADMIN_DATABASE_URL and vendor/engine deps.
import test from 'node:test';import assert from 'node:assert/strict';import {existsSync} from 'node:fs';
const engineDeps=existsSync(new URL('../vendor/engine/node_modules/pg/package.json',import.meta.url));
const skip=!process.env.TEST_ADMIN_DATABASE_URL?'set TEST_ADMIN_DATABASE_URL':!engineDeps?'npm install --prefix vendor/engine --omit=dev --ignore-scripts':false;

test('sign in with an engine token, then generate, run and track jobs through the proxy',{skip,timeout:120000},async()=>{
 const {freshDatabase,startApp}=await import('../vendor/engine/test/helpers/harness.mjs');
 const {EngineClient}=await import('../vendor/engine/packages/sdk/src/index.mjs');
 const {POST:signIn,GET:sessionInfo}=await import('../app/api/session/route.mjs');
 const {proxyToEngine}=await import('../lib/engine-proxy.mjs');
 const {engineJobClient}=await import('../components/engine-jobs.mjs');
 const {normalizeRunList}=await import('../components/job-tray.mjs');
 const db=await freshDatabase();const app=await startApp(db,{SIE_SIM_DELAY_MS:'1'});
 const ac=new AbortController();const loop=app.worker.run({signal:ac.signal});
 const saved={ENGINE_API_URL:process.env.ENGINE_API_URL,SCC_SESSION_SECRET:process.env.SCC_SESSION_SECRET};
 process.env.ENGINE_API_URL=app.base;process.env.SCC_SESSION_SECRET='5a'.repeat(32);
 try{
  const token=(await (await fetch(app.base+'/v1/dev/login',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"handle":"cc-e2e"}'})).json()).token;
  const origin='https://command.test';
  const bad=await signIn(new Request(origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:'sie_'+'x'.repeat(40)})}));
  assert.equal(bad.status,401);
  const ok=await signIn(new Request(origin+'/api/session',{method:'POST',headers:{'Content-Type':'application/json','sec-fetch-site':'same-origin'},body:JSON.stringify({token})}));
  assert.equal(ok.status,200);
  const setCookie=ok.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);assert.doesNotMatch(setCookie,new RegExp(token));
  const cookie=setCookie.split(';')[0];
  assert.equal((await sessionInfo(new Request(origin+'/api/session',{headers:{cookie}}))).status,200);
  // browser SDK over the same-origin proxy
  const viaProxy=(url,init={})=>{const h=new Headers(init.headers);h.set('cookie',cookie);h.set('sec-fetch-site','same-origin');
   return proxyToEngine(new Request(url,{...init,headers:h,...(init.body?{duplex:'half'}:{})}))};
  const engine=new EngineClient({baseUrl:origin,fetchImpl:viaProxy});
  const tenantId=(await engine.tenants()).items[0].id;const c=engine.forTenant(tenantId);
  const project=await c.createProject({title:'E2E',kind:'research'});
  let text='',result;
  for await(const ev of await c.generateStream(project.id,{prompt:'Outline a study plan',model:{provider:'deterministic',model:'sim-text'}})){if(ev.event==='token')text+=ev.data.text;if(ev.event==='result')result=ev.data;}
  assert.match(text,/SIMULATED/);assert.ok(result.runId);assert.equal(result.output.simulated,true);
  const run=await c.runOperation(project.id,'research.brief',{question:'Why is the sky blue?'},{model:{provider:'deterministic',model:'sim-text'}});
  const done=await c.waitForRun(run.id,{timeoutMs:60000});assert.equal(done.status,'succeeded');
  const jobs=normalizeRunList(await engineJobClient(c).listRuns({limit:100}));
  assert.ok(jobs.some(j=>j.runId===run.id&&j.state==='completed'));
  // refusals
  assert.equal((await proxyToEngine(new Request(origin+'/v1/tenants'))).status,401,'no session');
  assert.equal((await proxyToEngine(new Request(origin+'/v1/projects',{method:'POST',headers:{cookie,'sec-fetch-site':'cross-site','content-type':'application/json'},body:'{}'}))).status,403,'cross-site write');
  assert.equal((await proxyToEngine(new Request(origin+'/v1/dev/login',{method:'POST',headers:{cookie,'sec-fetch-site':'same-origin'},body:'{}'}))).status,404,'dev login is not proxied');
  const forged=cookie.slice(0,-4)+(cookie.endsWith('AAAA')?'BBBB':'AAAA');
  assert.equal((await proxyToEngine(new Request(origin+'/v1/tenants',{headers:{cookie:forged}}))).status,401,'tampered cookie');
 }finally{
  for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v;}
  ac.abort();await loop;await app.stop();await db.drop();
 }
});
