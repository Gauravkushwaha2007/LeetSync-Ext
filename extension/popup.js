'use strict';
let settings={};
async function load(){const data=await chrome.runtime.sendMessage({type:'state'});if(!data?.ok)throw new Error(data?.message||'Reload the extension.');settings=data.settings;document.getElementById('toggle').disabled=!data.account;document.getElementById('destination').textContent=data.account?.connected?(settings.repository||`@${data.account.login} · Choose a repository`):'Connect with GitHub to get started.';document.getElementById('done').textContent=data.items.filter(x=>['synced','unchanged'].includes(x.status)).length;document.getElementById('waiting').textContent=data.items.filter(x=>['queued','retrying','syncing'].includes(x.status)).length;document.getElementById('failed').textContent=data.items.filter(x=>x.status==='failed').length;document.getElementById('toggle').textContent=settings.paused?'Resume sync':'Pause sync';}
const error=e=>document.getElementById('message').textContent=e.message;
document.getElementById('open').onclick=()=>chrome.runtime.openOptionsPage();
document.getElementById('toggle').onclick=async()=>{try{const r=await chrome.runtime.sendMessage({type:'pause',paused:!settings.paused});if(!r.ok)throw new Error(r.message);await load();}catch(e){error(e);}};
chrome.storage.onChanged.addListener(()=>load().catch(error));load().catch(error);
