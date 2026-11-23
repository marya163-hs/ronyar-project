import {useEffect,useRef} from 'react';
import {createBackNavigation} from './backNavigation';
import type {BackState} from './backNavigation';
export default function useBackNavigation(state:BackState){
 const latest=useRef(state);latest.current=state;
 const control=useRef<ReturnType<typeof createBackNavigation>|null>(null);
 useEffect(()=>{
  const c=createBackNavigation({history:window.history,read:()=>latest.current,dialogs:()=>{
   const all=Array.from(document.querySelectorAll<HTMLDialogElement>('dialog[open]'));
   const focused=document.activeElement?.closest<HTMLDialogElement>('dialog[open]');
   return focused?[...all.filter(d=>d!==focused),focused]:all;
  },cancel:()=>new Event('cancel',{cancelable:true}),listen:fn=>{window.addEventListener('popstate',fn);return()=>window.removeEventListener('popstate',fn);}});
  control.current=c;
  const observer=new MutationObserver(()=>c.sync());observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['open']});
  return()=>{observer.disconnect();c.dispose();control.current=null;};
 },[]);
 useEffect(()=>{control.current?.sync();});
}
