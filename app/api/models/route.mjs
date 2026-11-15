import {currentSession} from '../../../lib/session.mjs';
export const dynamic='force-dynamic';
const allowedUsage=new Set(['personal','commercial']);
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Engine capabilities -> the operation prefixes Command Center's model controls match per domain.
const CAPABILITY_OPERATIONS={chat:['text.generate','writing.generate','research.generate','legislation.generate','code.generate','data.analysis','agent.run','workflow.run'],
 tools:['agent.tools'],structured:['text.structured'],vision:['vision.analyze'],image:['image.generate'],speech:['speech.generate','voice.generate'],
 music:['music.generate','audio.generate'],video:['video.generate'],transcribe:['audio.transcribe','speech.transcribe']};
/** Accepts the engine catalog (provider/model/capabilities/price/available) or the legacy operations schema. */
export function toCatalogItem(item){
 if(!item||typeof item!=='object'||typeof item.provider!=='string'||typeof item.model!=='string')return null;
 const operations=Array.isArray(item.operations)?item.operations:Array.isArray(item.capabilities)?item.capabilities.flatMap(c=>CAPABILITY_OPERATIONS[c]||[]):null;
 if(!operations)return null;
 return {...item,id:typeof item.id==='string'?item.id:item.provider+'|'+item.model,operations,
  modalities:Array.isArray(item.modalities)?item.modalities:Array.isArray(item.capabilities)?item.capabilities:[],
  priceStatus:item.priceStatus??(item.priceKnown?'known':'unknown'),
  reasons:Array.isArray(item.reasons)?item.reasons:[...(item.configured===false?['provider_unconfigured']:[]),...(item.priceKnown===false?['price_unknown']:[]),...(item.simulated?['simulated']:[])]};
}
export function sanitizeCatalog(data){
 if(!data||!Array.isArray(data.items))throw new TypeError('Invalid engine catalog response');
 return data.items.slice(0,200).map(toCatalogItem).filter(Boolean).map(item=>({
  id:item.id,provider:item.provider,model:item.model,revision:String(item.revision||''),label:typeof item.label==='string'?item.label.slice(0,120):'',
  operations:item.operations.filter(x=>typeof x==='string').slice(0,30),
  modalities:Array.isArray(item.modalities)?item.modalities.filter(x=>typeof x==='string').slice(0,15):[],
  regions:Array.isArray(item.regions)?item.regions.filter(x=>typeof x==='string').slice(0,30):[],
  licenseScope:['none','personal','commercial'].includes(item.licenseScope)?item.licenseScope:'none',
  priceStatus:item.priceStatus==='known'?'known':'unknown',
  healthStatus:['healthy','degraded','outage','unknown'].includes(item.healthStatus)?item.healthStatus:'unknown',
  simulated:item.simulated===true,
  available:item.available===true,reasons:Array.isArray(item.reasons)?item.reasons.filter(x=>typeof x==='string').slice(0,20):[]
 }));
}
export async function GET(request,{baseUrl=process.env.ENGINE_API_URL,fetchImpl=fetch,token}={}){
 const params=new URL(request.url).searchParams;
 const usage=params.get('usage')||'personal',tenant=params.get('tenant')||'';
 const nostore={'Cache-Control':'no-store'};
 if(!allowedUsage.has(usage))return Response.json({status:'invalid_filter',items:[]},{status:400,headers:nostore});
 if(tenant&&!UUID.test(tenant))return Response.json({status:'invalid_tenant',items:[]},{status:400,headers:nostore});
 if(!baseUrl)return Response.json({status:'unconfigured',items:[]},{status:503,headers:nostore});
 const bearer=token??currentSession(request)?.token;
 if(!bearer)return Response.json({status:'signed-out',items:[]},{status:401,headers:nostore});
 let endpoint;
 try{
  const base=new URL(baseUrl);
  if(base.protocol!=='https:'&&!(base.hostname==='localhost'||base.hostname==='127.0.0.1'))throw new TypeError('Unsafe catalog origin');
  endpoint=new URL('/v1/models',base);
  endpoint.searchParams.set('usage',usage);
 }catch{return Response.json({status:'invalid_configuration',items:[]},{status:503,headers:nostore})}
 try{
  const reply=await fetchImpl(endpoint,{method:'GET',cache:'no-store',headers:{Accept:'application/json',Authorization:'Bearer '+bearer,'X-SIE-Product':'command',...(tenant?{'X-Tenant-Id':tenant}:{})},signal:AbortSignal.timeout(8000)});
  if(!reply.ok)throw new Error('Catalog upstream '+reply.status);
  const items=sanitizeCatalog(await reply.json());
  return Response.json({status:'connected',items},{headers:nostore});
 }catch{return Response.json({status:'unavailable',items:[]},{status:503,headers:nostore})}
}
