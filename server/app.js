'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadConfig } = require('./config');
const { SyncError, syncSubmission, githubClient, githubError } = require('./sync');
const oauth = require('./oauth');

function json(res,status,value,extra={}) { res.writeHead(status,{ 'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra }); res.end(JSON.stringify(value)); }
function createServer(config, { fetchImpl = fetch } = {}) {
  let serial=Promise.resolve(), waiting=0;
  const authenticate=req=>{const actual=Buffer.from(req.headers['x-autosync-key']||''),expected=Buffer.from(config.key||'');return !!config.key&&actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);};
  return http.createServer(async(req,res)=>{
    try {
      if(!/^((127\.0\.0\.1)|(localhost)):\d+$/.test(req.headers.host||'')) return json(res,403,{message:'Local requests only.'});
      const origin=req.headers.origin;
      if(origin&&!/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return json(res,403,{message:'Origin not allowed.'});
      if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
      if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');res.setHeader('Access-Control-Allow-Headers','Content-Type,X-AutoSync-Key,X-AutoSync-Session');return res.writeHead(204).end();}
      const url=new URL(req.url,`http://${req.headers.host}`);
      if(url.pathname==='/health'&&req.method==='GET') return json(res,200,{success:true,name:'AutoSync',version:'2.1.0'});

      // OAuth endpoints intentionally do not require the legacy pairing key.
      if(url.pathname==='/oauth/start'&&req.method==='GET'){
        const state=crypto.randomBytes(32).toString('base64url');
        const verifier=crypto.randomBytes(32).toString('base64url');
        const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
        const authUrl=oauth.begin(state,challenge,null);
        // The verifier is kept server-side by oauth.js; return only the authorization URL.
        return json(res,200,{success:true,authorizationUrl:authUrl,state});
      }
      if(url.pathname==='/oauth/callback'&&req.method==='GET'){
        if(url.searchParams.get('error')) return oauthPage(res,false,url.searchParams.get('error_description')||'GitHub authorization was cancelled.');
        const code=url.searchParams.get('code'),state=url.searchParams.get('state');
        if(!code||!state) return oauthPage(res,false,'Missing OAuth response.');
        const result=await oauth.callback(code,state);
        return oauthPage(res,true,'GitHub connected successfully.',result.sessionId);
      }
      if(url.pathname==='/oauth/session'&&req.method==='GET'){
        const session=oauth.auth(req.headers['x-autosync-session']);
        return json(res,200,{success:true,user:session.user,repository:session.repository});
      }
      if(url.pathname==='/oauth/repos'&&req.method==='GET'){
        const repos=await oauth.repositories(req.headers['x-autosync-session']);
        return json(res,200,{success:true,repositories:repos});
      }
      if(url.pathname==='/oauth/select'&&req.method==='POST'){
        const body=await readJson(req); const repo=body.repository;
        if(!repo) throw new SyncError('Repository is required.');
        const selected=oauth.selectRepository(req.headers['x-autosync-session'],repo,body.branch||'',body.folder||'LeetCode');
        return json(res,200,{success:true,repository:selected});
      }
      if(url.pathname==='/oauth/logout'&&req.method==='POST'){oauth.remove(req.headers['x-autosync-session']);return json(res,200,{success:true});}

      // Legacy endpoints remain available only for backward compatibility while OAuth is being migrated.
      if(!authenticate(req)) return json(res,401,{success:false,message:'GitHub is not connected. Use Connect GitHub.',retryable:false});
      if(url.pathname==='/status'&&req.method==='GET'){
        const r=await githubClient(config,fetchImpl)(`/repos/${config.owner}/${config.repo}`);if(!r.response.ok)throw githubError(r.response);
        if(r.data.permissions?.push===false)throw new SyncError('GitHub user does not have repository write access.',403);
        return json(res,200,{success:true,repository:`${config.owner}/${config.repo}`,branch:config.branch||r.data.default_branch,folder:config.folder,target:config.target});
      }
      if(url.pathname!=='/upload'||req.method!=='POST') return json(res,404,{message:'Route not found.'});
      if(!req.headers['content-type']?.startsWith('application/json'))throw new SyncError('Send application/json.',415);
      const payload=await readJson(req);if(waiting>=30)throw new SyncError('Sync service is busy.',503,true);waiting++;
      const job=serial.then(async()=>{const result=await syncSubmission(config,payload,fetchImpl);try{await fs.mkdir(config.dataDir,{recursive:true});const log=path.join(config.dataDir,'activity.jsonl');if((await fs.stat(log).catch(()=>({size:0}))).size>2000000)await fs.rename(log,`${log}.1`);await fs.appendFile(log,JSON.stringify({at:new Date().toISOString(),slug:payload.slug,language:payload.language,...result})+'\n');}catch{result.warning='Synced, but the local activity log could not be written.';}return result;});serial=job.catch(()=>{});try{json(res,200,await job);}finally{waiting--;}
    }catch(error){json(res,error instanceof SyncError?error.status:500,{success:false,message:error instanceof Error?error.message:'Local service error.',retryable:error instanceof SyncError?error.retryable:true,retryAfter:error.retryAfter||0});}
  });
}
async function readJson(req){const chunks=[];let length=0;for await(const chunk of req){length+=chunk.length;if(length>240000)throw new SyncError('Request is too large.',413);chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new SyncError('Invalid JSON.');}}
function oauthPage(res,ok,message,sessionId=''){const safe=String(message).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const payload=JSON.stringify({ok,message,sessionId});res.writeHead(ok?200:400,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'});res.end(`<!doctype html><meta charset="utf-8"><title>AutoSync GitHub</title><style>body{font:16px system-ui;max-width:560px;margin:15vh auto;padding:24px}button{padding:10px 16px}</style><h1>${ok?'GitHub connected ✓':'GitHub connection failed'}</h1><p>${safe}</p><script>const data=${payload};if(window.opener){window.opener.postMessage({source:'autosync',...data},'*');setTimeout(()=>window.close(),300)}else if(data.sessionId){document.body.insertAdjacentHTML('beforeend','<p>You can close this window and return to AutoSync.</p>')}</script>`);}
if(require.main===module){try{try{process.loadEnvFile(path.join(__dirname,'.env'));}catch(e){if(e.code!=='ENOENT')throw e;}const config=loadConfig();const server=createServer(config);server.requestTimeout=30000;server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port already in use. Stop the old service or change PORT.':e.message);process.exitCode=1;});server.listen(config.port,'127.0.0.1',()=>console.log(`AutoSync v2.1 ready at http://127.0.0.1:${config.port}`));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={createServer};
