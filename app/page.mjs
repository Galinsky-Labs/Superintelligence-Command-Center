"use client";
import React,{useEffect,useMemo,useRef,useState} from 'react';
import {WorkspaceShell,ToolPanel,DomainTool,WORKSPACE_DOMAINS,ProjectPortal} from '@superintelligence/ui';
import CommandPalette from '../components/command-palette.mjs';
import ModelControls from '../components/model-controls.mjs';
import ProjectExplorer from '../components/project-explorer.mjs';
import JobTray from '../components/job-tray.mjs';
import Workbench from '../components/workbench.mjs';
import {EngineSessionProvider,SessionBadge,useEngineSession} from '../components/engine-session.mjs';
import {engineJobClient} from '../components/engine-jobs.mjs';

import {DEFAULT_NAV_WIDTH,MIN_NAV_WIDTH,MAX_NAV_WIDTH,readNavWidth,saveNavWidth,keyboardNavWidth,optionalBrowserStorage,navWidthFromPointer} from '../components/workspace-layout.mjs';
const names={code:'Code',music:'Music',poetry:'Poetry','persuasive-writing':'Persuasive writing',research:'Research',legislation:'Legislation',image:'Images',video:'Film & video',voice:'Voice',data:'Data',workflow:'Workflows'};
const controls=[{id:'objective',kind:'textarea',label:'Project objective',description:'Notes on what you want to accomplish. Kept in this browser tab; use the AI workbench above to generate and save work to the engine.',rows:5}];
export default function Page(){return React.createElement(EngineSessionProvider,null,React.createElement(CommandCenter))}
function CommandCenter(){
 const session=useEngineSession();
 const [origin,setOrigin]=useState('');
 useEffect(()=>{setOrigin(window.location.origin)},[]);
 const jobs=useMemo(()=>engineJobClient(session.client),[session.client]);
 const [engine,setEngine]=useState({status:'checking'});
 const [active,setActive]=useState('research');
 const [drafts,setDrafts]=useState({});
 const [message,setMessage]=useState('');
 const [navWidth,setNavWidth]=useState(DEFAULT_NAV_WIDTH);
 const navPointerActive=useRef(false);
 useEffect(()=>{if(typeof window!=='undefined'){
   const storage=optionalBrowserStorage(window);if(storage)setNavWidth(readNavWidth(storage,active));
   else setNavWidth(DEFAULT_NAV_WIDTH);
 }},[active]);
 function onResizeNavigation(event){
   const next=keyboardNavWidth(navWidth,event.key,event.shiftKey);
   if(next===null)return;
   event.preventDefault();setNavWidth(next);
   if(typeof window!=='undefined'&&optionalBrowserStorage(window))saveNavWidth(optionalBrowserStorage(window),active,next);
 }
 function resizeNavigationPointer(event){
   if(!navPointerActive.current)return;
   const rect=event.currentTarget.parentElement?.getBoundingClientRect();
   if(!rect)return;
   setNavWidth(navWidthFromPointer(event.clientX,rect.left));
 }
 function endNavigationPointer(event){
   if(!navPointerActive.current)return;
   navPointerActive.current=false;
   const rect=event.currentTarget.parentElement?.getBoundingClientRect();
   if(!rect)return;
   const next=navWidthFromPointer(event.clientX,rect.left);
   setNavWidth(next);
   if(typeof window!=='undefined'&&optionalBrowserStorage(window))
     saveNavWidth(optionalBrowserStorage(window),active,next);
 }
 function resetNavigation(){
   setNavWidth(DEFAULT_NAV_WIDTH);
   if(typeof window!=='undefined'&&optionalBrowserStorage(window))saveNavWidth(optionalBrowserStorage(window),active,DEFAULT_NAV_WIDTH);
 }
 useEffect(()=>{let mounted=true;fetch('/api/engine',{cache:'no-store'}).then(res=>res.json()).then(data=>{if(mounted)setEngine(data)}).catch(()=>{if(mounted)setEngine({status:'unavailable'})});return()=>{mounted=false}},[]);
 const change=(id,value)=>{setDrafts(prev=>({...prev,[active]:value}));setMessage('')};
 return React.createElement('div',{className:'app-frame'},
   React.createElement('a',{className:'skip-link',href:'#main'},'Skip to main content'),
   React.createElement('header',{className:'app-header'},
     React.createElement('div',{className:'brand'},React.createElement('span',{className:'brand-mark','aria-hidden':'true'},"▣"),React.createElement('span',null,"Superintelligence Command Center")),
     React.createElement('div',{className:'command-header-tools'},
       React.createElement(CommandPalette,{active,onChoose:domain=>{setActive(domain);setMessage('')}}),
       React.createElement('span',{className:'connection-status',role:'status','aria-live':'polite'},'Engine: '+engine.status),
       React.createElement('a',{className:'launcher-trigger',href:'/manage'},'Operations'),
       React.createElement(SessionBadge))),
   React.createElement('div',{className:'app-columns',style:{'--workspace-nav-width':navWidth+'px'}},
     React.createElement('nav',{'aria-label':'AI workspaces',className:'app-nav'},
       React.createElement('div',{className:'nav-heading'},'Workspaces'),
       ...WORKSPACE_DOMAINS.map(domain=>React.createElement('button',{key:domain,type:'button','aria-current':active===domain?'page':undefined,'data-domain-option':domain,className:active===domain?'nav-link active':'nav-link',onClick:()=>{setActive(domain);setMessage('')}},names[domain])),
       React.createElement('button',{type:'button',className:'reset-layout',onClick:resetNavigation},'Reset navigation width')),
     React.createElement('div',{className:'workspace-divider',role:'separator',tabIndex:0,
       'aria-label':'Resize workspace navigation','aria-orientation':'vertical',
       'aria-valuemin':MIN_NAV_WIDTH,'aria-valuemax':MAX_NAV_WIDTH,'aria-valuenow':navWidth,
       'aria-valuetext':navWidth+' pixels',onKeyDown:onResizeNavigation,
       onPointerDown:event=>{if(event.button!==0)return;navPointerActive.current=true;event.currentTarget.setPointerCapture?.(event.pointerId)},
       onPointerMove:resizeNavigationPointer,
       onPointerUp:endNavigationPointer,
       onPointerCancel:()=>{navPointerActive.current=false},
       title:'Use left and right arrow keys to resize; Home and End choose extremes'}),
     React.createElement('main',{id:'main',className:'app-main',tabIndex:-1},
       React.createElement('div',{className:'hero'},React.createElement('p',{className:'eyebrow'},"AI COMMAND WORKSPACE"),React.createElement('h1',null,"Everything you create, in one place"),React.createElement('p',null,"Choose a domain. The workspace interface is shared with Academy, without instructional overlays or courseware.")),
       React.createElement(ProjectPortal,{product:"command",domain:active,engineOrigin:origin,companionOrigin:process.env.NEXT_PUBLIC_ACADEMY_ORIGIN||'',onOpenProject:project=>{if(WORKSPACE_DOMAINS.includes(project.kind))setActive(project.kind);setMessage('')}}),
       React.createElement(ProjectExplorer,{domain:active,engineOrigin:origin,onOpenProject:p=>{if(WORKSPACE_DOMAINS.includes(p.kind))setActive(p.kind)}}),
       React.createElement(JobTray,{key:session.tenantId||'none',client:jobs}),
       React.createElement(ModelControls,{domain:active}),
       React.createElement(WorkspaceShell,{product:"command",domain:active,title:names[active]},
         React.createElement(Workbench,{domain:active}),
         React.createElement(ToolPanel,{title:'Project notes'},
           React.createElement('p',{className:'status-note'},engine.status==='connected'?'The engine is reachable.':'The engine is '+(engine.status==='checking'?'being checked':'not available right now')+'; notes stay in this browser tab.'),
           React.createElement(DomainTool,{product:"command",domain:active,title:'Project brief',controls,values:{objective:drafts[active]||''},onFieldChange:change,onSubmit:()=>setMessage(session.status==='signed-in'?'Notes kept for this tab. Paste them into the workbench prompt to generate with the engine.':'Notes kept for this tab. Sign in to generate with the engine.'),submitLabel:'Keep notes'}),
           React.createElement('p',{role:'status','aria-live':'polite',className:'action-message'},message))
       ))
   )
 );
}
