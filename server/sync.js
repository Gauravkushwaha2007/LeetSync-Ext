'use strict';
const extensions = Object.freeze({ cpp:'cpp', 'c++':'cpp', c:'c', java:'java', python:'py', python3:'py', javascript:'js', typescript:'ts', csharp:'cs', 'c#':'cs', golang:'go', go:'go', rust:'rs', kotlin:'kt', swift:'swift', ruby:'rb', scala:'scala', php:'php', dart:'dart', racket:'rkt', erlang:'erl', elixir:'ex', mysql:'sql', mssql:'sql', oraclesql:'sql', postgresql:'sql', bash:'sh' });
class SyncError extends Error {
  constructor(message, status = 400, retryable = false, retryAfter = 0) { super(message); Object.assign(this, { status, retryable, retryAfter }); }
}
function validateSubmission(input) {
  if (!input || typeof input !== 'object') throw new SyncError('Submission is required.');
  const { code, slug, language, title, difficulty = 'Unknown', submissionId = '' } = input;
  if (typeof code !== 'string' || !code.trim() || Buffer.byteLength(code) > 200000) throw new SyncError('Code must contain 1–200,000 bytes.');
  if (typeof slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 150) throw new SyncError('Invalid LeetCode problem slug.');
  if (typeof language !== 'string' || !Object.hasOwn(extensions, language.toLowerCase())) throw new SyncError('Unsupported language.');
  if (!['Easy','Medium','Hard','Unknown'].includes(difficulty)) throw new SyncError('Invalid difficulty.');
  if (typeof title !== 'string' || !title.trim() || title.length > 200 || /[\r\n\x00-\x1f]/.test(title)) throw new SyncError('Invalid title.');
  if (typeof submissionId !== 'string' || (submissionId && !/^\d{1,30}$/.test(submissionId))) throw new SyncError('Invalid submission ID.');
  return { code, slug, language: language.toLowerCase(), title: title.trim(), difficulty, submissionId, url: `https://leetcode.com/problems/${slug}/` };
}
function filePath(config, s) {
  // Language directory keeps Python/Python3 and different SQL dialects separate.
  return [config.folder, s.slug, s.language.replace(/\+/g, 'p').replace('#','sharp'), `solution.${extensions[s.language]}`].filter(Boolean).join('/');
}
function githubClient(config, fetchImpl = fetch) {
  return async (endpoint, options = {}) => {
    let response;
    try {
      response = await fetchImpl(`https://api.github.com${endpoint}`, { ...options, headers: { Authorization: `Bearer ${config.token}`, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent':'AutoSync/2.0', 'X-GitHub-Api-Version':'2022-11-28' }, signal: AbortSignal.timeout(15000) });
    } catch { throw new SyncError('GitHub could not be reached. Check your connection.', 503, true); }
    let data; try { data = await response.json(); } catch { throw new SyncError('GitHub returned an unreadable response.', 502, true); }
    return { response, data };
  };
}
function githubError(response) {
  const rateLimited = response.status === 429 || (response.status === 403 && (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after')));
  const retryAfter = rateLimited ? Math.max(60, Number(response.headers.get('retry-after')) || 0, (Number(response.headers.get('x-ratelimit-reset')) || 0) - Date.now()/1000) : 0;
  const message = rateLimited ? 'GitHub rate limit reached. AutoSync will retry later.' : ({401:'GitHub token is invalid or expired.',403:'GitHub denied access. Check repository Contents permission.',404:'Repository or branch not found. Check access and configuration.',409:'GitHub file changed concurrently. Retrying.',422:'GitHub rejected the file or branch. Check repository setup.'}[response.status] || 'GitHub request failed.');
  return new SyncError(message, response.status >= 500 ? 503 : response.status, rateLimited || response.status === 409 || response.status >= 500, retryAfter);
}
async function syncSubmission(config, submission, fetchImpl) {
  const s = validateSubmission(submission);
  if (submission.target !== config.target) throw new SyncError('Destination changed. Reconnect and requeue this solution for the new destination.', 409, false);
  const request = githubClient(config, fetchImpl);
  const file = filePath(config, s);
  const endpoint = `/repos/${config.owner}/${config.repo}/contents/${file.split('/').map(encodeURIComponent).join('/')}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { response, data } = await request(endpoint + (config.branch ? `?ref=${encodeURIComponent(config.branch)}` : ''));
    if (!response.ok && response.status !== 404) throw githubError(response);
    if (response.ok && (data.type !== 'file' || !data.sha)) throw new SyncError('Destination is not a regular file.', 409);
    if (response.ok && data.encoding === 'base64' && Buffer.from(data.content || '', 'base64').toString('utf8') === s.code)
      return { success:true, action:'unchanged', path:file, url:data.html_url };
    const body = { message:`${response.ok ? 'Update' : 'Add'} ${s.slug} (${s.language})`, content:Buffer.from(s.code,'utf8').toString('base64') };
    if (response.ok) body.sha = data.sha;
    if (config.branch) body.branch = config.branch;
    const write = await request(endpoint, { method:'PUT', body:JSON.stringify(body) });
    if (write.response.status === 409 && attempt < 2) continue;
    if (!write.response.ok) throw githubError(write.response);
    return { success:true, action:response.ok ? 'updated' : 'created', path:file, url:write.data.content?.html_url };
  }
}
module.exports = { extensions, SyncError, validateSubmission, filePath, githubClient, githubError, syncSubmission };
