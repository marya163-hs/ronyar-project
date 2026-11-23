// One temporary same-document entry protects the current UI, never financial data.
export type BackState={enabled:boolean;away:boolean;menuOpen:boolean;home:()=>void;closeMenu:()=>void};
type DialogPort={getAttribute:(name:string)=>string|null;dispatchEvent:(event:Event)=>boolean};
type Port={history:Pick<History,'state'|'pushState'|'back'>;read:()=>BackState;dialogs:()=>DialogPort[];cancel:()=>Event;listen:(fn:()=>void)=>()=>void};
const marker='ranyarBackGuard';
export function createBackNavigation(port:Port){
 let pending=false,disposed=false;
 const guarded=()=>port.history.state?.[marker]===1;
 const needed=()=>{const s=port.read();return s.enabled&&(s.away||s.menuOpen||port.dialogs().length>0);};
 function sync(){if(disposed||pending)return;if(needed()){if(!guarded())port.history.pushState({[marker]:1},'');}else if(guarded()){pending=true;port.history.back();}}
 function pop(){if(disposed)return;if(pending){pending=false;sync();return;}if(guarded()){sync();return;}if(!needed())return;
  // Re-arm before closing: nested dialogs and an in-flight request must remain protected.
  port.history.pushState({[marker]:1},'');
  const dialogs=port.dialogs(),top=dialogs.at(-1),s=port.read();
  if(top){if(top.getAttribute('aria-busy')!=='true')top.dispatchEvent(port.cancel());}
  else if(s.menuOpen)s.closeMenu();else if(s.away)s.home();
  sync();
 }
 const unlisten=port.listen(pop);sync();
 return{sync,dispose(){disposed=true;unlisten();if(!pending&&guarded())port.history.back();}};
}
