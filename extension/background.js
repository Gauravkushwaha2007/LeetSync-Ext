importScripts('config.js','queue.js','oauth.js','github.js');
const Q=AutoSyncQueue,O=AutoSyncOAuth,G=AutoSyncGitHub;
const defaults={paused:false,target:'',repoId:'',repository:'',branch:'',folder:'LeetCode'};
let lock=Promise.resolve(),draining=false,signingIn=false,refreshing=null,epoch=0;
function atomic(fn){const job=lock.then(fn);lock=job.catch(()=>{});return job;}
const ready=(async()=>{
 await chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
 await chrome.storage.session.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'});
 const old=await chrome.storage.local.get(['schema','settings','items']);
 if(old.schema!==3){if(old.items?.length)await chrome.storage.local.set({legacyV2:{items:old.items,repository:old.settings?.repository||''}});await chrome.storage.local.remove(['settings','items']);await chrome.storage.local.set({schema:3});}
})();
async function raw(){await ready;const d=await chrome.storage.local.get(['auth','profiles']);return {auth:d.auth||null,profiles:d.profiles||{}};}
function profile(d,id=d.auth?.user?.id){return d.profiles[id]||{settings:{...defaults},items:[]};}
async function persistProfile(d,id,p){d.profiles[id]=p;const legacy=(await chrome.storage.local.get(['legacyV2'])).legacyV2;const bytes=new TextEncoder().encode(JSON.stringify({profiles:d.profiles,legacy})).length;if(bytes>8_000_000)throw new Error('Browser storage is nearly full. Export and remove unused queued items before adding more.');await chrome.storage.local.set({profiles:d.profiles});await badge(p.items);}
async function badge(items=[]){const count=items.filter(x=>!Q.terminal(x.status)).length;await chrome.action.setBadgeText({text:count?String(count):''});await chrome.action.setBadgeBackgroundColor({color:items.some(x=>x.status==='failed')?'#a04b2e':'#24765c'});}
async function publicState(){const d=await raw(),p=profile(d);let configured=true;try{O.checkConfig(AutoSyncConfig,chrome.runtime.id);}catch{configured=false;}return {ok:true,settings:{...defaults,...p.settings},items:p.items,account:d.auth?{...d.auth.user,connected:d.auth.status==='connected',scope:d.auth.scope}:null,configured,signingIn,hasLegacy:!!(await chrome.storage.local.get(['legacyV2'])).legacyV2,manageAccessUrl:configured?`https://github.com/settings/connections/applications/${AutoSyncConfig.clientId}`:'https://github.com/settings/applications'};}
async function markExpired(sessionId){await atomic(async()=>{const d=await raw();if(d.auth?.sessionId!==sessionId)return;const a={...d.auth,status:'expired'};delete a.accessToken;delete a.refreshToken;await chrome.storage.local.set({auth:a});});}
async function discardToken(token){if(token)await O.broker(AutoSyncConfig,'/oauth/revoke',{accessToken:token}).catch(()=>{});}
async function accessToken(sessionId){
 let d=await raw();if(d.auth?.sessionId!==sessionId||d.auth.status!=='connected')throw new Error('Connect to GitHub again before syncing.');
 if(!d.auth.expiresAt||d.auth.expiresAt>Date.now()+60000)return d.auth.accessToken;
 if(!d.auth.refreshToken||(d.auth.refreshExpiresAt&&d.auth.refreshExpiresAt<=Date.now())){await markExpired(sessionId);throw new Error('GitHub session expired. Connect again.');}
 if(!refreshing){const before=d.auth,generation=epoch;refreshing=(async()=>{
  let next;
  try{
   next=O.credentials(await O.broker(AutoSyncConfig,'/oauth/refresh',{refreshToken:before.refreshToken}));
   const user=await O.identify(next.accessToken);
   if(user.id!==before.user.id)throw new Error('Account verification changed. Connect again.');
   await atomic(async()=>{const current=await raw();if(generation!==epoch||current.auth?.sessionId!==sessionId)throw new Error('Account connection changed.');await chrome.storage.local.set({auth:{...before,...next,user}});});
  }catch(e){if(next)await discardToken(next.accessToken);if(!e.retryable)await markExpired(sessionId);throw e;}
 })().finally(()=>refreshing=null);}
 await refreshing;d=await raw();if(d.auth?.sessionId!==sessionId||!d.auth.accessToken)throw new Error('Account connection changed.');return d.auth.accessToken;
}
function requestFor(auth){return G.client(async()=>accessToken(auth.sessionId));}
async function withAccount(fn){const d=await raw();if(!d.auth||d.auth.status!=='connected')throw new Error('Connect to GitHub first.');try{return await fn(d.auth,requestFor(d.auth));}catch(e){if(e.status===401)await markExpired(d.auth.sessionId);throw e;}}
async function login(privateRepos){
 if(signingIn)throw new Error('GitHub sign-in is already open.');signingIn=true;const generation=++epoch;
 let issued,committed=false;
 try{
  const auth=issued=await O.authorize(AutoSyncConfig,chrome,privateRepos===true);
  if(generation!==epoch)throw new Error('Sign-in was cancelled.');
  await atomic(async()=>{if(generation!==epoch)throw new Error('Sign-in was cancelled.');const d=await raw();const p=profile(d,auth.user.id);await chrome.storage.local.set({auth});await persistProfile(d,auth.user.id,p);});
  committed=true;return {ok:true,message:`Connected as ${auth.user.login}. Choose your repository.`};
 }catch(e){if(issued&&!committed){await atomic(async()=>{const current=await raw();if(current.auth?.sessionId===issued.sessionId)await chrome.storage.local.remove('auth');});await discardToken(issued.accessToken);}throw e;}finally{signingIn=false;}
}
async function disconnect(){
 epoch++;await chrome.storage.session.remove('oauthPending');
 const previous=await atomic(async()=>{const d=await raw();await chrome.storage.local.remove('auth');await badge();return d.auth;});
 let revoked=false;if(previous?.accessToken){try{await O.broker(AutoSyncConfig,'/oauth/revoke',{accessToken:previous.accessToken});revoked=true;}catch{}}
 return {ok:true,message:revoked?'Disconnected. This OAuth token was revoked.':'Disconnected locally. You can revoke any remaining access in GitHub Settings → Applications.'};
}
async function enqueue(submission,source){return atomic(async()=>{const d=await raw();if(!d.auth)throw new Error('Connect GitHub and select a repository first.');const id=d.auth.user.id,p=profile(d),s=Q.clean(submission);if(!p.settings.target)throw new Error('Select a repository in AutoSync Settings first.');const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([id,p.settings.target,s.slug,s.language,s.code])));const fingerprint=Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');const item={...s,id:crypto.randomUUID(),userId:id,repoId:p.settings.repoId,target:p.settings.target,destination:p.settings.repository,fingerprint,source,status:'queued',attempts:0,nextAttempt:0,createdAt:Date.now()};const added=Q.add(p.items,item);p.items=added.items;await persistProfile(d,id,p);return {ok:true,duplicate:added.duplicate};});}
async function drain(){
 if(draining||signingIn)return;draining=true;
 try{
  const work=await atomic(async()=>{const d=await raw();if(!d.auth||d.auth.status!=='connected')return null;const p=profile(d);if(p.settings.paused)return null;const ordered=[...p.items].reverse();const item=ordered.find((x,i)=>['queued','retrying','syncing'].includes(x.status)&&x.target===p.settings.target&&x.nextAttempt<=Date.now()&&!ordered.slice(0,i).some(o=>!Q.terminal(o.status)&&o.target===x.target&&o.slug===x.slug&&o.language===x.language));if(!item)return null;if(item.userId!==d.auth.user.id)throw new Error('Queue account mismatch.');item.status='syncing';item.attempts++;item.nextAttempt=Date.now()+60000;await persistProfile(d,d.auth.user.id,p);return {auth:d.auth,settings:{...p.settings},item:{...item}};});
  if(!work)return;let result,error;
  try{result=await G.sync(requestFor(work.auth),work.settings,work.item,work.auth.user.id);}catch(e){error=e;if(e.status===401)await markExpired(work.auth.sessionId);}
  await atomic(async()=>{const d=await raw(),p=profile(d,work.auth.user.id),item=p.items.find(x=>x.id===work.item.id);if(!item)return;if(error){item.status=error.retryable&&item.attempts<8?'retrying':'failed';item.error=error.message;item.nextAttempt=Q.retry(item.attempts,Date.now(),error.retryAfter||0);}else{item.status=result.action==='unchanged'?'unchanged':'synced';Object.assign(item,result,{completedAt:Date.now(),error:''});delete item.code;}d.profiles[work.auth.user.id]=p;await chrome.storage.local.set({profiles:d.profiles});if(d.auth?.user.id===work.auth.user.id)await badge(p.items);});
 }finally{draining=false;}
}
async function mutateProfile(fn){return atomic(async()=>{const d=await raw();if(!d.auth)throw new Error('Connect to GitHub first.');const p=profile(d);await fn(p);await persistProfile(d,d.auth.user.id,p);return {ok:true};});}
async function command(m,sender){
 const own=sender.id===chrome.runtime.id&&sender.url?.startsWith(chrome.runtime.getURL(''));
 const leetcode=sender.id===chrome.runtime.id&&sender.tab&&/^https:\/\/leetcode\.com\//.test(sender.url||'');
 if(m?.type==='capture'&&leetcode)return enqueue(m.submission,'accepted');if(!own)throw new Error('Message not allowed.');
 if(m.type==='state')return publicState();
 if(m.type==='export-legacy')return {ok:true,backup:(await chrome.storage.local.get(['legacyV2'])).legacyV2||null};
 if(m.type==='login')return login(m.privateRepos);
 if(m.type==='disconnect')return disconnect();
 if(m.type==='repos')return withAccount(async(a,r)=>({ok:true,...await G.listRepositories(r,m.page||1,a.scope.split(/[ ,]+/).includes('repo'))}));
 if(m.type==='branches')return withAccount(async(a,r)=>({ok:true,...await G.listBranches(r,m.repoId,m.page||1)}));
 if(m.type==='select-repo')return withAccount(async(a,r)=>{const settings=await G.destination(r,a.user.id,m.repoId,m.branch,m.folder);await atomic(async()=>{const d=await raw();if(d.auth?.sessionId!==a.sessionId)throw new Error('Account changed. Select the repository again.');const p=profile(d);p.settings={...p.settings,...settings};await persistProfile(d,a.user.id,p);});return {ok:true,message:`Solutions will sync to ${settings.repository} · ${settings.branch}.`};});
 if(m.type==='add')return enqueue(m.submission,'manual');
 if(m.type==='pause')return mutateProfile(p=>p.settings.paused=!!m.paused);
 if(m.type==='retry')return mutateProfile(p=>{for(const x of p.items)if((!m.id||x.id===m.id)&&['failed','retrying'].includes(x.status)){x.status='queued';x.attempts=0;x.nextAttempt=0;x.error='';}});
 if(m.type==='remove')return mutateProfile(p=>{if(p.items.find(x=>x.id===m.id)?.status==='syncing')throw new Error('Wait for the current sync to finish.');p.items=p.items.filter(x=>x.id!==m.id);});
 if(m.type==='clear')return mutateProfile(p=>p.items=p.items.filter(x=>!Q.terminal(x.status)));
 throw new Error('Unknown command.');
}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{command(m,sender).then(r=>{respond(r);if(['capture','add','login','select-repo','retry','pause'].includes(m.type))drain().catch(()=>{});},e=>respond({ok:false,message:e.message}));return true;});
async function initialize(){await ready;await chrome.alarms.create('autosync-retry',{periodInMinutes:1});await badge((await publicState()).items);await drain();}
chrome.runtime.onInstalled.addListener(details=>{initialize().then(()=>{if(details.reason==='install')chrome.runtime.openOptionsPage();}).catch(()=>{});});
chrome.runtime.onStartup.addListener(()=>initialize().catch(()=>{}));
chrome.alarms.onAlarm.addListener(a=>{if(a.name==='autosync-retry')drain().catch(()=>{});});
chrome.alarms.get('autosync-retry').then(a=>{if(!a)return chrome.alarms.create('autosync-retry',{periodInMinutes:1});}).catch(()=>{});
