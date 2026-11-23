const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),assert=require('assert/strict');
const base=path.join(__dirname,'..'); let count=0;
function check(name,fn){fn();console.log('PASS',name);count++;}
function harness(standalone=false){
 const handlers={},media={matches:standalone,addEventListener(name,fn){this.change=fn}};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(base,'src/desktopInstallEvents.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,window:{matchMedia:()=>media,addEventListener:(n,f)=>handlers[n]=f},Set});
 return {api:module.exports,handlers,media};
}
(async()=>{
 let h=harness(); check('no prompt is fabricated',()=>assert.equal(h.api.installAvailable(),false));
 check('unsupported browser returns unavailable',()=>{}); assert.equal(await h.api.requestInstall(),'unavailable');
 let prompted=0,prevented=0,notifications=0;
 const unsubscribe=h.api.subscribeInstall(()=>notifications++);
 h.handlers.beforeinstallprompt({preventDefault(){prevented++},async prompt(){prompted++},userChoice:Promise.resolve({outcome:'accepted'})});
 check('early browser event retained',()=>{assert.equal(prevented,1);assert.equal(h.api.installAvailable(),true);assert.equal(notifications,1)});
 assert.equal(await h.api.requestInstall(),'accepted');
 check('one browser gesture consumes prompt',()=>{assert.equal(prompted,1);assert.equal(h.api.installAvailable(),false);assert.equal(h.api.installedWindow(),false)});
 assert.equal(await h.api.requestInstall(),'unavailable');
 h.handlers.appinstalled(); check('actual appinstalled event updates state',()=>assert.equal(h.api.installedWindow(),true));
 unsubscribe(); const before=notifications; h.handlers.appinstalled(); check('subscription cleanup works',()=>assert.equal(notifications,before));
 h=harness();h.handlers.beforeinstallprompt({preventDefault(){},async prompt(){},userChoice:Promise.resolve({outcome:'dismissed'})});assert.equal(await h.api.requestInstall(),'dismissed');check('dismissal does not claim installed',()=>assert.equal(h.api.installedWindow(),false));
 h=harness();h.handlers.beforeinstallprompt({preventDefault(){},async prompt(){throw Error('blocked')},userChoice:Promise.resolve({outcome:'dismissed'})});assert.equal(await h.api.requestInstall(),'failed');check('browser failure releases consumed prompt',()=>assert.equal(h.api.installAvailable(),false));
 h=harness(true);check('standalone window detected',()=>assert.equal(h.api.installedWindow(),true));
 const m=JSON.parse(fs.readFileSync(path.join(base,'public/manifest.json')));
 check('same-origin app identity and scope',()=>{assert.equal(m.id,'/');assert.equal(m.start_url,'/');assert.equal(m.scope,'/');assert.equal(m.display,'standalone')});
 check('real PNG dimensions match manifest',()=>m.icons.forEach(i=>{const b=fs.readFileSync(path.join(base,'public',i.src));assert.equal(`${b.readUInt32BE(16)}x${b.readUInt32BE(20)}`,i.sizes)}));
 console.log('PASS',count,'desktop checks; browser/Windows installation still requires device verification');
})().catch(e=>{console.error(e);process.exitCode=1});
