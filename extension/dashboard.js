'use strict';
const $=s=>document.querySelector(s),Q=AutoSyncQueue;
let data={settings:{},items:[]};
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
 $('#pause').textContent=s.paused?'Resume sync':'Pause sync';$('#sync-mode').textContent=!s.target?'Setup needed':s.paused?'Sync paused':'Automatic sync enabled';
 $('#repo-name').textContent=s.repository||'No repository yet';$('#repo-detail').textContent=s.target?`${s.branch} · /${s.folder||''}`:'Connect the local companion to start syncing.';$('#manual-destination').textContent=s.repository||'Not connected';$('#hero-action').textContent=s.target?'Manage your connection ↗':'Connect your repository ↗';
 $('#connection-detail').textContent=s.target?`Saved destination: ${s.repository} · ${s.branch}. Test the connection to check current availability.`:'Not connected yet.';
 const recent=$('#recent');recent.replaceChildren();
 if(!items.length){const empty=element('div',undefined,'empty');empty.append(element('strong','Your next accepted solution starts here.'),element('span','Connect your repository, then solve a problem.'));recent.append(empty);}
 items.slice(0,5).forEach(item=>{const row=element('div',undefined,'recent-item'),detail=element('div');detail.append(element('b',item.title),element('small',`${item.language} · ${item.difficulty} · ${item.source}`));row.append(element('span',Q.terminal(item.status)?'✓':'↗','item-icon'),detail,tag(item));recent.append(row);});
 renderHistory();
}
function renderHistory(){
 const term=$('#search').value.toLowerCase(),filter=$('#filter').value;
 const items=data.items.filter(x=>(x.title+' '+x.slug+' '+x.language).toLowerCase().includes(term)).filter(x=>filter==='all'||filter==='success'&&Q.terminal(x.status)||filter==='failed'&&x.status==='failed'||filter==='pending'&&!Q.terminal(x.status)&&x.status!=='failed');
 const tbody=$('#history');tbody.replaceChildren();$('#empty-history').hidden=!!items.length;
 for(const item of items){const row=element('tr'),problem=element('td');const link=element('a',item.title);link.href=`https://leetcode.com/problems/${item.slug}/`;link.target='_blank';link.rel='noreferrer';problem.append(link,element('small',`${item.difficulty} · ${item.source} · ${item.destination}`));if(item.error)problem.append(element('small',item.error,'error-text'));const state=element('td');state.append(tag(item));if(item.status==='retrying')state.append(element('small',`Next: ${new Date(item.nextAttempt).toLocaleTimeString()}`));const actions=element('td');const url=safeGitHub(item.url);if(url){const a=element('a','View ↗');a.href=url;a.target='_blank';a.rel='noreferrer';actions.append(a);}if(['failed','retrying'].includes(item.status))actions.append(action('Retry',async()=>{await send({type:'retry',id:item.id});await refresh();}));if(item.status!=='syncing')actions.append(action('Remove',async()=>{if(confirm(`Remove “${item.title}” from local history? This does not delete GitHub files.`)){await send({type:'remove',id:item.id});await refresh();}}));row.append(problem,element('td',item.language),state,element('td',new Date(item.createdAt).toLocaleString()),actions);tbody.append(row);}
}
async function refresh(){data=await send({type:'state'});render();}
async function busy(form,fn){const button=form.querySelector('[type="submit"]');button.disabled=true;try{await fn();}catch(e){notice(e.message,true);}finally{button.disabled=false;}}
for(const button of document.querySelectorAll('[data-page],[data-goto]'))button.onclick=()=>goto(button.dataset.page||button.dataset.goto);
for(const language of Q.languages){const option=element('option',language);option.value=language;$('#language').append(option);}
$('#search').oninput=renderHistory;$('#filter').onchange=renderHistory;
$('#pause').onclick=async()=>{try{await send({type:'pause',paused:!data.settings.paused});await refresh();}catch(e){notice(e.message,true);}};
$('#retry-all').onclick=async()=>{try{await send({type:'retry'});notice('Failures queued for another attempt.');await refresh();}catch(e){notice(e.message,true);}};
$('#settings-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const r=await send({type:'connect',port:$('#port').value,key:$('#key').value});notice(r.message);await refresh();});};
$('#add-form').onsubmit=e=>{e.preventDefault();busy(e.target,async()=>{const submission=Object.fromEntries(new FormData(e.target));submission.submissionId='';const r=await send({type:'add',submission});notice(r.duplicate?'This solution is already in your history.':'Solution added to the queue.');e.target.reset();goto('activity');await refresh();});};
$('#clear').onclick=async()=>{if(confirm('Clear completed local history? GitHub files and pending items will be kept.'))try{await send({type:'clear'});await refresh();}catch(e){notice(e.message,true);}};
$('#export').onclick=()=>{const exported={version:2,exportedAt:new Date().toISOString(),destination:{repository:data.settings.repository,branch:data.settings.branch,folder:data.settings.folder},items:data.items};const url=URL.createObjectURL(new Blob([JSON.stringify(exported,null,2)],{type:'application/json'}));const a=element('a');a.href=url;a.download=`autosync-history-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notice('History exported. Keep this file private if it contains pending source code.');};
window.addEventListener('hashchange',()=>goto(location.hash.slice(1)));
chrome.storage.onChanged.addListener(()=>refresh().catch(e=>notice(e.message,true)));
refresh().then(()=>{$('#port').value=data.settings.port;$('#key').value=data.settings.key;goto(location.hash.slice(1)||'overview');}).catch(e=>notice(e.message,true));
