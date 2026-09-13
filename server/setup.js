'use strict';
const readline = require('node:readline/promises');
const { Writable } = require('node:stream');
const { randomBytes } = require('node:crypto');
const { writeFile, access } = require('node:fs/promises');
const path = require('node:path');
const { loadConfig } = require('./config');
async function main() {
  let muted=false;
  const output=new Writable({write(chunk,enc,done){if(!muted)process.stdout.write(chunk);done();}});
  const rl=readline.createInterface({input:process.stdin,output,terminal:!!process.stdin.isTTY});
  const ask=async(text,fallback='')=>(await rl.question(text)).trim()||fallback;
  try {
    console.log('AutoSync v2 setup · credentials stay on this computer');
    const envPath=path.join(__dirname,'.env');
    if (await access(envPath).then(()=>true,()=>false)) {
      if ((await ask('Replace existing configuration? Type REPLACE: '))!=='REPLACE') return;
    }
    const env={};
    env.GITHUB_OWNER=await ask('GitHub owner or organization: ');
    env.GITHUB_REPO=await ask('Repository name (create it with a README first): ');
    env.GITHUB_BRANCH=await ask('Existing branch (Enter = repository default): ');
    env.GITHUB_FOLDER=await ask('Folder [LeetCode]: ','LeetCode');
    env.PORT=await ask('Local port [3000]: ','3000');
    process.stdout.write('GitHub token (hidden): '); muted=true;
    try { env.GITHUB_TOKEN=await ask(''); } finally { muted=false; process.stdout.write('\n'); }
    env.AUTOSYNC_KEY=randomBytes(24).toString('hex'); loadConfig(env);
    // Reject multiline/env syntax in values before writing the configuration file.
    for(const value of Object.values(env))if(/[\r\n"\\]/.test(value))throw new Error('Configuration cannot include newlines, quotes or backslashes.');
    await writeFile(envPath,Object.entries(env).map(([k,v])=>`${k}="${v}"`).join('\n')+'\n',{mode:0o600});
    console.log(`\nSetup saved. Paste this pairing key in the extension Settings:\n${env.AUTOSYNC_KEY}\n\nStart with: npm start`);
  } finally { rl.close(); }
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
