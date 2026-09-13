# AutoSync 2.0

A Chrome/Edge extension and local Node.js companion that syncs newly accepted LeetCode submissions to a GitHub repository you choose.

## What changed

- **Complete submitted code:** observes the submission request and matches its submission ID to an accepted verdict. No editor-line scraping, truncation, or delayed capture of later edits.
- **Multiple submissions per session:** works without the old one-upload-per-page flag, including problem changes in the same tab.
- **27 language identifiers:** C++, C, Java, Python/Python3, JavaScript, TypeScript, C#, Go, Rust, Kotlin, Swift, Ruby, Scala, PHP, Dart, Racket, Erlang, Elixir, SQL dialects, Bash and aliases.
- **Persistent queue:** pause/resume, capped automatic retries with backoff, actionable errors, manual retry and crash recovery.
- **A full workspace:** light green overview, counters, recent activity, search/status filters, manual solution form, settings, and JSON history export.
- **Configurable destination:** repository, existing branch and folder. No hardcoded account.
- **Safer GitHub writes:** SHA-aware updates, Unicode preservation, identical-content detection, conflict retries and ordered local writes.
- **Local credentials:** GitHub token stays in `server/.env`. Only the local pairing key is stored in the extension. The service binds to `127.0.0.1`.
- **No npm dependencies:** uses Node.js built-ins, including its test runner. No `npm install` needed for normal use.

## Quick start on Windows

### 1. Prepare GitHub

1. Create your solutions repository and initialize it with a README.
2. Create a fine-grained personal access token for that repository with **Contents: read and write**. If an organization requires approval, obtain it first.
3. Use an existing branch that allows direct commits. An initialized default branch is the easiest option. AutoSync does not create repositories or branches.

**The original uploaded archive contained a populated GitHub token. Revoke that token and create a new one before setup. The updated archive contains no copied credentials or Git history.**

### 2. Start the companion

Install Node.js 22 or newer if needed. Extract this archive to a normal writable folder.

Double-click `setup.cmd` for configuration, then `start.cmd` to run the companion. Or use PowerShell:

```powershell
cd "D:\AutoSync\server"  # replace with your extracted folder
npm run setup
npm start
```

Setup asks for owner, repository, existing branch (Enter uses the repository default), folder and port. It hides the GitHub token as you enter it and generates a separate pairing key. Copy that pairing key. Keep the server terminal open while syncing.

If you rerun setup, restart the running server so it reads the new configuration.

### 3. Load the extension

1. Open `chrome://extensions` (Edge: `edge://extensions`).
2. Remove or disable AutoSync v1 first, so two extensions cannot upload the same submission.
3. Enable **Developer mode** → **Load unpacked**.
4. Select this project's `extension` folder, not the whole project or ZIP.
5. Open AutoSync from the extension toolbar → **Open workspace** → **Settings**.
6. Enter the server port and pairing key → **Save & test connection**.
7. Reload any already-open LeetCode tabs.

The connection test checks repository access and an explicitly configured branch. Fine-grained token Contents write permission and branch rules are ultimately checked by the first upload.

### 4. Solve normally

Submit a solution on LeetCode. A newly observed **Accepted** result saves the actual submitted code to the queue and displays a toast. The badge shows items still needing attention. Open the workspace to inspect the final upload result.

A **Run** result does not trigger uploads. Previously accepted submissions and submissions sent before the extension loaded are not captured retroactively; use **Add solution** for those.

## How files are organized

```text
LeetCode/two-sum/cpp/solution.cpp
LeetCode/two-sum/python3/solution.py
LeetCode/reverse-string/java/solution.java
```

Each problem and language has its own file. Python/Python3 and SQL dialects remain separate. Difficulty is metadata, not a folder: missing or changing difficulty will not move code. Files contain the exact code, without generated headers that might invalidate SQL or other languages. Git commits supply version history. AutoSync v1's `Easy/Title.cpp` files are left in place; v2 does not migrate or delete them.

## Queue behavior

