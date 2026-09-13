'use strict';
const path = require('node:path');
const crypto = require('node:crypto');
function loadConfig(env = process.env) {
  const token = env.GITHUB_TOKEN?.trim() || '';
  const owner = env.GITHUB_OWNER?.trim() || '';
  const repo = env.GITHUB_REPO?.trim() || '';
  const key = env.AUTOSYNC_KEY?.trim() || '';
  const legacyConfigured = !!token && /^[\w-]+$/.test(owner) && /^[\w.-]+$/.test(repo) && !['.','..'].includes(repo) && key.length >= 32;
  const port = Number(env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('PORT must be 1024–65535.');
  const folder = (env.GITHUB_FOLDER || 'LeetCode').trim();
  if (folder && !/^[\w-]+(?:\/[\w-]+)*$/.test(folder)) throw new Error('Use letters, numbers, underscores, hyphens and / for GITHUB_FOLDER.');
  const branch = (env.GITHUB_BRANCH || '').trim();
  const target = owner && repo ? crypto.createHash('sha256').update(JSON.stringify([owner, repo, branch, folder])).digest('hex').slice(0, 24) : '';
  return { token, owner, repo, key, legacyConfigured, port, folder, branch, target, dataDir: path.join(__dirname, 'data') };
}
module.exports = { loadConfig };
