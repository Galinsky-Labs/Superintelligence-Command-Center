import {currentSession,sessionKey,sessionCookie,clearCookie,verifyEngineToken,sameOrigin,engineBase} from '../../../lib/session.mjs';
export const dynamic='force-dynamic';
const nostore={'Cache-Control':'no-store'};
export async function GET(request){
 const s=currentSession(request);
 if(!s)return Response.json({signedIn:false,configured:Boolean(sessionKey()&&engineBase())},{status:401,headers:nostore});
 return Response.json({signedIn:true,identity:{id:s.identityId,displayName:s.name}},{headers:nostore});
}
export async function POST(request,{fetchImpl=fetch}={}){
 if(!sameOrigin(request))return Response.json({code:'cross_site_request'},{status:403,headers:nostore});
 const key=sessionKey();if(!key)return Response.json({code:'session_unconfigured',message:'SCC_SESSION_SECRET is not configured'},{status:503,headers:nostore});
 let token;try{token=(await request.json()).token}catch{return Response.json({code:'invalid_json'},{status:400,headers:nostore})}
 const v=await verifyEngineToken(String(token||'').trim(),{fetchImpl});
 if(!v.ok)return Response.json({code:v.code},{status:v.status,headers:nostore});
 return Response.json({signedIn:true,identity:v.identity,tenants:v.tenants},{headers:{...nostore,'Set-Cookie':sessionCookie(request,v.payload,key)}});
}
export async function DELETE(request){
 if(!sameOrigin(request))return Response.json({code:'cross_site_request'},{status:403,headers:nostore});
 return Response.json({signedIn:false},{headers:{...nostore,'Set-Cookie':clearCookie(request)}});
}
