import { useEffect, useRef, useState } from "react";
import { createSpeechSession, speechCapability } from "./assistantSpeech";
import type { RecognitionConstructor, SpeechPhase } from "./assistantSpeech";
type Props={value:string;disabled:boolean;onChange:(text:string)=>void;onActiveChange:(active:boolean)=>void};
export default function VoiceMessageInput({value,disabled,onChange,onActiveChange}:Props){
  const [phase,setPhase]=useState<SpeechPhase>("idle"),[preview,setPreview]=useState(""),[error,setError]=useState("");
  const callbacks=useRef({onChange,onActiveChange});callbacks.current={onChange,onActiveChange};
  const session=useRef<ReturnType<typeof createSpeechSession>|null>(null);
  const scope=typeof window==="undefined"?{}:window as unknown as {isSecureContext:boolean;SpeechRecognition?:RecognitionConstructor;webkitSpeechRecognition?:RecognitionConstructor};
  const capability=speechCapability(scope),active=phase!=="idle";
  useEffect(()=>{
    const hide=()=>{if(document.hidden)session.current?.cancel("با خروج از این صفحه، گفتار متوقف شد؛ متن قبلی حفظ شد.");};
    const leave=()=>session.current?.cancel();
    document.addEventListener("visibilitychange",hide);window.addEventListener("pagehide",leave);
    return()=>{document.removeEventListener("visibilitychange",hide);window.removeEventListener("pagehide",leave);session.current?.dispose();session.current=null;};
  },[]);
  useEffect(()=>{if(disabled)session.current?.cancel();},[disabled]);
  function start(){if(disabled||!capability.engine||session.current?.active)return;session.current?.dispose();session.current=createSpeechSession(capability.engine,{phase:p=>{setPhase(p);callbacks.current.onActiveChange(p!=="idle");},preview:setPreview,error:setError,message:t=>callbacks.current.onChange(t)});session.current.start(value);}
  return <div className="assistant-voice"><div className="assistant-actions">
    {!active?<button type="button" className="secondary" disabled={disabled||!capability.engine} onClick={start}>ورودی صوتی</button>:<><button type="button" className="secondary" disabled={phase==="finishing"} onClick={()=>session.current?.stop()}>{phase==="finishing"?"در حال تبدیل…":"پایان گفتار"}</button><button type="button" className="text-button" onClick={()=>session.current?.cancel()}>لغو گفتار</button></>}
    {active&&<span role="status">{phase==="starting"?"در انتظار میکروفون…":phase==="listening"?"در حال شنیدن فارسی…":"در انتظار متن نهایی…"}</span>}
  </div>
    {preview&&<p className="assistant-voice-preview" aria-live="polite">{preview}</p>}
    {error&&<p className="notice error" role="alert">{error}</p>}
    <small>{capability.engine?"پردازش صدا با سرویس مرورگر است؛ متن را پیش از ارسال بررسی کنید.":capability.reason}</small>
  </div>;
}
