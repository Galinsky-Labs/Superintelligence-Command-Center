// Runs against the production build (npm run build first): starts `next start` and checks that the
// app's pages and API routes are actually served. Guards against routes silently 404ing, e.g. when
// next.config.mjs stops listing the 'mjs' page extension.
import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import {existsSync} from 'node:fs';import {createServer} from 'node:net';
const root=new URL('../../',import.meta.url).pathname;
const built=existsSync(root+'.next/BUILD_ID');
const freePort=()=>new Promise(r=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
test('built app serves its page and API routes',{skip:!built&&'run npm run build first',timeout:90000},async()=>{
  const port=await freePort();
  const child=spawn(process.execPath,[root+'node_modules/next/dist/bin/next','start','-p',String(port),'-H','127.0.0.1'],{cwd:root,env:{...process.env,ENGINE_API_URL:'',PORT:String(port)},stdio:'pipe'});
  let log='';child.stdout.on('data',d=>log+=d);child.stderr.on('data',d=>log+=d);
  const base='http://127.0.0.1:'+port;
  try{
    let ok=false;for(let i=0;i<120&&!ok;i++){try{ok=(await fetch(base+'/api/health')).status===200;}catch{}if(!ok)await new Promise(r=>setTimeout(r,250));}
    assert.ok(ok,'server did not answer /api/health:\n'+log);
    const health=await (await fetch(base+'/api/health')).json();assert.equal(health.product,'command');
    const page=await fetch(base+'/');assert.equal(page.status,200);
    assert.match(await page.text(),/Superintelligence Command Center/);
    const engine=await fetch(base+'/api/engine');assert.equal(engine.status,503);assert.equal((await engine.json()).status,'unconfigured');
    assert.equal((await fetch(base+'/definitely-not-a-route')).status,404);
    assert.equal((await fetch(base+'/signin')).status,200);
    assert.equal((await fetch(base+'/v1/tenants')).status,503,'proxy reports the unconfigured engine');
    assert.equal((await fetch(base+'/api/session')).status,401);
    assert.equal((await fetch(base+'/auth/command/session')).status,401);
  }finally{child.kill('SIGTERM');}
});
