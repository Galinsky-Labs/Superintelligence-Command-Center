"use client";
import React,{useState} from 'react';
export default function SignIn(){
 const h=React.createElement;
 const [token,setToken]=useState(''),[status,setStatus]=useState(''),[busy,setBusy]=useState(false);
 async function submit(e){
  e.preventDefault();setBusy(true);setStatus('');
  try{
   const r=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token})});
   const d=await r.json().catch(()=>({}));
   if(r.ok){setStatus('Signed in. Opening your workspace…');window.location.assign('/');return}
   setStatus({token_rejected:'The engine rejected this token (expired, revoked or unknown).',invalid_token_format:'That does not look like an engine API token (sie_…).',
    engine_unconfigured:'The engine URL is not configured on this deployment.',session_unconfigured:'Sessions are not configured on this deployment (SCC_SESSION_SECRET).',
    engine_unreachable:'The engine did not respond. It may be waking up; try again in a minute.'}[d.code]||'Sign-in failed ('+(d.code||r.status)+').');
  }finally{setBusy(false)}
 }
 return h('main',{id:'main',className:'signin'},
  h('h1',null,'Sign in to Command Center'),
  h('p',null,'Command Center uses your Superintelligence Engine identity. Paste an engine API token; it is kept server-side in an encrypted, HttpOnly session cookie and never stored in this browser’s scripts.'),
  h('form',{onSubmit:submit},
   h('label',{htmlFor:'token'},'Engine API token'),
   h('input',{id:'token',name:'token',type:'password',autoComplete:'off',spellCheck:false,value:token,onChange:e=>setToken(e.target.value),placeholder:'sie_…',required:true}),
   h('button',{type:'submit',disabled:busy||!token.trim()},busy?'Checking…':'Sign in')),
  h('p',{role:'status','aria-live':'polite'},status),
  h('p',{className:'signin-help'},'No token yet? The engine operator can issue one (engine console Settings → API tokens, or ',h('code',null,'npm run admin -- create-user <handle>'),'). Single sign-on via OIDC replaces this step once an identity provider is configured on the engine.'),
  h('p',null,h('a',{href:'/'},'Back to Command Center')));
}
