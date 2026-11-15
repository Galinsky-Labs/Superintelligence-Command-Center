// Same-origin proxy from the browser to the engine API, adding the session's bearer token.
import {currentSession,engineBase,sameOrigin,PRODUCT} from './session.mjs';

const FORWARD_REQUEST=['accept','content-type','x-tenant-id','last-event-id','if-match'];
const FORWARD_RESPONSE=['content-type','content-disposition','cache-control','etag','retry-after','x-request-id'];
const SAFE_PATH=/^\/v1\/[A-Za-z0-9._~!$&'()*+,;=:@%\/-]*$/;
const MAX_BODY=25*1024*1024;

const json=(status,body)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});

export async function proxyToEngine(request,{env=process.env,fetchImpl=fetch}={}){
 const base=engineBase(env);if(!base)return json(503,{code:'engine_unconfigured',message:'ENGINE_API_URL is not configured'});
 if(!sameOrigin(request))return json(403,{code:'cross_site_request',message:'Cross-site request refused'});
 const session=currentSession(request,env);
 if(!session)return json(401,{code:'unauthenticated',message:'Sign in to Command Center first'});
 const incoming=new URL(request.url);
 if(!SAFE_PATH.test(incoming.pathname)||incoming.pathname.split('/').some(s=>s==='..'||s==='.'))return json(400,{code:'invalid_path'});
 if(incoming.pathname.startsWith('/v1/dev/'))return json(404,{code:'not_found'});
 const headers={Authorization:'Bearer '+session.token,'X-SIE-Product':PRODUCT};
 for(const h of FORWARD_REQUEST){const v=request.headers.get(h);if(v)headers[h]=v;}
 let body;
 if(!['GET','HEAD'].includes(request.method)){
  const len=Number(request.headers.get('content-length')||0);
  if(len>MAX_BODY)return json(413,{code:'payload_too_large'});
  body=await request.arrayBuffer();
  if(body.byteLength>MAX_BODY)return json(413,{code:'payload_too_large'});
 }
 let upstream;
 try{
  upstream=await fetchImpl(base+incoming.pathname+incoming.search,{method:request.method,headers,body,redirect:'manual',cache:'no-store',signal:request.signal});
 }catch{return json(502,{code:'engine_unreachable',message:'The engine did not respond'})}
 const out=new Headers();
 for(const h of FORWARD_RESPONSE){const v=upstream.headers.get(h);if(v)out.set(h,v);}
 if(!out.has('cache-control'))out.set('Cache-Control','no-store');
 if((out.get('content-type')||'').includes('text/event-stream'))out.set('X-Accel-Buffering','no');
 return new Response(upstream.status===204?null:upstream.body,{status:upstream.status,headers:out});
}
