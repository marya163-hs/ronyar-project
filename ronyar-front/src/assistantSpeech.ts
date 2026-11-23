export type SpeechPhase="idle"|"starting"|"listening"|"finishing";
export type RecognitionResult={isFinal:boolean;[index:number]:{transcript:string}};
export type RecognitionEvent={resultIndex:number;results:{length:number;[index:number]:RecognitionResult}};
export type RecognitionEngine={lang:string;continuous:boolean;interimResults:boolean;maxAlternatives:number;onstart:(()=>void)|null;onresult:((event:RecognitionEvent)=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void;stop:()=>void;abort:()=>void};
export type RecognitionConstructor=new()=>RecognitionEngine;
export function speechCapability(scope:{isSecureContext?:boolean;SpeechRecognition?:RecognitionConstructor;webkitSpeechRecognition?:RecognitionConstructor}){
  if(scope.isSecureContext!==true)return {engine:null,reason:"برای گفتار، برنامه را روی HTTPS یا localhost باز کنید."};
  const engine=scope.SpeechRecognition??scope.webkitSpeechRecognition;
  return engine?{engine,reason:""}:{engine:null,reason:"ورودی صوتی در این مرورگر در دسترس نیست؛ می‌توانید پیام را تایپ کنید یا با Chrome امتحان کنید."};
}
const speechErrors:Record<string,string>={"not-allowed":"اجازه میکروفون داده نشد؛ از تنظیمات سایت در مرورگر اجازه بدهید و دوباره امتحان کنید.","service-not-allowed":"سرویس گفتار مرورگر در دسترس نیست؛ پیام را تایپ کنید.","audio-capture":"میکروفون پیدا نشد یا در اختیار برنامه دیگری است.","no-speech":"گفتاری تشخیص داده نشد؛ دوباره صحبت کنید.",network:"اتصال به سرویس گفتار مرورگر برقرار نشد؛ پیام را تایپ کنید یا دوباره تلاش کنید.","language-not-supported":"سرویس مرورگر گفتار فارسی را پشتیبانی نکرد؛ پیام را تایپ کنید.",aborted:"گفتار متوقف شد؛ متن قبلی حفظ شده است."};
type Events={phase:(phase:SpeechPhase)=>void;preview:(text:string)=>void;message:(text:string)=>void;error:(message:string)=>void};
/** Dictation only: this session cannot call an API or execute a store operation. */
export function createSpeechSession(Engine:RecognitionConstructor,events:Events){
  let current:RecognitionEngine|null=null,generation=0,disposed=false,finishing=false,base="",parts=new Map<number,string>();
  let duration:ReturnType<typeof setTimeout>|null=null,completion:ReturnType<typeof setTimeout>|null=null;
  const clearTimers=()=>{if(duration!==null)clearTimeout(duration);if(completion!==null)clearTimeout(completion);duration=null;completion=null;};
  const reset=(abort:boolean)=>{clearTimers();const old=current;current=null;generation++;if(old){old.onstart=old.onresult=old.onerror=old.onend=null;if(abort)try{old.abort();}catch{}}parts.clear();};
  function fail(message:string){reset(true);if(!disposed){events.preview("");events.error(message);events.phase("idle");}}
  function stop(){if(!current||disposed)return;finishing=true;events.phase("finishing");if(duration!==null){clearTimeout(duration);duration=null;}if(completion!==null)return;
    completion=setTimeout(()=>fail("نتیجه گفتار دریافت نشد؛ متن قبلی حفظ شد. دوباره امتحان کنید یا تایپ کنید."),5000);
    try{current.stop();}catch{fail("گفتار متوقف شد؛ دوباره امتحان کنید یا تایپ کنید.");}
  }
  function start(value:string){
    if(current||disposed)return;let engine:RecognitionEngine;
    try{engine=new Engine();}catch{events.error("سرویس گفتار مرورگر راه‌اندازی نشد؛ پیام را تایپ کنید.");return;}
    base=value;finishing=false;parts.clear();current=engine;const id=++generation;
    const valid=()=>!disposed&&id===generation&&current===engine;
    engine.lang="fa-IR";engine.continuous=false;engine.interimResults=true;engine.maxAlternatives=1;
    engine.onstart=()=>{if(valid()&&!finishing)events.phase("listening");};
    engine.onresult=event=>{
      if(!valid())return;let partial="";
      // Results are cumulative; replacing by result index prevents duplicate final segments.
      for(let i=0;i<event.results.length;i++){
        const result=event.results[i],transcript=result?.[0]?.transcript;
        if(typeof transcript!=="string")continue;
        if(result.isFinal)parts.set(i,transcript.trim());else partial+=(partial?" ":"")+transcript.trim();
      }
      const final=[...parts.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>v).filter(Boolean).join(" ");
      const preview=[final,partial].filter(Boolean).join(" ");
      if([base.trimEnd(),preview].filter(Boolean).join(" ").length>4000){fail("متن گفتار بیش از حد طولانی شد؛ پیام را کوتاه‌تر بگویید. متن قبلی حفظ شد.");return;}
      events.preview(preview);
    };
    engine.onerror=event=>{if(valid())fail(speechErrors[event.error]??"تبدیل گفتار انجام نشد؛ دوباره امتحان کنید یا تایپ کنید.");};
    engine.onend=()=>{
      if(!valid())return;const transcript=[...parts.entries()].sort((a,b)=>a[0]-b[0]).map(([,v])=>v).filter(Boolean).join(" ");
      const message=[base.trimEnd(),transcript].filter(Boolean).join(" ");reset(false);
      if(disposed)return;events.preview("");if(transcript&&message.length<=4000)events.message(message);else events.error("متن نهایی گفتار دریافت نشد؛ دوباره صحبت کنید. متن قبلی حفظ شد.");events.phase("idle");
    };
    events.preview("");events.error("");events.phase("starting");
    duration=setTimeout(stop,30000);
    try{engine.start();}catch{fail("میکروفون یا سرویس گفتار آماده نیست؛ دسترسی میکروفون را بررسی کنید یا تایپ کنید.");}
  }
  return {start,stop,cancel:(message="گفتار لغو شد؛ متن قبلی حفظ شد.")=>{if(current)fail(message);},dispose:()=>{disposed=true;reset(true);},get active(){return current!==null;}};
}
