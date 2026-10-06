# AutoSync 2.0

A Chrome/Edge extension and local Node.js companion that syncs newly accepted LeetCode submissions to a GitHub repository you choose.

## What changed

- **Complete submitted code:** observes the submission request and matches its submission ID to an accepted verdict. No editor-line scraping, truncation, or delayed capture of later edits.
- **Multiple submissions per session:** works without the old one-upload-per-page flag, including problem changes in the same tab.
- **27 language identifiers:** C++, C, Java, Python/Python3, JavaScript, TypeScript, C#, Go, Rust, Kotlin, Swift, Ruby, Scala, PHP, Dart, Racket, Erlang, Elixir, SQL dialects, Bash and aliases.
- **Persistent queue:** pause/resume, capped automatic retries with backoff, actionable errors, manual retry and crash recovery.
- **A full workspace:** light green overview, counters, recent activity, search/status filters, manual solution form, settings, and JSON history export.
- **Configurable destination:** repository, existing branch and folder. No hardcoded account.
- **GitHub OAuth:** users can connect their GitHub account through the browser authorization flow instead of entering a personal access token. The server keeps the OAuth client secret local and the extension stores only its temporary session identifier.
- **Safer GitHub writes:** SHA-aware updates, Unicode preservation, identical-content detection, conflict retries and ordered local writes.
- **Local service:** binds to `127.0.0.1`; the OAuth callback also uses a loopback address.
- **No npm dependencies:** uses Node.js built-ins, including its test runner. No `npm install` needed for normal use.

## Quick start on Windows

### 1. Configure GitHub OAuth (developer setup)

This repository currently uses a GitHub OAuth App for the local companion prototype. Create the OAuth App in GitHub Developer Settings and set the callback URL exactly to:

```text
http://127.0.0.1:3000/oauth/callback
```

Then create `server/.env` from `.env.example` and set:

```text
GITHUB_OAUTH_CLIENT_ID=your_client_id
GITHUB_OAUTH_CLIENT_SECRET=your_client_secret
GITHUB_OAUTH_CALLBACK=http://127.0.0.1:3000/oauth/callback
PORT=3000
```

The OAuth client secret must remain on the local server and must never be placed inside the extension source.

### 2. Start the companion

Install Node.js 22 or newer if needed. From the extracted project:

```powershell
cd "D:\AutoSync\server"  # replace with your extracted folder
npm start
```

The service should report that AutoSync is running on `127.0.0.1:3000`.

### 3. Load the extension

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Remove or disable an older AutoSync/LeetSync build first, so two extensions cannot upload the same submission.
3. Enable **Developer mode** → **Load unpacked**.
4. Select this project's `extension` folder.
5. Open AutoSync from the extension toolbar.
6. Choose **Connect GitHub**.
7. Authorize the GitHub account in the browser.
8. Select the repository, branch and destination folder.

No GitHub personal access token or pairing key is required by the OAuth flow.

### 4. Solve normally

Submit a solution on LeetCode. A newly observed **Accepted** result saves the actual submitted code to the queue and uploads it to the selected GitHub repository. A **Run** result does not trigger uploads.

Previously accepted submissions and submissions sent before the extension loaded are not captured retroactively; use **Add solution** for those.

## How files are organized

```text
LeetCode/two-sum/cpp/solution.cpp
LeetCode/two-sum/python3/solution.py
LeetCode/reverse-string/java/solution.java
```

Each problem and language has its own file. Python/Python3 and SQL dialects remain separate. Difficulty is metadata, not a folder: missing or changing difficulty will not move code. Files contain the exact code, without generated headers that might invalidate SQL or other languages. Git commits supply version history.

## Queue behavior

- Queued source is stored in `chrome.storage.local` and survives browser restarts.
- Pause stops new uploads but still captures new submissions. An already-running upload can finish.
- One job runs immediately after enqueue/resume/retry. A one-minute alarm processes additional due jobs.
- Transient network/server failures, GitHub rate limits, and conflicts retry with exponential backoff up to eight attempts. Permanent errors need correction and manual retry.
- Older unfinished entries block newer entries for the same destination/problem/language to prevent stale code overwrites.
- Identical destination/problem/language/code is deduplicated. Identical content already on GitHub produces no new commit.
- A destination fingerprint is pinned to each queued item so changing repositories cannot silently redirect old queued submissions.
- Export includes history and pending source code, never connection credentials.

## Development and validation

```sh
cd server
npm test
```

The automated tests use Node's built-in test runner and simulated GitHub responses; they do not spend tokens, contact user accounts, or write to a real repository. See `docs/VALIDATION.md` for validation details.

```text
AutoSync/
  extension/           Manifest V3 extension and dashboard
  server/              Local OAuth service and GitHub sync logic
  tests/               Automated regression tests
  docs/                Project review and validation
  setup.cmd            Windows setup launcher
  start.cmd            Windows service launcher
```

## Scope and privacy

AutoSync supports desktop Chrome/Edge and leetcode.com. It is not an Android app or a cloud service. It captures submissions observed while the tab remains loaded, with an in-memory capture window of 15 minutes.

LeetCode's submission/check endpoints are not a guaranteed public integration contract. The extension observes matching fetch and XMLHttpRequest traffic and returns original responses unchanged. It does not scrape virtual editor lines or send cookies to the companion.

GitHub OAuth credentials and source code are sensitive. Never commit `server/.env`, OAuth client secrets, or extension exports containing source code. The current OAuth session is held by the local companion and is intentionally not written into the repository.

GitHub OAuth is currently implemented as a local-companion prototype. For a public distributed release, the OAuth client secret should be moved behind a hosted backend or the authentication architecture should be changed so the secret is never required on an end user's machine.
