'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Q=require('../extension/queue');
test('identical captures are deduplicated',()=>{const item={fingerprint:'one',status:'queued'};assert.equal(Q.add([item],item).duplicate,true);assert.equal(Q.add([item],{...item,fingerprint:'two'}).items.length,2);});
test('pending items are never silently discarded',()=>{const items=Array.from({length:100},(_,i)=>({fingerprint:String(i),status:'retrying'}));assert.throws(()=>Q.add(items,{fingerprint:'new',status:'queued'}),/full/);});
test('history retention trims completed entries only',()=>{const items=Array.from({length:600},(_,i)=>({fingerprint:String(i),status:'synced'}));const result=Q.add(items,{fingerprint:'new',status:'queued'});assert.equal(result.items.length,501);assert.equal(result.items[0].status,'queued');});
test('backoff respects rate-limit minimum',()=>{assert.equal(Q.retry(1,1000),61000);assert.equal(Q.retry(9,0),3600000);assert.equal(Q.retry(1,0,7200),7200000);});
test('extension validation rejects unsafe or unsupported inputs',()=>{const s={code:'print(1)',title:'A',slug:'a',language:'python3',difficulty:'Unknown',submissionId:''};assert.deepEqual(Q.clean(s),s);assert.throws(()=>Q.clean({...s,slug:'../x'}));assert.throws(()=>Q.clean({...s,language:'__proto__'}));assert.throws(()=>Q.clean({...s,code:'😀'.repeat(60000)}));});
