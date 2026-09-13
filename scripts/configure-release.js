'use strict';
const fs=require('node:fs'),path=require('node:path');
const clientId=process.env.AUTOSYNC_CLIENT_ID||'',brokerOrigin=process.env.AUTOSYNC_BROKER_ORIGIN||'',extensionId=process.env.AUTOSYNC_EXTENSION_ID||'';
try{
 if(!/^[A-Za-z0-9._-]{8,100}$/.test(clientId)||!/^[a-p]{32}$/.test(extensionId))throw new Error('Set AUTOSYNC_CLIENT_ID and AUTOSYNC_EXTENSION_ID (public IDs).');
 const url=new URL(brokerOrigin);if(url.protocol!=='https:'||url.origin!==brokerOrigin||url.username||url.password)throw new Error('AUTOSYNC_BROKER_ORIGIN must be an HTTPS origin without a path.');
 const dir=path.join(__dirname,'../extension');
 fs.writeFileSync(path.join(dir,'config.js'),'// Public OAuth application configuration. No secrets.\nglobalThis.AutoSyncConfig=Object.freeze('+JSON.stringify({clientId,brokerOrigin,extensionId})+');\n');
 const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));manifest.host_permissions=['https://api.github.com/*',`${brokerOrigin}/*`];
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('Release configured. Register this exact callback in GitHub:');console.log(`https://${extensionId}.chromiumapp.org/github`);
}catch(e){console.error(e.message);process.exitCode=1;}
