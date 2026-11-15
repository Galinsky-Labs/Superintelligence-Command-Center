"use client";
// Browser side of the Command Center session: the engine is reached only through this app's same-origin
// /v1 proxy, which attaches the signed-in user's token server-side.
import React,{createContext,useCallback,useContext,useEffect,useMemo,useState} from 'react';
import {EngineClient} from '../vendor/engine/packages/sdk/src/index.mjs';

const TENANT_KEY='scc.tenant';
export const DOMAIN_OPERATIONS=Object.freeze({
 research:['research.brief','research.deep'],poetry:['writing.poem','writing.revise'],
 'persuasive-writing':['writing.persuasive','writing.fiction','writing.revise'],legislation:['legislation.draft','legislation.analyze'],
 code:['code.build','code.review'],data:['data.analyze'],image:['image.generate','image.art-direct'],music:['music.compose'],
 video:['video.generate'],voice:['voice.speak','voice.transcribe'],workflow:['crossmedia.campaign']
});
export function operationsForDomain(workspaces,domain){
 const wanted=DOMAIN_OPERATIONS[domain]||[];
 const all=(workspaces||[]).flatMap(w=>Array.isArray(w.operations)?w.operations:[]);
 return wanted.map(id=>all.find(o=>o.id===id)).filter(Boolean);
}
export function sameOriginClient(tenantId,{origin=typeof window==='undefined'?'':window.location.origin,fetchImpl}={}){
 if(!origin)return null;
 return new EngineClient({baseUrl:origin,tenantId:tenantId||undefined,credentials:'same-origin',...(fetchImpl?{fetchImpl}:{})});
}
const Ctx=createContext({status:'checking',client:null,tenants:[],tenantId:'',identity:null});
export function useEngineSession(){return useContext(Ctx)}

export function EngineSessionProvider({children}){
 const [state,setState]=useState({status:'checking',identity:null,tenants:[],tenantId:'',configured:true});
 const refresh=useCallback(async()=>{
  try{
   const r=await fetch('/api/session',{cache:'no-store'});const s=await r.json();
   if(!r.ok||!s.signedIn){setState({status:'signed-out',identity:null,tenants:[],tenantId:'',configured:s.configured!==false});return}
   const base=sameOriginClient('');const t=await base.tenants();
   const tenants=Array.isArray(t.items)?t.items:[];
   let saved='';try{saved=localStorage.getItem(TENANT_KEY)||''}catch{}
   setState({status:'signed-in',identity:s.identity,tenants,tenantId:tenants.some(x=>x.id===saved)?saved:tenants[0]?.id||'',configured:true});
  }catch{setState(prev=>({...prev,status:'unavailable'}))}
 },[]);
 useEffect(()=>{refresh()},[refresh]);
 const chooseTenant=useCallback(id=>{try{localStorage.setItem(TENANT_KEY,id)}catch{};setState(prev=>({...prev,tenantId:id}))},[]);
 const signOut=useCallback(async()=>{await fetch('/api/session',{method:'DELETE'}).catch(()=>{});await refresh()},[refresh]);
 const client=useMemo(()=>state.status==='signed-in'&&state.tenantId?sameOriginClient(state.tenantId):null,[state.status,state.tenantId]);
 const value=useMemo(()=>({...state,client,chooseTenant,signOut,refresh}),[state,client,chooseTenant,signOut,refresh]);
 return React.createElement(Ctx.Provider,{value},children);
}

export function SessionBadge(){
 const s=useEngineSession();const h=React.createElement;
 if(s.status==='checking')return h('span',{className:'connection-status',role:'status'},'Checking session…');
 if(s.status!=='signed-in')return h('a',{className:'launcher-trigger',href:'/signin'},s.configured===false?'Sign-in not configured':'Sign in');
 return h('div',{className:'session-badge'},
  s.tenants.length>1?h('label',null,h('span',{className:'visually-hidden'},'Workspace'),
   h('select',{'aria-label':'Workspace',value:s.tenantId,onChange:e=>s.chooseTenant(e.target.value)},...s.tenants.map(t=>h('option',{key:t.id,value:t.id},t.name)))):
   h('span',{className:'connection-status'},s.tenants[0]?.name||'No workspace'),
  h('span',{className:'session-name'},s.identity?.displayName||'Signed in'),
  h('button',{type:'button',className:'launcher-trigger',onClick:s.signOut},'Sign out'));
}