- Queued source is stored in `chrome.storage.local`, survives browser restarts, and is removed from local history after successful upload to conserve space. GitHub retains the code.
- Pause stops new uploads but still captures new submissions. An already-running upload can finish.
- One job runs immediately after enqueue/resume/retry. A one-minute alarm processes additional due jobs. A browser that is closed or asleep cannot process the queue; it resumes later.
- Transient network/server failures, GitHub rate limits, and conflicts retry with exponential backoff up to eight attempts. Permanent errors need correction and manual retry.
- Older unfinished entries block newer entries for the same destination/problem/language to prevent stale code overwrites. Resolve or remove the blocking entry to continue that problem.
- Identical destination/problem/language/code is deduplicated against retained history. Identical content already on GitHub produces no new commit.
- A destination fingerprint is pinned to each item. A repository/branch/folder configuration change cannot silently send the old queue elsewhere. Reconnect the original destination, or export its pending code and add it manually to the new one. Changes to the same repository's default branch are not detected if the branch setting was left blank; set an explicit branch if that matters.
- Up to 100 unfinished entries, 500 completed entries and a conservative 7 MB queue budget. A full queue reports an error rather than dropping existing source.
- Export includes history and **pending source code**, never connection keys. It is an export for inspection/recovery, not an automatic restore/import format. Removing an entry or clearing history never deletes GitHub files.
- Uninstalling the extension removes its queue. Export before uninstalling. Keep the same unpacked extension folder when updating to retain its extension identity.

## Troubleshooting

| Symptom | What to do |
| --- | --- |
| Local service unavailable | Run `npm start`, check the configured port, and confirm the terminal remains open. |
| Pairing key incorrect | Copy `AUTOSYNC_KEY` from your local `.env`, not the GitHub token. Reconnect in Settings. |
| GitHub access denied | Check token expiry, selected repository, Contents permission, organization policy and branch protection. |
| Repository or branch not found | Check spelling, private-repo access, and initialize the branch with a README. |
| No capture toast | Reload LeetCode after installing/updating. Only new submit requests followed by Accepted are captured. If LeetCode changes its request format, use Add solution and report the change. |
| Missing difficulty | It is recorded as Unknown; the source still syncs to the correct problem path. |
| Queued while an older entry failed | Resolve/retry or remove that problem's older failed entry. |
| Port already in use | Stop v1 or the other process, or choose another port in setup and reconnect. |
| Server config changed | Restart the server and run Save & test connection in extension Settings. |

## Development and validation

```sh
cd server
npm test
```

The automated tests use Node's built-in test runner and simulated GitHub responses; they do not spend tokens, contact user accounts, or write to a real repository. See `docs/VALIDATION.md` for actual results and the remaining live smoke test.

```
AutoSync/
  extension/           Manifest V3 extension and dashboard
  server/              Local service, setup, .env.example
  tests/               Automated regression tests
  docs/                Project review, changes and validation
  setup.cmd            Windows setup launcher
  start.cmd            Windows service launcher
```

## Scope and privacy

AutoSync supports desktop Chrome/Edge and leetcode.com. It is not an Android app or a cloud service. It captures submissions observed while the tab remains loaded, with an in-memory capture window of 15 minutes. Closing/reloading the tab before the verdict loses that in-flight capture; the manual form is the recovery path.

LeetCode's submission/check endpoints are not a guaranteed public integration contract. The extension observes matching `fetch` and XMLHttpRequest traffic and returns original responses unchanged. It does not scrape virtual editor lines, send cookies to the companion, or inspect unrelated request bodies. The page-world bridge is not proof of acceptance against a compromised page; captured source is treated as untrusted input by the companion. Manual uploads are explicitly labeled and are not acceptance-verified.

GitHub tokens and source code are sensitive. Do not share `.env`, extension exports containing source, or the server's `data` folder. The local key is stored in the browser profile, not an encrypted vault. Activity logs include problem metadata and GitHub result links, not credentials or source. Logs rotate after approximately 2 MB.

API references used for implementation: [Chrome storage](https://developer.chrome.com/docs/extensions/reference/api/storage), [Chrome alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms), and [GitHub repository contents](https://docs.github.com/en/rest/repos/contents).
