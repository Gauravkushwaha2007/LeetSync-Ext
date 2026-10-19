'use strict';
const http=require('node:http');
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
function loadConfig(env=process.env){
 const clientId=env.GITHUB_CLIENT_ID,clientSecret=env.GITHUB_CLIENT_SECRET;
 const extensionIds=(env.EXTENSION_IDS||'').split(',').map(x=>x.trim()).filter(Boolean);
 if(!/^[A-Za-z0-9._-]{8,100}$/.test(clientId||'')||!clientSecret||clientSecret.length<20||!extensionIds.length||extensionIds.some(x=>!/^[a-p]{32}$/.test(x)))throw new Error('Set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET and EXTENSION_IDS in the hosting secret/environment settings.');
 const port=Number(env.PORT||8080);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT.');
 return {clientId,clientSecret,extensionIds,port};
}
function createServer(config,{fetchImpl=fetch,now=Date.now}={}){
 const rates=new Map();let active=0;
 function limit(req){
  const at=now(),key=req.socket.remoteAddress;
  if(rates.size>10000)for(const [k,v]of rates)if(at-v.start>60000)rates.delete(k);
  const v=rates.get(key);if(!v||at-v.start>=60000){rates.set(key,{start:at,n:1});return;}
  if(++v.n>120)throw new HttpError(429,'Try again later.');
 }
 async function github(url,options){try{return await fetchImpl(url,{...options,redirect:'error',signal:AbortSignal.timeout(12000)});}catch{throw new HttpError(503,'Authentication provider unavailable.');}}
 const server=http.createServer(async(req,res)=>{
  const reply=(status,data)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','Pragma':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'"});res.end(JSON.stringify(data));};
  let counted=false;
  try{
   if(req.url==='/health'&&req.method==='GET')return reply(200,{ok:true,service:'AutoSync OAuth',version:'3.0.0'});
   const origin=req.headers.origin;
   const extensionId=config.extensionIds.find(id=>origin===`chrome-extension://${id}`);
   if(!extensionId)throw new HttpError(403,'Origin not allowed.');
   res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');
   if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Methods','POST');res.setHeader('Access-Control-Allow-Headers','Content-Type');res.writeHead(204);return res.end();}
   if(req.method!=='POST'||!['/oauth/exchange','/oauth/refresh','/oauth/revoke'].includes(req.url))throw new HttpError(404,'Not found.');
   limit(req);if(active>=40)throw new HttpError(503,'Authentication service busy.');active++;counted=true;
   if(req.headers['content-type']?.split(';')[0]!=='application/json')throw new HttpError(415,'JSON required.');
   const chunks=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>10000)throw new HttpError(413,'Request too large.');chunks.push(chunk);}
   let body;try{body=JSON.parse(Buffer.concat(chunks).toString());}catch{throw new HttpError(400,'Invalid JSON.');}
   if(!body||typeof body!=='object'||Array.isArray(body))throw new HttpError(400,'Invalid request.');
   if(req.url==='/oauth/revoke'){
    if(typeof body.accessToken!=='string'||body.accessToken.length<10||body.accessToken.length>2048)throw new HttpError(400,'Invalid token.');
    const r=await github(`https://api.github.com/applications/${config.clientId}/token`,{method:'DELETE',headers:{Authorization:`Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:JSON.stringify({access_token:body.accessToken})});
    if(!r.ok&&r.status!==404)throw new HttpError(r.status>=500?503:400,'Revocation failed.');
    return reply(200,{ok:true});
   }
   const params={client_id:config.clientId,client_secret:config.clientSecret};
   if(req.url==='/oauth/exchange'){
    if(body.redirectUri!==`https://${extensionId}.chromiumapp.org/github`||!/^[A-Za-z0-9_-]{1,256}$/.test(body.code||'')||!/^[A-Za-z0-9._~-]{43,128}$/.test(body.codeVerifier||''))throw new HttpError(400,'Invalid authorization request.');
    Object.assign(params,{code:body.code,redirect_uri:body.redirectUri,code_verifier:body.codeVerifier});
   }else{
    if(typeof body.refreshToken!=='string'||body.refreshToken.length<10||body.refreshToken.length>2048)throw new HttpError(400,'Invalid refresh token.');
    Object.assign(params,{grant_type:'refresh_token',refresh_token:body.refreshToken});
   }
   const r=await github('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params).toString()});
   let token;try{token=await r.json();}catch{throw new HttpError(502,'Invalid provider response.');}
   if(!r.ok||token.error||typeof token.access_token!=='string'||token.token_type?.toLowerCase()!=='bearer')throw new HttpError(r.status>=500?503:401,'Authorization failed.');
   // Return only protocol fields. Never echo GitHub error bodies, code or app secret.
   const result={};for(const k of ['access_token','token_type','scope','refresh_token','expires_in','refresh_token_expires_in'])if(token[k]!==undefined)result[k]=token[k];
   return reply(200,result);
  }catch(e){if(!res.writableEnded)reply(e instanceof HttpError?e.status:500,{error:e instanceof HttpError?e.message:'Authentication failed.'});}
  finally{if(counted)active--;}
 });
 server.requestTimeout=20000;server.headersTimeout=10000;return server;
}
if(require.main===module){try{const c=loadConfig();const s=createServer(c);s.on('error',()=>{console.error('OAuth service could not start. Check hosting configuration.');process.exitCode=1;});s.listen(c.port,'0.0.0.0',()=>console.log('AutoSync OAuth service ready.'));}catch(e){console.error(e.message);process.exitCode=1;}}
module.exports={loadConfig,createServer};
