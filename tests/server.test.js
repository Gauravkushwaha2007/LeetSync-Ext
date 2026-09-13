'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {once}=require('node:events');
const fs=require('node:fs/promises'),os=require('node:os'),path=require('node:path');
const {createServer}=require('../server/app');
const {loadConfig}=require('../server/config');
test('HTTP service health, pairing, origins, body validation and local activity log',async t=>{
 const dataDir=await fs.mkdtemp(path.join(os.tmpdir(),'autosync-'));
 const config={...loadConfig({GITHUB_TOKEN:'private-token',GITHUB_OWNER:'tester',GITHUB_REPO:'solutions',AUTOSYNC_KEY:'k'.repeat(48)}),dataDir};
 let writes=0;
 const server=createServer(config,{fetchImpl:async(url,options)=>{
  if(url.endsWith('/repos/tester/solutions'))return new Response(JSON.stringify({default_branch:'main',permissions:{push:true}}));
  if(options.method==='PUT'){writes++;return new Response(JSON.stringify({content:{html_url:'https://github.com/tester/solutions'}}),{status:201});}
  return new Response('{}',{status:404});
 }});
 server.listen(0,'127.0.0.1');await once(server,'listening');
 t.after(async()=>{server.closeAllConnections();await new Promise(r=>server.close(r));await fs.rm(dataDir,{recursive:true,force:true});});
 const base=`http://127.0.0.1:${server.address().port}`,headers={'X-AutoSync-Key':config.key,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/health')).status,200);
 assert.equal((await fetch(base+'/status')).status,401);
 assert.equal((await fetch(base+'/status',{headers:{...headers,Origin:'https://evil.example'}})).status,403);
 const status=await (await fetch(base+'/status',{headers})).json();assert.equal(status.repository,'tester/solutions');assert.equal(status.token,undefined);
 const preflight=await fetch(base+'/upload',{method:'OPTIONS',headers:{Origin:'chrome-extension://'+'a'.repeat(32)}});assert.equal(preflight.status,204);
 assert.equal((await fetch(base+'/upload',{method:'POST',headers,body:'{'})).status,400);
 assert.equal((await fetch(base+'/upload',{method:'POST',headers,body:JSON.stringify({code:'hi'})})).status,400);
 const result=await fetch(base+'/upload',{method:'POST',headers,body:JSON.stringify({slug:'two-sum',title:'Two Sum',language:'cpp',code:'int main() {}',difficulty:'Easy',submissionId:'123',target:config.target})});assert.equal(result.status,200);assert.equal(writes,1);
 const log=await fs.readFile(path.join(dataDir,'activity.jsonl'),'utf8');assert.match(log,/two-sum/);assert.ok(!log.includes('private-token'));assert.ok(!log.includes('int main'));
});
