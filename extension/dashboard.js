'use strict';
const $=s=>document.querySelector(s),Q=AutoSyncQueue;
let data={settings:{},items:[],account:null};
let repositories=[],nextRepoPage=null,nextBranchPage=null,repoAccount='',repoLoading=false,branchGeneration=0;
const statuses={synced:'Synced',unchanged:'Unchanged',queued:'Queued',syncing:'Syncing',retrying:'Retry scheduled',failed:'Needs attention'};
async function send(message){const r=await chrome.runtime.sendMessage(message);if(!r?.ok)throw new Error(r?.message||'Extension unavailable. Reload it and try again.');return r;}
let noticeTimer;
function notice(text,error=false){$('#notice').textContent=text;$('#notice').className=error?'error':'';$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,9000);}
function element(tag,text,className){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(className)e.className=className;return e;}
function goto(page){if(!['overview','activity','add','settings'].includes(page))page='overview';document.querySelectorAll('.page').forEach(e=>e.hidden=e.id!==page);document.querySelectorAll('.nav').forEach(e=>e.classList.toggle('active',e.dataset.page===page));$('#page-name').textContent={overview:'Overview',activity:'Sync activity',add:'Add solution',settings:'Settings'}[page];location.hash=page;}
function tag(item){return element('span',statuses[item.status]||item.status,`status ${item.status}`);}
function safeGitHub(url){try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='github.com'?u.href:null;}catch{return null;}}
function action(text,fn){const b=element('button',text,'text-button');b.onclick=()=>Promise.resolve().then(fn).catch(e=>notice(e.message,true));return b;}
function render(){
 const {settings:s,items}=data,success=items.filter(x=>Q.terminal(x.status)),pending=items.filter(x=>!Q.terminal(x.status)&&x.status!=='failed'),failed=items.filter(x=>x.status==='failed');
 $('#stat-synced').textContent=success.length;$('#stat-pending').textContent=pending.length;$('#stat-failed').textContent=failed.length;$('#stat-languages').textContent=new Set(items.map(x=>x.language)).size;$('#nav-count').textContent=pending.length+failed.length;
 $('#pause').textContent=s.paused?'Resume sync':'Pause sync';$('#pause').disabled=!data.account;$('#sync-mode').textContent=!data.account?.connected?'Connect GitHub':!s.target?'Select repository':s.paused?'Sync paused':'Automatic sync enabled';
 $('#repo-name').textContent=s.repository||'No repository yet';$('#repo-detail').textContent=s.target?`${s.branch} · /${s.folder||''}`:'Connect your GitHub account to start syncing.';$('#manual-destination').textContent=s.repository||'Not connected';$('#hero-action').textContent=s.target?'Manage your connection ↗':'Connect your repository ↗';
 renderAccount();
 const recent=$('#recent');recent.replaceChildren();
 if(!items.length){const empty=element('div',undefined,'empty');empty.append(element('strong','Your next accepted solution starts here.'),element('span','Connect your repository, then solve a problem.'));recent.append(empty);}
 items.slice(0,5).forEach(item=>{const row=element('div',undefined,'recent-item'),detail=element('div');detail.append(element('b',item.title),element('small',`${item.language} · ${item.difficulty} · ${item.source}`));row.append(element('span',Q.terminal(item.status)?'✓':'↗','item-icon'),detail,tag(item));recent.append(row);});
 renderHistory();
}
function renderHistory(){
 const term=$('#search').value.toLowerCase(),filter=$('#filter').value;
 const items=data.items.filter(x=>(x.title+' '+x.slug+' '+x.language).toLowerCase().includes(term)).filter(x=>filter==='all'||filter==='success'&&Q.terminal(x.status)||filter==='failed'&&x.status==='failed'||filter==='pending'&&!Q.terminal(x.status)&&x.status!=='failed');
 const tbody=$('#history');tbody.replaceChildren();$('#empty-history').hidden=!!items.length;
 for(const item of items){const row=element('tr'),problem=element('td');const link=element('a',item.title);link.href=`https://leetcode.com/problems/${item.slug}/`;link.target='_blank';link.rel='noreferrer';problem.append(link,element('small',`${item.difficulty} · ${item.source} · ${item.destination}`));if(item.target!==data.settings.target&&!Q.terminal(item.status))problem.append(element('small','Waiting for its original repository/branch selection.','error-text'));if(item.error)problem.append(element('small',item.error,'error-text'));const state=element('td');state.append(tag(item));if(item.status==='retrying')state.append(element('small',`Next: ${new Date(item.nextAttempt).toLocaleTimeString()}`));const actions=element('td');const url=safeGitHub(item.url);if(url){const a=element('a','View ↗');a.href=url;a.target='_blank';a.rel='noreferrer';actions.append(a);}if(['failed','retrying'].includes(item.status))actions.append(action('Retry',async()=>{await send({type:'retry',id:item.id});await refresh();}));if(item.status!=='syncing')actions.append(action('Remove',async()=>{if(confirm(`Remove “${item.title}” from local history? This does not delete GitHub files.`)){await send({type:'remove',id:item.id});await refresh();}}));row.append(problem,element('td',item.language),state,element('td',new Date(item.createdAt).toLocaleString()),actions);tbody.append(row);}
}
async function refresh(){data=await send({type:'state'});render();}
async function busy(form,fn){const button=form.querySelector('[type="submit"]');button.disabled=true;try{await fn();}catch(e){notice(e.message,true);}finally{button.disabled=false;}}
for(const button of document.querySelectorAll('[data-page],[data-goto]'))button.onclick=()=>goto(button.dataset.page||button.dataset.goto);
for(const language of Q.languages){const option=element('option',language);option.value=language;$('#language').append(option);}
$('#search').oninput=renderHistory;$('#filter').onchange=renderHistory;
$('#pause').onclick=async()=>{try{await send({type:'pause',paused:!data.settings.paused});await refresh();}catch(e){notice(e.message,true);}};
$('#retry-all').onclick=async()=>{try{await send({type:'retry'});notice('Failures queued for another attempt.');await refresh();}catch(e){notice(e.message,true);}};
$('#add-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const submission=Object.fromEntries(new FormData(e.target));submission.submissionId='';const r=await send({type:'add',submission});notice(r.duplicate?'This solution is already in your history.':'Solution added to the queue.');e.target.reset();goto('activity');await refresh();});};
$('#clear').onclick=async()=>{if(confirm('Clear completed local history? GitHub files and pending items will be kept.'))try{await send({type:'clear'});await refresh();}catch(e){notice(e.message,true);}};
$('#export').onclick=()=>{const exported={version:3,account:data.account?{id:data.account.id,login:data.account.login}:null,exportedAt:new Date().toISOString(),destination:{repository:data.settings.repository,branch:data.settings.branch,folder:data.settings.folder},items:data.items};const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:'application/json'}));const a=element('a');a.href=url;a.download=`autosync-history-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('History exported. Keep this file private if it contains pending source code.');};
window.addEventListener('hashchange',()=>goto(location.hash.slice(1)));
chrome.storage.onChanged.addListener(()=>refresh().catch(e=>notice(e.message,true)));
function renderAccount(){
 const a=data.account,connected=!!a?.connected;
 $('#export-legacy').hidden=!data.hasLegacy;
 $('#account-name').textContent=a?`@${a.login}`:'Not connected';$('#account-detail').textContent=a?(connected?'GitHub account connected':'Session expired. Connect again to resume.'):'Your personal workspace starts here.';
 $('#login').textContent=connected?'Reconnect / switch account ↗':'Connect with GitHub ↗';$('#disconnect').hidden=!a;$('#manage-access').href=data.manageAccessUrl;
 $('#connection-detail').textContent=!data.configured?'This preview build needs publisher configuration before GitHub sign-in can run.':connected?`Connected as ${a.login}. Select a writable repository below.`:'You will return here after authorizing on GitHub.';
 $('#reload-repos').disabled=!connected;$('#repository').disabled=!connected;$('#save-repo').disabled=!connected||!$('#branch').value;
 if(!connected){repoAccount='';repositories=[];nextRepoPage=null;$('#repository').replaceChildren(element('option','Connect GitHub first'));$('#branch').replaceChildren(element('option','Choose a repository first'));$('#branch').disabled=true;$('#more-repos').hidden=true;$('#more-branches').hidden=true;branchGeneration++;}
 else if(repoAccount!==a.id){repoAccount=a.id;repositories=[];$('#repository').replaceChildren();$('#branch').replaceChildren();branchGeneration++;$('#folder').value=data.settings.folder;loadRepos(false).catch(e=>notice(e.message,true));}
}
function renderRepos(){
 const selected=$('#repository').value||data.settings.repoId,term=$('#repo-search').value.toLowerCase();$('#repository').replaceChildren();const blank=element('option','Choose a repository');blank.value='';$('#repository').append(blank);
 for(const r of repositories.filter(x=>x.fullName.toLowerCase().includes(term))){const o=element('option',`${r.fullName}${r.private?' · private':''}`);o.value=r.id;$('#repository').append(o);}
 $('#repository').value=selected;$('#repo-count').textContent=`${repositories.length} writable repositories loaded`;$('#more-repos').hidden=!nextRepoPage;
}
async function loadRepos(more){
 if(repoLoading)return;repoLoading=true;const id=data.account?.id;
 try{const r=await send({type:'repos',page:more?nextRepoPage:1});if(data.account?.id!==id||!data.account?.connected)return;
 repositories=more?[...repositories,...r.repositories]:r.repositories;nextRepoPage=r.nextPage;renderRepos();if($('#repository').value)await loadBranches(false);
 }finally{repoLoading=false;if(data.account?.connected&&data.account.id!==id)loadRepos(false).catch(e=>notice(e.message,true));}
}
async function loadBranches(more){
 const id=$('#repository').value,account=data.account?.id,generation=++branchGeneration;
 if(!more){$('#branch').replaceChildren();$('#branch').disabled=true;$('#save-repo').disabled=true;nextBranchPage=null;$('#more-branches').hidden=true;}
 if(!id)return;
 const r=await send({type:'branches',repoId:id,page:more?nextBranchPage:1});if(generation!==branchGeneration||data.account?.id!==account||$('#repository').value!==id)return;
 for(const name of r.branches){const o=element('option',name);o.value=name;$('#branch').append(o);}
 nextBranchPage=r.nextPage;$('#more-branches').hidden=!nextBranchPage;$('#branch').disabled=!$('#branch').options.length;
 if(!more){const preferred=data.settings.repoId===id?data.settings.branch:r.repository.defaultBranch;if([...$('#branch').options].some(o=>o.value===preferred))$('#branch').value=preferred;}
 $('#save-repo').disabled=!$('#branch').value;
 if(!r.branches.length&&!more)notice('This repository has no branch yet. Add a README on GitHub, then refresh.',true);
}
$('#login').onclick=async()=>{const b=$('#login');b.disabled=true;try{const r=await send({type:'login',privateRepos:$('#private-repos').checked});repoAccount='';notice(r.message);await refresh();}catch(e){notice(e.message,true);}finally{b.disabled=false;}};
$('#disconnect').onclick=async()=>{if(!confirm('Disconnect this GitHub account? Its local queue will be preserved. An upload already sent may finish in its original repository.'))return;try{const r=await send({type:'disconnect'});notice(r.message);await refresh();}catch(e){notice(e.message,true);}};
$('#repo-search').oninput=renderRepos;
$('#reload-repos').onclick=()=>loadRepos(false).catch(e=>notice(e.message,true));
$('#more-repos').onclick=()=>loadRepos(true).catch(e=>notice(e.message,true));
$('#more-branches').onclick=()=>loadBranches(true).catch(e=>notice(e.message,true));
$('#repository').onchange=()=>loadBranches(false).catch(e=>notice(e.message,true));
$('#repo-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const r=await send({type:'select-repo',repoId:$('#repository').value,branch:$('#branch').value,folder:$('#folder').value.trim()});notice(r.message);await refresh();goto('overview');});};
refresh().then(()=>goto(location.hash.slice(1)||'overview')).catch(e=>notice(e.message,true));

$('#export-legacy').onclick=async()=>{try{const r=await send({type:'export-legacy'});const url=URL.createObjectURL(new Blob([JSON.stringify(r.backup,null,2)],{type:'application/json'}));const a=element('a');a.href=url;a.download='autosync-v2-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch(e){notice(e.message,true);}};
