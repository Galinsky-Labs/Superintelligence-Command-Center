"use client";
import React,{useState} from 'react';
import {EngineSessionProvider,SessionBadge,useEngineSession} from '../../components/engine-session.mjs';
import {BatchPanel,RecipesPanel,TeamPanel,UsagePanel,DataPanel} from '../../components/manage-panels.mjs';
const TABS=[['batch','Batch',BatchPanel],['recipes','Templates & recipes',RecipesPanel],['usage','Usage & keys',UsagePanel],['team','Team',TeamPanel],['data','Data & exports',DataPanel]];
function Console(){
 const h=React.createElement,s=useEngineSession();const [tab,setTab]=useState('batch');const Panel=TABS.find(t=>t[0]===tab)[2];
 return h('div',{className:'app-frame'},h('a',{className:'skip-link',href:'#main'},'Skip to main content'),
  h('header',{className:'app-header'},h('div',{className:'brand'},h('span',{className:'brand-mark','aria-hidden':'true'},'▣'),h('a',{href:'/',className:'brand-link'},'Superintelligence Command Center')),h('div',{className:'command-header-tools'},h(SessionBadge))),
  h('main',{id:'main',className:'app-main manage',tabIndex:-1},h('h1',null,'Operations'),
   h('div',{role:'tablist','aria-label':'Operations'},...TABS.map(([k,l])=>h('button',{key:k,type:'button',role:'tab','aria-selected':tab===k,className:tab===k?'active':'',onClick:()=>setTab(k)},l))),
   s.status==='signed-in'?h(Panel,{key:tab+s.tenantId}):h('p',null,s.status==='checking'?'Checking your session…':h('a',{href:'/signin'},'Sign in to manage your workspace.'))));
}
export default function Page(){return React.createElement(EngineSessionProvider,null,React.createElement(Console))}
