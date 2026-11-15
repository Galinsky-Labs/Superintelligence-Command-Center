// Server-only: sealed session cookie holding the user's engine API token (backend-for-frontend).
// The browser never sees the token; it talks to this app's same-origin /v1 proxy and the proxy adds
// Authorization. Sealing uses AES-256-GCM with SCC_SESSION_SECRET (64 hex chars).
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

export const COOKIE='scc_session';
export const PRODUCT='command';
const TOKEN=/^sie_[A-Za-z0-9_-]{30,80}$/;
const MAX_AGE=7*24*3600;

export function sessionKey(env=process.env){
 const hex=env.SCC_SESSION_SECRET||'';
 return /^[0-9a-f]{64}$/i.test(hex)?Buffer.from(hex,'hex'):null;
}
export function engineBase(env=process.env){
 const raw=env.ENGINE_API_URL;if(!raw)return null;
 try{
  const u=new URL(raw);
  if(u.protocol!=='https:'&&!['localhost','127.0.0.1'].includes(u.hostname))return null;
  return u.origin;
 }catch{return null}
}
export function seal(payload,key){
 const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);
 const body=Buffer.concat([c.update(JSON.stringify(payload),'utf8'),c.final()]);
 return Buffer.concat([iv,c.getAuthTag(),body]).toString('base64url');
}
export function unseal(value,key){
 try{
  const raw=Buffer.from(String(value),'base64url');if(raw.length<29)return null;
  const d=createDecipheriv('aes-256-gcm',key,raw.subarray(0,12));d.setAuthTag(raw.subarray(12,28));
  const p=JSON.parse(Buffer.concat([d.update(raw.subarray(28)),d.final()]).toString('utf8'));
  if(!p||!TOKEN.test(p.token||'')||typeof p.exp!=='number'||p.exp<Date.now()/1000)return null;
  return p;
 }catch{return null}
}
export function readCookie(request,name=COOKIE){
 const header=request.headers.get('cookie')||'';
 for(const part of header.split(';')){const i=part.indexOf('=');if(i>0&&part.slice(0,i).trim()===name)return decodeURIComponent(part.slice(i+1).trim());}
 return null;
}
export function currentSession(request,env=process.env){
 const key=sessionKey(env);if(!key)return null;
 const v=readCookie(request);return v?unseal(v,key):null;
}
function secureFlag(request){return new URL(request.url).protocol==='https:'||request.headers.get('x-forwarded-proto')==='https'}
export function sessionCookie(request,payload,key){
 return `${COOKIE}=${seal(payload,key)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}${secureFlag(request)?'; Secure':''}`;
}
export function clearCookie(request){return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secureFlag(request)?'; Secure':''}`}

/** Reject cross-site state-changing requests (defence in depth on top of SameSite=Lax). */
export function sameOrigin(request){
 if(['GET','HEAD','OPTIONS'].includes(request.method))return true;
 const site=request.headers.get('sec-fetch-site');
 if(site)return site==='same-origin'||site==='none';
 const origin=request.headers.get('origin');
 if(!origin)return true; // non-browser clients (no ambient cookies are sent cross-site by them)
 const host=request.headers.get('x-forwarded-host')||request.headers.get('host');
 try{return new URL(origin).host===host}catch{return false}
}

/** Verify a token against the engine and build the session payload. */
export async function verifyEngineToken(token,{base=engineBase(),fetchImpl=fetch}={}){
 if(!TOKEN.test(String(token||'')))return {ok:false,status:400,code:'invalid_token_format'};
 if(!base)return {ok:false,status:503,code:'engine_unconfigured'};
 const headers={Authorization:'Bearer '+token,'X-SIE-Product':PRODUCT,Accept:'application/json'};
 let me,tenants;
 try{
  const r=await fetchImpl(base+'/v1/me',{headers,cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(r.status===401)return {ok:false,status:401,code:'token_rejected'};
  if(!r.ok)return {ok:false,status:502,code:'engine_error'};
  me=await r.json();
  const t=await fetchImpl(base+'/v1/tenants',{headers,cache:'no-store',signal:AbortSignal.timeout(8000)});
  tenants=t.ok?(await t.json()).items||[]:[];
 }catch{return {ok:false,status:502,code:'engine_unreachable'}}
 return {ok:true,payload:{token,identityId:me.id,name:me.displayName||me.subject||'',exp:Math.floor(Date.now()/1000)+MAX_AGE},
  identity:{id:me.id,displayName:me.displayName||me.subject||''},tenants:tenants.map(x=>({id:x.id,name:x.name,role:x.role}))};
}
