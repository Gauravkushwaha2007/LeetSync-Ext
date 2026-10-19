(function(root){
'use strict';
const TOKEN_TIMEOUT=15000;
function failure(message,retryable=false){return Object.assign(new Error(message),{retryable});}
function base64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
async function pkce(){const verifier=base64url(crypto.getRandomValues(new Uint8Array(32)));const challenge=base64url(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))));return {verifier,challenge};}
function checkConfig(config,extensionId){
 if(!config || !/^[A-Za-z0-9._-]{8,100}$/.test(config.clientId||'') || config.extensionId!==extensionId)throw failure('GitHub sign-in is not configured for this extension build. Contact the publisher.');
 let u;try{u=new URL(config.brokerOrigin);}catch{throw failure('Authentication service is not configured.');}
 if(u.protocol!=='https:' || u.origin!==config.brokerOrigin || u.username || u.password)throw failure('Authentication service must use a fixed HTTPS origin.');
 return config;
}
function validateCallback(raw,expected,state){
 let u;try{u=new URL(raw);}catch{throw failure('GitHub sign-in was cancelled.');}
 const e=new URL(expected);
 if(u.origin!==e.origin||u.pathname!==e.pathname||u.hash||u.searchParams.getAll('state').length!==1||u.searchParams.get('state')!==state)throw failure('GitHub sign-in verification failed. Please try again.');
 if(u.searchParams.has('error'))throw failure('GitHub authorization was declined.');
 if(u.searchParams.getAll('code').length!==1 || !/^[A-Za-z0-9_-]{1,256}$/.test(u.searchParams.get('code')||''))throw failure('GitHub did not return a valid authorization code.');
 return u.searchParams.get('code');
}
async function broker(config,path,body,fetchImpl=fetch){
 let response;try{response=await fetchImpl(`${config.brokerOrigin}${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),credentials:'omit',redirect:'error',signal:AbortSignal.timeout(TOKEN_TIMEOUT)});}catch{throw failure('Authentication service is unavailable. Please try again.',true);}
 let data;try{data=await response.json();}catch{throw failure('Authentication service returned an invalid response.',true);}
 if(!response.ok)throw failure(response.status===429?'Too many sign-in attempts. Please wait and try again.':response.status===401?'GitHub session expired. Connect again.':'GitHub authentication failed. Please try again.',response.status>=500||response.status===429);
 return data;
}
function credentials(data){
 if(typeof data.access_token!=='string'||!data.access_token||data.access_token.length>2048||String(data.token_type).toLowerCase()!=='bearer')throw failure('Invalid OAuth token response.');
 const scope=typeof data.scope==='string'?data.scope:'';
 if(!scope.split(/[ ,]+/).some(s=>s==='repo'||s==='public_repo'))throw failure('Repository permission was not granted. Connect again and approve access.');
 return {accessToken:data.access_token,refreshToken:typeof data.refresh_token==='string'?data.refresh_token:'',expiresAt:Number(data.expires_in)>0?Date.now()+Number(data.expires_in)*1000:0,refreshExpiresAt:Number(data.refresh_token_expires_in)>0?Date.now()+Number(data.refresh_token_expires_in)*1000:0,scope};
}
async function identify(token,fetchImpl=fetch){
 let r;try{r=await fetchImpl('https://api.github.com/user',{headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},credentials:'omit',redirect:'error',signal:AbortSignal.timeout(TOKEN_TIMEOUT)});}catch{throw failure('Could not verify your GitHub account. Try again.',true);}
 if(!r.ok)throw failure('GitHub account verification failed. Connect again.');
 const u=await r.json();if(!Number.isSafeInteger(u.id)||u.id<=0||!u.login)throw failure('Invalid GitHub account response.');
 return {id:String(u.id),login:String(u.login),name:typeof u.name==='string'?u.name:''};
}
async function authorize(config,chromeApi,privateRepos=false,fetchImpl=fetch){
 checkConfig(config,chromeApi.runtime.id);
 const proof=await pkce(),state=base64url(crypto.getRandomValues(new Uint8Array(32))),redirectUri=chromeApi.identity.getRedirectURL('github');
 const startedAt=Date.now();
 await chromeApi.storage.session.set({oauthPending:{state,verifier:proof.verifier,redirectUri,startedAt}});
 const u=new URL('https://github.com/login/oauth/authorize');u.search=new URLSearchParams({client_id:config.clientId,redirect_uri:redirectUri,state,code_challenge:proof.challenge,code_challenge_method:'S256',scope:`${privateRepos?'repo':'public_repo'} read:user offline_access`,prompt:'select_account'}).toString();
 let issued;
 try{
  let callback;try{callback=await chromeApi.identity.launchWebAuthFlow({url:u.href,interactive:true});}catch{throw failure('GitHub sign-in was cancelled or could not open.');}
  const pending=(await chromeApi.storage.session.get('oauthPending')).oauthPending;
  if(!pending||pending.state!==state||Date.now()-pending.startedAt>10*60*1000)throw failure('Sign-in expired. Please connect again.');
  const code=validateCallback(callback,redirectUri,state);
  await chromeApi.storage.session.remove('oauthPending'); // Consume before exchange; no replay.
  issued=credentials(await broker(config,'/oauth/exchange',{code,codeVerifier:proof.verifier,redirectUri},fetchImpl));
  const user=await identify(issued.accessToken,fetchImpl);
  return {...issued,user,sessionId:crypto.randomUUID(),status:'connected'};
 }catch(e){if(issued)await broker(config,'/oauth/revoke',{accessToken:issued.accessToken},fetchImpl).catch(()=>{});throw e;}
 finally{await chromeApi.storage.session.remove('oauthPending');}
}
const api={pkce,checkConfig,validateCallback,broker,credentials,identify,authorize};
if(typeof module!=='undefined')module.exports=api;else root.AutoSyncOAuth=api;
})(globalThis);
