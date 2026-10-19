(function(root){
'use strict';
const extensions={cpp:'cpp',c:'c',java:'java',python:'py',python3:'py',javascript:'js',typescript:'ts',csharp:'cs',golang:'go',rust:'rs',kotlin:'kt',swift:'swift',ruby:'rb',scala:'scala',php:'php',dart:'dart',racket:'rkt',erlang:'erl',elixir:'ex',mysql:'sql',mssql:'sql',oraclesql:'sql',postgresql:'sql',bash:'sh'};
function fail(message,retryable=false,extra={}){return Object.assign(new Error(message),{retryable,...extra});}
function utf8base64(text){const bytes=new TextEncoder().encode(text);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);}
function fromBase64(s){try{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s.replace(/\s/g,'')),c=>c.charCodeAt(0)));}catch{return null;}}
function githubError(response){const limited=response.status===429||(response.status===403&&(response.headers.get('x-ratelimit-remaining')==='0'||response.headers.has('retry-after')));return fail(limited?'GitHub rate limit reached. We will retry later.':({401:'GitHub session expired. Connect again.',403:'GitHub denied this action. Check authorization, organization access and branch rules.',404:'Repository, branch or file could not be found.',409:'The repository changed during sync. Retrying.',422:'GitHub rejected this update. Check branch rules and repository setup.'}[response.status]||'GitHub request failed.'),limited||response.status===409||response.status>=500,{status:response.status,retryAfter:limited?Math.max(60,Number(response.headers.get('retry-after'))||0,(Number(response.headers.get('x-ratelimit-reset'))||0)-Date.now()/1000):0});}
function client(getToken,fetchImpl=fetch){
 return async(path,options={})=>{
  if(!path.startsWith('/')||path.startsWith('//')||path.includes('..')||path.includes('#'))throw fail('Invalid GitHub API path.');
  const token=await getToken();let r;
  try{r=await fetchImpl(`https://api.github.com${path}`,{method:options.method||'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},...(options.body?{body:JSON.stringify(options.body)}:{}),credentials:'omit',redirect:'error',signal:options.signal||AbortSignal.timeout(10000)});}catch{throw fail('GitHub could not be reached. Check your connection.',true);}
  if(!r.ok){if(r.status===404&&options.missing)return null;throw githubError(r);}
  if(r.status===204)return null;
  try{return await r.json();}catch{throw fail('GitHub returned an unreadable response.',true);}
 };
}
function repoView(r){if(!Number.isSafeInteger(r.id)||typeof r.full_name!=='string'||!r.owner?.login||!r.name)throw fail('Invalid repository response.');return {id:String(r.id),fullName:r.full_name,name:r.name,owner:r.owner.login,private:!!r.private,defaultBranch:r.default_branch||'',writable:r.permissions?.push===true&&!r.archived&&!r.disabled};}
function repoPath(r){return `/repos/${encodeURIComponent(r.owner)}/${encodeURIComponent(r.name)}`;}
async function listRepositories(request,page=1,privateAccess=false){
 if(!Number.isSafeInteger(page)||page<1||page>1000)throw fail('Invalid page.');
 const repos=await request(`/user/repos?per_page=100&page=${page}&sort=updated&direction=desc&affiliation=owner,collaborator,organization_member`);
 if(!Array.isArray(repos))throw fail('Invalid repository list.');
 return {repositories:repos.map(repoView).filter(r=>r.writable&&(privateAccess||!r.private)),nextPage:repos.length===100?page+1:null};
}
async function repository(request,id){if(!/^\d{1,20}$/.test(String(id)))throw fail('Select a valid repository.');const r=repoView(await request(`/repositories/${id}`));if(r.id!==String(id)||!r.writable)throw fail('This repository is unavailable or read-only.');return r;}
async function listBranches(request,id,page=1){if(!Number.isSafeInteger(page)||page<1||page>1000)throw fail('Invalid branch page.');const r=await repository(request,id);const branches=await request(`${repoPath(r)}/branches?per_page=100&page=${page}`);if(!Array.isArray(branches))throw fail('Invalid branch list.');return {repository:r,branches:branches.map(b=>String(b.name)),nextPage:branches.length===100?page+1:null};}
async function destination(request,userId,id,branch,folder='LeetCode'){
 const r=await repository(request,id);
 if(typeof branch!=='string'||!branch||branch.length>255||typeof folder!=='string'||(folder&&!/^[\w-]+(?:\/[\w-]+)*$/.test(folder)))throw fail('Select an existing branch and use a simple folder path.');
 await request(`${repoPath(r)}/branches/${encodeURIComponent(branch)}`);
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([String(userId),r.id,branch,folder])));
 return {repoId:r.id,repository:r.fullName,branch,folder,target:Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('')};
}
async function sync(request,settings,item,userId){
 const s=root.AutoSyncQueue?root.AutoSyncQueue.clean(item):require('./queue').clean(item);
 if(item.userId!==String(userId)||item.target!==settings.target||item.repoId!==settings.repoId)throw fail('This solution belongs to a different account or destination.');
 const r=await repository(request,settings.repoId);
 const file=[settings.folder,s.slug,s.language,`solution.${extensions[s.language]}`].filter(Boolean).join('/');
 const endpoint=`${repoPath(r)}/contents/${file.split('/').map(encodeURIComponent).join('/')}`;
 const signal=AbortSignal.timeout(22000);
 const existing=await request(endpoint+`?ref=${encodeURIComponent(settings.branch)}`,{missing:true,signal});
 if(existing&&(existing.type!=='file'||!existing.sha))throw fail('The destination is not a regular file.');
 if(existing?.encoding==='base64'&&fromBase64(existing.content||'')===s.code)return {action:'unchanged',path:file,url:existing.html_url};
 const body={message:`${existing?'Update':'Add'} ${s.slug} (${s.language})`,content:utf8base64(s.code),branch:settings.branch};if(existing)body.sha=existing.sha;
 const result=await request(endpoint,{method:'PUT',body,signal});
 return {action:existing?'updated':'created',path:file,url:result.content?.html_url};
}
const api={client,githubError,utf8base64,fromBase64,listRepositories,repository,listBranches,destination,sync};
if(typeof module!=='undefined')module.exports=api;else root.AutoSyncGitHub=api;
})(globalThis);
