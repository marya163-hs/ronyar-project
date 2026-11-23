import "./desktopInstallEvents";
import {useEffect,useState} from 'react';
import StaffActivation from './StaffActivation';
import PasswordReset from './PasswordReset';
import "./styles.css";
import { createRoot } from "react-dom/client";
import App from "./App";
document.title = "رانیار | RANYAR";
function EntryRouter(){
 const [route,setRoute]=useState(()=>location.hash);
 useEffect(()=>{const changed=()=>setRoute(location.hash);window.addEventListener('hashchange',changed);return()=>window.removeEventListener('hashchange',changed);},[]);
 return route.startsWith('#activate-staff')?<StaffActivation key={route}/>:route.startsWith('#reset-password')?<PasswordReset key={route}/>:<App/>;
}
createRoot(document.getElementById("root")!).render(<EntryRouter/>);

import "./ranyar-theme.css";

import "./ranyar-dashboard.css";

import "./ranyar-assistant-first.css";

import "./ranyar-dashboard-polish.css";
