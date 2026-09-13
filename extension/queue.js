(function(root){
  'use strict';
  const languages=['cpp','c++','c','java','python','python3','javascript','typescript','csharp','c#','golang','go','rust','kotlin','swift','ruby','scala','php','dart','racket','erlang','elixir','mysql','mssql','oraclesql','postgresql','bash'];
  function clean(s) {
    if(!s || typeof s.code!=='string' || !s.code.trim() || new TextEncoder().encode(s.code).length>200000)throw new Error('Code must contain 1–200,000 bytes.');
    if(typeof s.slug!=='string' || s.slug.length>150 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s.slug))throw new Error('Enter a valid LeetCode problem slug.');
    if(!languages.includes(s.language))throw new Error('Select a supported language.');
    if(typeof s.title!=='string' || !s.title.trim() || s.title.length>200 || /[\x00-\x1f]/.test(s.title))throw new Error('Enter a valid title.');
    if(!['Easy','Medium','Hard','Unknown'].includes(s.difficulty))throw new Error('Select a valid difficulty.');
    if(typeof s.submissionId!=='string' || (s.submissionId && !/^\d{1,30}$/.test(s.submissionId)))throw new Error('Invalid submission ID.');
    return {slug:s.slug,title:s.title.trim(),code:s.code,language:({'c++':'cpp','c#':'csharp','go':'golang'}[s.language]||s.language),difficulty:s.difficulty,submissionId:s.submissionId};
  }
  function retry(attempts, now, seconds=0) { return now+Math.max(Math.min(3600000,30000*2**Math.min(attempts,8)),seconds*1000); }
  function terminal(s){return ['synced','unchanged'].includes(s);}
  function add(items,item) {
    const old=items.find(x=>x.fingerprint===item.fingerprint);
    if(old)return {items,duplicate:true};
    if(items.filter(x=>!terminal(x.status)).length>=100)throw new Error('Queue is full (100 pending items). Sync or remove entries first.');
    const result=[item,...items];
    if(new TextEncoder().encode(JSON.stringify(result)).length>7_000_000)throw new Error('Local storage is almost full. Export and remove queued items before adding more.');
    let finished=0;
    return {items:result.filter(x=>!terminal(x.status)||++finished<=500),duplicate:false};
  }
  const api={languages,clean,retry,terminal,add};
  if(typeof module!=='undefined')module.exports=api;else root.AutoSyncQueue=api;
})(globalThis);
