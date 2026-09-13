'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Q=require('../extension/queue');
const source=fs.readFileSync(require.resolve('../extension/background.js'),'utf8');
const clone=x=>structuredClone(x);
function worker(initial,fetchImpl){
 let listener;const data=clone(initial);const callbacks={};
 const chrome={storage:{local:{setAccessLevel:async()=>{},get:async()=>clone(data),set:async patch=>Object.assign(data,clone(patch))}},action:{setBadgeText:async()=>{},setBadgeBackgroundColor:async()=>{}},alarms:{get:async()=>({}),create:async()=>{},onAlarm:{addListener:f=>callbacks.alarm=f}},runtime:{id:'test',getURL:()=> 'chrome-extension://test/',onInstalled:{addListener:()=>{}},onStartup:{addListener:()=>{}},onMessage:{addListener:f=>listener=f}}};
 vm.runInNewContext(source,{chrome,importScripts:()=>{},AutoSyncQueue:Q,fetch:fetchImpl,AbortSignal,TextEncoder,crypto:require('node:crypto').webcrypto,console});
 const send=(message,sender={id:'test',url:'chrome-extension://test/dashboard.html'})=>new Promise(resolve=>listener(message,sender,resolve));
 const settle=()=>new Promise(r=>setTimeout(r,30));
 return {data,send,settle,alarm:()=>callbacks.alarm({name:'autosync-retry'})};
}
const settings={port:3000,key:'k'.repeat(48),target:'destination',repository:'owner/repo',paused:true};
const s={title:'Two Sum',slug:'two-sum',language:'cpp',code:'full code',difficulty:'Easy',submissionId:'111'};
test('concurrent captures survive serialized storage, deduplicate, and survive worker restart',async()=>{
 const w=worker({settings,items:[]},()=>assert.fail('Paused queue must not fetch'));
 const results=await Promise.all([w.send({type:'add',submission:s}),w.send({type:'add',submission:s}),w.send({type:'add',submission:{...s,slug:'another'}})]);
 assert.ok(results.every(x=>x.ok));assert.equal(w.data.items.length,2);assert.equal(results.filter(x=>x.duplicate).length,1);
 const restarted=worker(w.data,()=>assert.fail('Must not fetch'));assert.equal((await restarted.send({type:'state'})).items.length,2);
});
test('content scripts cannot read settings or change the destination',async()=>{
 const w=worker({settings,items:[]},()=>assert.fail('Must not fetch'));
 const sender={id:'test',tab:{id:1},url:'https://leetcode.com/problems/two-sum/'};
 assert.equal((await w.send({type:'state'},sender)).ok,false);assert.equal((await w.send({type:'connect',port:3000,key:settings.key},sender)).ok,false);
 assert.equal((await w.send({type:'state'},{id:'test',url:'chrome-extension://test/dashboard.html',tab:{id:2}})).ok,true);
 assert.equal((await w.send({type:'capture',submission:s},sender)).ok,true);
 assert.equal((await w.send({type:'capture',submission:s},{...sender,url:'https://evil.example/'})).ok,false);
});
test('offline sync persists source and schedules a retry; restarting can recover it',async()=>{
 const w=worker({settings:{...settings,paused:false},items:[]},async()=>{throw new Error('offline');});
 await w.send({type:'add',submission:s});await w.settle();assert.equal(w.data.items[0].status,'retrying');assert.equal(w.data.items[0].code,'full code');
 const restarted=worker(w.data,async()=>new Response(JSON.stringify({success:true,action:'created',url:'https://github.com/owner/repo'})));
 await restarted.send({type:'retry'});await restarted.settle();assert.equal(restarted.data.items[0].status,'synced');assert.equal(restarted.data.items[0].code,undefined);
});
test('an older failed solution blocks newer writes to the same path',async()=>{
 const older={...s,id:'old',fingerprint:'old',target:settings.target,status:'failed',nextAttempt:0,attempts:8};
 const newer={...older,id:'new',fingerprint:'new',status:'queued',code:'newer'};
 const w=worker({settings:{...settings,paused:false},items:[newer,older]},()=>assert.fail('New solution cannot overtake old failure'));
 w.alarm();await w.settle();assert.equal(w.data.items[0].status,'queued');
});
test('stale in-flight jobs recover after worker termination',async()=>{
 const item={...s,id:'job',target:settings.target,status:'syncing',nextAttempt:0,attempts:1};
 const w=worker({settings:{...settings,paused:false},items:[item]},async()=>new Response(JSON.stringify({success:true,action:'unchanged'})));
 w.alarm();await w.settle();assert.equal(w.data.items[0].status,'unchanged');assert.equal(w.data.items[0].attempts,2);
});
test('auth failure requires manual retry and destination mismatch prevents a request',async()=>{
 const w=worker({settings:{...settings,paused:false},items:[]},async()=>new Response(JSON.stringify({message:'Bad key',retryable:false}),{status:401}));
 await w.send({type:'add',submission:s});await w.settle();assert.equal(w.data.items[0].status,'failed');
 const item={...w.data.items[0],status:'queued',target:'old destination',nextAttempt:0};
 const changed=worker({settings:{...settings,paused:false},items:[item]},()=>assert.fail('Wrong destination must not be called'));
 changed.alarm();await changed.settle();assert.equal(changed.data.items[0].status,'failed');assert.match(changed.data.items[0].error,/Destination changed/);
});
