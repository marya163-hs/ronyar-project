const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../platform-admin/src/challengeTime.ts'),'utf8');
const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;const api={};vm.runInNewContext(code,{exports:api,Intl,Date});let n=0;const eq=(a,b)=>{assert.equal(a,b);n++;};
for(const zone of ['UTC','America/Los_Angeles','Asia/Tehran']){process.env.TZ=zone;eq(api.tehranInput(new Date('2026-10-25T14:00:00Z')),'2026-10-25T17:30');eq(api.fromTehran('2026-10-25T17:30'),'2026-10-25T14:00:00.000Z');}
const e={state:'ACTIVE',startsAt:'2026-10-26T00:00:00Z',endsAt:'2026-10-27T00:00:00Z'};eq(api.eventState(e,Date.parse('2026-10-25T00:00:00Z')),'منتشرشده؛ در انتظار شروع');eq(api.eventState(e,Date.parse(e.startsAt)),'در حال برگزاری');eq(api.eventState(e,Date.parse(e.endsAt)),'زمان پایان رسیده');eq(api.eventState({...e,state:'CLOSED'}),'بسته');eq(api.eventState({...e,state:'DRAFT'}),'پیش‌نویس');
console.log(`PASS ${n} Tehran event time checks (three process time zones)`);
