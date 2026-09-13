importScripts('queue.js');
const Q=AutoSyncQueue;
const defaults={port:3000,key:'',paused:false,target:'',repository:'',branch:'',folder:''};
// Serialize read-modify-write operations across popup, alarms and content scripts.
let lock=Promise.resolve();
function atomic(fn){const job=lock.then(fn);lock=job.catch(()=>{});return job;}
const ready=chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
async function state(){await ready;const data=await chrome.storage.local.get(['settings','items']);return {settings:{...defaults,...data.settings},items:data.items||[]};}
async function badge(items){const count=items.filter(x=>!Q.terminal(x.status)).length;await chrome.action.setBadgeText({text:count?String(count):''});await chrome.action.setBadgeBackgroundColor({color:items.some(x=>x.status==='failed')?'#a04b2e':'#24765c'});}
async function save(items){await chrome.storage.local.set({items});await badge(items);}
async function api(settings,path,body){
  let response;
  try{response=await fetch(`http://127.0.0.1:${settings.port}${path}`,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-AutoSync-Key':settings.key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});}
  catch{throw Object.assign(new Error('Local service unavailable. Start npm start and check the port.'),{retryable:true});}
  let result;try{result=await response.json();}catch{throw Object.assign(new Error('Unexpected local service response.'),{retryable:true});}
  if(!response.ok)throw Object.assign(new Error(result.message||'Sync failed.'),{retryable:result.retryable===true,retryAfter:result.retryAfter||0});
  return result;
}
async function enqueue(submission,source){
  return atomic(async()=>{
    const {settings,items}=await state();const s=Q.clean(submission);
    if(!settings.target)throw new Error('Connect a repository in AutoSync Settings first. Use Add solution to save this submission afterward.');
    const bytes=new TextEncoder().encode(JSON.stringify([settings.target,s.slug,s.language,s.code]));
    const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    const item={...s,id:crypto.randomUUID(),target:settings.target,destination:settings.repository,fingerprint,source,status:'queued',attempts:0,nextAttempt:0,createdAt:Date.now()};
    const added=Q.add(items,item);await save(added.items);return {ok:true,duplicate:added.duplicate};
  });
}
let draining=false;
async function drain(){
  if(draining)return;draining=true;
  try {
    // One request per run stays under MV3 service-worker event limits. The alarm drains the rest.
    const work=await atomic(async()=>{
      const {settings,items}=await state();if(settings.paused||!settings.key)return null;
      const ordered=[...items].reverse();
      const item=ordered.find((x,index)=>['queued','retrying','syncing'].includes(x.status)&&x.nextAttempt<=Date.now()&&!ordered.slice(0,index).some(old=>!Q.terminal(old.status)&&old.target===x.target&&old.slug===x.slug&&old.language===x.language));
      if(!item)return null;
      if(item.target!==settings.target){item.status='failed';item.error='Destination changed. Export/remove this item or reconnect its original destination.';await save(items);return null;}
      item.status='syncing';item.attempts++;item.nextAttempt=Date.now()+60000;await save(items);
      return {settings,item:{...item}};
    });
    if(!work)return;
    let result,error;
    try{result=await api(work.settings,'/upload',work.item);}catch(e){error=e;}
    await atomic(async()=>{
      const {items}=await state();const item=items.find(x=>x.id===work.item.id);if(!item)return;
      if(error){item.status=error.retryable&&item.attempts<8?'retrying':'failed';item.error=error.message;item.nextAttempt=Q.retry(item.attempts,Date.now(),error.retryAfter);}
      else{item.status=result.action==='unchanged'?'unchanged':'synced';item.action=result.action;item.url=result.url;item.path=result.path;item.completedAt=Date.now();item.error=result.warning||'';delete item.code;}
      await save(items);
    });
  } finally {draining=false;}
}
async function initialize(){await ready;await chrome.alarms.create('autosync-retry',{periodInMinutes:1});await badge((await state()).items);await drain();}
chrome.runtime.onInstalled.addListener(()=>{initialize().catch(console.error);});
chrome.runtime.onStartup.addListener(()=>{initialize().catch(console.error);});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='autosync-retry')drain().catch(console.error);});
chrome.runtime.onMessage.addListener((message,sender,respond)=>{
  const own=sender.id===chrome.runtime.id && sender.url?.startsWith(chrome.runtime.getURL(''));
  const leetcode=sender.id===chrome.runtime.id && sender.tab && /^https:\/\/leetcode\.com\//.test(sender.url||'');
  const job=async()=>{
    if(message.type==='capture' && leetcode)return enqueue(message.submission,'accepted');
    if(!own)throw new Error('Message not allowed.');
    if(message.type==='state')return {ok:true,...await state()};
    if(message.type==='add')return enqueue(message.submission,'manual');
    if(message.type==='connect'){
      const port=Number(message.port);if(!Number.isInteger(port)||port<1024||port>65535||typeof message.key!=='string'||message.key.length<32)throw new Error('Enter a valid port and pairing key from setup.');
      const connection={port,key:message.key.trim()};const result=await api(connection,'/status');
      if(!result.target||!result.repository)throw new Error('This is not a compatible AutoSync v2 service.');
      await atomic(async()=>{const {settings}=await state();await chrome.storage.local.set({settings:{...settings,...connection,target:result.target,repository:result.repository,branch:result.branch,folder:result.folder}});});
      return {ok:true,message:`Connected to ${result.repository} · ${result.branch}. Contents write permission is checked on the first sync.`};
    }
    if(message.type==='pause')return atomic(async()=>{const {settings}=await state();settings.paused=!!message.paused;await chrome.storage.local.set({settings});return {ok:true};});
    if(message.type==='retry')return atomic(async()=>{const {items}=await state();for(const item of items)if((!message.id||item.id===message.id)&&['failed','retrying'].includes(item.status)){item.status='queued';item.attempts=0;item.nextAttempt=0;item.error='';}await save(items);return {ok:true};});
    if(message.type==='remove')return atomic(async()=>{const {items}=await state();if(items.find(x=>x.id===message.id)?.status==='syncing')throw new Error('Wait for the current sync to finish.');await save(items.filter(x=>x.id!==message.id));return {ok:true};});
    if(message.type==='clear')return atomic(async()=>{const {items}=await state();await save(items.filter(x=>!Q.terminal(x.status)));return {ok:true};});
    throw new Error('Unknown command.');
  };
  job().then(result=>{respond(result);if(['capture','add','connect','retry','pause'].includes(message.type))drain().catch(console.error);},error=>respond({ok:false,message:error.message}));
  return true;
});
// Alarms can be cleared after a browser restart; ensure one exists on each worker activation.
chrome.alarms.get('autosync-retry').then(a=>{if(!a)return chrome.alarms.create('autosync-retry',{periodInMinutes:1});}).catch(console.error);
