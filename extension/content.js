(() => {
  'use strict';
  function notify(message, failure=false) {
    const show=()=>{
      let host=document.getElementById('autosync-feedback');
      if(!host){host=document.createElement('div');host.id='autosync-feedback';document.documentElement.append(host);host.attachShadow({mode:'closed'});}
      // A fresh shadow host also prevents the site's CSS from restyling the message.
      host.remove();host=document.createElement('div');host.id='autosync-feedback';document.documentElement.append(host);
      const root=host.attachShadow({mode:'closed'}),box=document.createElement('div');
      box.style.cssText=`position:fixed;bottom:24px;right:24px;z-index:2147483647;padding:16px 20px;max-width:340px;border-radius:14px;background:${failure?'#783b2a':'#174d3b'};color:white;font:14px/1.5 system-ui;box-shadow:0 8px 32px #0003`;
      box.setAttribute('role','status');box.textContent=`AutoSync · ${message}`;root.append(box);setTimeout(()=>host.remove(),7000);
    };
    if(document.documentElement)show();else document.addEventListener('DOMContentLoaded',show,{once:true});
  }
  window.addEventListener('message',async event=>{
    if(event.source!==window || event.origin!==location.origin || event.data?.source!=='autosync-v2' || event.data.type!=='accepted')return;
    const s=event.data.submission;
    if(!s || typeof s.slug!=='string' || typeof s.code!=='string' || s.code.length>200000)return;
    const current=location.pathname.match(/^\/problems\/([^/]+)/)?.[1];
    let title=s.slug.split('-').map(x=>x.charAt(0).toUpperCase()+x.slice(1)).join(' '),difficulty='Unknown';
    if(current===s.slug) {
      const heading=[...document.querySelectorAll('a')].find(a=>/^\d+\.\s/.test(a.textContent.trim()) && a.getAttribute('href')?.includes(`/problems/${s.slug}`));
      if(heading)title=heading.textContent.trim().replace(/^\d+\.\s*/,'');
      difficulty=[...document.querySelectorAll('[class*="text-difficulty"], [class*="text-olive"], [class*="text-yellow"], [class*="text-pink"]')].map(e=>e.textContent.trim()).find(t=>['Easy','Medium','Hard'].includes(t)) || 'Unknown';
    }
    try {
      const r=await chrome.runtime.sendMessage({type:'capture',submission:{...s,title,difficulty}});
      notify(r.ok ? r.duplicate?'Already captured.':'Accepted solution saved to the sync queue.' : r.message,!r.ok);
    } catch { notify('Reload this LeetCode tab after updating the extension.',true); }
  });
})();
