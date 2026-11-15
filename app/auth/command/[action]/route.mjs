// Compatibility endpoints for the shared ProjectPortal client, which expects the engine's SSO routes on
// its configured origin. Command Center is that origin (BFF), so these map onto the token session.
import {currentSession,clearCookie,sameOrigin} from '../../../../lib/session.mjs';
export const dynamic='force-dynamic';
const nostore={'Cache-Control':'no-store'};
export async function GET(request,{params}){
 const {action}=await params;
 if(action==='start')return Response.redirect(new URL('/signin',request.url),302);
 if(action==='session'){
  const s=currentSession(request);
  return s?Response.json({identityId:s.identityId,product:'command'},{headers:nostore}):Response.json({code:'unauthenticated'},{status:401,headers:nostore});
 }
 return Response.json({code:'not_found'},{status:404,headers:nostore});
}
export async function POST(request,{params}){
 const {action}=await params;
 if(action!=='logout')return Response.json({code:'not_found'},{status:404,headers:nostore});
 if(!sameOrigin(request))return Response.json({code:'cross_site_request'},{status:403,headers:nostore});
 return Response.json({signedIn:false},{headers:{...nostore,'Set-Cookie':clearCookie(request)}});
}
