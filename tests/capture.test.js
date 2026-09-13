'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs');
const script=fs.readFileSync(require.resolve('../extension/capture.js'),'utf8');
function harness(){
 const messages=[],responses=[];
 class XHR {open(){}send(){}addEventListener(type,fn){this.onLoad=fn;}}
 const window={fetch:async()=>new Response(JSON.stringify(responses.shift())),postMessage:(message)=>messages.push(message)};
 const context={window,XMLHttpRequest:XHR,location:{href:'https://leetcode.com/problems/two-sum/',origin:'https://leetcode.com'},URL,Request,Response,console};vm.runInNewContext(script,context);
 const call=async(url,body,result)=>{responses.push(result);const response=await window.fetch(url,body?{method:'POST',body:JSON.stringify(body)}:undefined);await response.json();await new Promise(r=>setTimeout(r,10));};
 return {messages,call,XHR};
}
test('captures complete submitted source, only after its own accepted verdict',async()=>{
 const h=harness(),code='\t// whitespace\n'+('return 42;\n'.repeat(1000));
 await h.call('/problems/two-sum/submit/',{typed_code:code,lang:'cpp'},{submission_id:111});
 await h.call('/submissions/detail/222/check/',null,{state:'SUCCESS',status_code:10});assert.equal(h.messages.length,0);
 await h.call('/submissions/detail/111/check/',null,{state:'PENDING'});assert.equal(h.messages.length,0);
 await h.call('/submissions/detail/111/check/',null,{state:'SUCCESS',status_code:10});assert.equal(h.messages.length,1);assert.equal(h.messages[0].submission.code,code);
 await h.call('/submissions/detail/111/check/',null,{state:'SUCCESS',status_code:10});assert.equal(h.messages.length,1);
 await h.call('/problems/reverse-string/submit/',{typed_code:'next solution',lang:'python3'},{submission_id:112});
 await h.call('/submissions/detail/112/check/',null,{state:'SUCCESS',status_code:10});assert.equal(h.messages.length,2);assert.equal(h.messages[1].submission.slug,'reverse-string');
});
test('rejected, run-only, cross-origin and uncaptured submissions are ignored',async()=>{
 const h=harness();
 await h.call('/problems/two-sum/submit/',{typed_code:'bad',lang:'cpp'},{submission_id:1});
 await h.call('/submissions/detail/1/check/',null,{state:'SUCCESS',status_code:11});
 await h.call('/problems/two-sum/interpret_solution/',{typed_code:'run',lang:'cpp'},{submission_id:2});
 await h.call('/submissions/detail/2/check/',null,{state:'SUCCESS',status_code:10});
 await h.call('https://example.com/problems/two-sum/submit/',{typed_code:'other',lang:'cpp'},{submission_id:3});
 await h.call('/submissions/detail/3/check/',null,{state:'SUCCESS',status_code:10});
 assert.equal(h.messages.length,0);
});
test('XHR capture preserves original request and accepted source',()=>{
 const h=harness();const submit=new h.XHR();submit.open('POST','/problems/two-sum/submit/');submit.send(JSON.stringify({typed_code:'actual source',lang:'java'}));submit.responseText=JSON.stringify({submission_id:55});submit.onLoad();
 const check=new h.XHR();check.open('GET','/submissions/detail/55/check/');check.send();check.responseType='json';check.response={state:'SUCCESS',status_code:10};check.onLoad();assert.equal(h.messages[0].submission.code,'actual source');
});
