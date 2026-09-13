'use strict';
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { loadConfig } = require('./config');
const { SyncError, syncSubmission, githubClient, githubError } = require('./sync');
function createServer(config, { fetchImpl = fetch } = {}) {
  let serial = Promise.resolve();
  let waiting = 0;
  const authenticate = req => {
    const actual = Buffer.from(req.headers['x-autosync-key'] || ''); const expected = Buffer.from(config.key);
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  };
  return http.createServer(async (req, res) => {
    const reply = (status, value) => { res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(JSON.stringify(value)); };
    try {
      if (!/^((127\.0\.0\.1)|(localhost)):\d+$/.test(req.headers.host || '')) return reply(403,{message:'Local requests only.'});
      const origin = req.headers.origin;
      if (origin && !/^chrome-extension:\/\/[a-p]{32}$/.test(origin)) return reply(403,{message:'Origin not allowed.'});
      if (origin) { res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin'); }
      if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS'); res.setHeader('Access-Control-Allow-Headers','Content-Type, X-AutoSync-Key'); res.writeHead(204); return res.end(); }
      if (req.url === '/health' && req.method === 'GET') return reply(200,{success:true,name:'AutoSync',version:'2.0.0'});
      if (!authenticate(req)) return reply(401,{success:false,message:'Pairing key is missing or incorrect.',retryable:false});
      if (req.url === '/status' && req.method === 'GET') {
        const r = await githubClient(config,fetchImpl)(`/repos/${config.owner}/${config.repo}`);
        if (!r.response.ok) throw githubError(r.response);
        if (r.data.permissions?.push === false) throw new SyncError('GitHub user does not have repository write access.',403);
        if (config.branch) { const branch = await githubClient(config,fetchImpl)(`/repos/${config.owner}/${config.repo}/branches/${encodeURIComponent(config.branch)}`); if (!branch.response.ok) throw githubError(branch.response); }
        return reply(200,{success:true,repository:`${config.owner}/${config.repo}`,branch:config.branch || r.data.default_branch,folder:config.folder,target:config.target});
      }
      if (req.url !== '/upload' || req.method !== 'POST') return reply(404,{message:'Route not found.'});
      if (!req.headers['content-type']?.startsWith('application/json')) throw new SyncError('Send application/json.',415);
      const chunks=[]; let length=0;
      for await (const chunk of req) { length+=chunk.length; if(length>240000) throw new SyncError('Request is too large.',413); chunks.push(chunk); }
      let payload; try { payload=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new SyncError('Invalid JSON.'); }
      if(waiting>=30) throw new SyncError('Sync service is busy.',503,true);
      waiting++;
      const job = serial.then(async () => {
        const result = await syncSubmission(config,payload,fetchImpl);
        // A logging failure must never turn a completed GitHub write into a failure.
        try {
          await fs.mkdir(config.dataDir,{recursive:true});
          const log=path.join(config.dataDir,'activity.jsonl');
          if ((await fs.stat(log).catch(()=>({size:0}))).size>2_000_000) await fs.rename(log,`${log}.1`);
          await fs.appendFile(log,JSON.stringify({at:new Date().toISOString(),slug:payload.slug,language:payload.language,...result})+'\n');
        } catch { result.warning='Synced, but the local activity log could not be written.'; }
        return result;
      });
      serial=job.catch(()=>{});
      try { reply(200,await job); } finally { waiting--; }
    } catch(error) { reply(error instanceof SyncError ? error.status : 500,{success:false,message:error instanceof SyncError ? error.message : 'Local service error. Check configuration and restart.',retryable:error instanceof SyncError ? error.retryable : true,retryAfter:error.retryAfter || 0}); }
  });
}
if (require.main === module) {
  try {
    try { process.loadEnvFile(path.join(__dirname,'.env')); } catch(e) { if(e.code!=='ENOENT') throw e; }
    const config=loadConfig(); const server=createServer(config);
    server.requestTimeout=30000;
    server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'Port already in use. Stop the old service or change PORT.':e.message);process.exitCode=1;});
    server.listen(config.port,'127.0.0.1',()=>console.log(`AutoSync v2 ready at http://127.0.0.1:${config.port}\nDestination: ${config.owner}/${config.repo}\nKeep this terminal open while syncing.`));
  } catch(e) { console.error(e.message); process.exitCode=1; }
}
module.exports={createServer};
