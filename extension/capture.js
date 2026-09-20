/* Page-world observer: never reads tokens, cookies, editor DOM, or unrelated requests. */
(() => {
  'use strict';
  const pending = new Map();
  const MAX_AGE = 15 * 60 * 1000;
  function endpoint(raw) {
    try { const u=new URL(raw,location.href); return u.origin===location.origin ? u.pathname : ''; } catch { return ''; }
  }
  function parse(body) { try { return typeof body==='string' ? JSON.parse(body) : null; } catch { return null; } }
    const pathname=endpoint(url);
    const match=pathname.match(/^\/problems\/([a-z0-9-]+)\/submit\/?$/);
    const now=Date.now();
    for(const [id,s] of pending)if(now-s.at>MAX_AGE)pending.delete(id);
    if(match && method.toUpperCase()==='POST') {
      const input=parse(body);
      if(!input || typeof input.typed_code!=='string' || input.typed_code.length>200000 || !input.typed_code.trim() || typeof input.lang!=='string' || !/^\d+$/.test(String(data?.submission_id)))return;
      if(pending.size>=30)pending.delete(pending.keys().next().value);
      pending.set(String(data.submission_id),{at:now,slug:match[1],language:input.lang,code:input.typed_code,submissionId:String(data.submission_id)});
    }
    const check=pathname.match(/^\/submissions\/detail\/(\d+)(?:\/v2)?\/check\/?$/);
    if(!check || !pending.has(check[1]) || data?.state!=='SUCCESS')return;
    const submission=pending.get(check[1]);pending.delete(check[1]);
    if(data.status_code===10)window.postMessage({source:'autosync-v2',type:'accepted',submission},location.origin);
  }
  const originalFetch=window.fetch;
  window.fetch=async function(input,init) {
    const url=typeof input==='string' || input instanceof URL ? String(input) : input.url;
    const method=init?.method || input?.method || 'GET';
    const watched=/\/(submit|check)\/?$/.test(endpoint(url));
    let bodyPromise=Promise.resolve(init?.body);
    if(watched && init?.body===undefined && typeof input?.clone==='function')bodyPromise=input.clone().text().catch(()=>null);
    const response=await originalFetch.apply(this,arguments);
    if(watched) {
      try { const copy=response.clone(); Promise.all([bodyPromise,copy.json()]).then(([body,data])=>observe(url,method,body,data)).catch(()=>{}); } catch { /* Keep LeetCode's response intact. */ }
    }
    return response;
  };
  const open=XMLHttpRequest.prototype.open, send=XMLHttpRequest.prototype.send;
  const requests=new WeakMap();
  XMLHttpRequest.prototype.open=function(method,url) { requests.set(this,{method:String(method),url:String(url)});return open.apply(this,arguments); };
  XMLHttpRequest.prototype.send=function(body) {
    const request=requests.get(this);
    if(request && /\/(submit|check)\/?$/.test(endpoint(request.url)))this.addEventListener('load',()=>{
      try { const data=this.responseType==='json'?this.response:JSON.parse(this.responseText);observe(request.url,request.method,body,data); } catch { /* Other response types are not submissions. */ }
    },{once:true});
    return send.apply(this,arguments);
  };
})();
