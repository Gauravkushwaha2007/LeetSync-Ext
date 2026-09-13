# Validation report — AutoSync 2.0.0

## Completed in this environment

- Runtime: Node.js 24.19.0 on Linux. Minimum declared runtime: Node 22.
- Command: `cd server` then `npm test`.
- **25 automated tests passed, 0 failed.**
- All 15 JavaScript files passed `node --check`.
- All manifest entry points resolve to packaged files.
- Dashboard/popup HTML: unique IDs, all JavaScript ID references present, all linked scripts/stylesheets present.
- Delivery archive audited to exclude `.env`, Git history, installed dependencies, executables, caches, user source submissions and runtime logs.

## Test coverage

| Area | Verified behavior |
| --- | --- |
| Capture | Full multiline source, submission-ID matching, multiple accepted submissions, pending/rejected verdicts, Run exclusion, cross-origin exclusion, fetch and XHR |
| Queue | Duplicate suppression, unfinished-item limits, completed-history retention, retry timing, validation |
| Worker | Concurrent captures, serialized persistence, restart, offline recovery, source retention on failure, source removal after success, stale in-flight recovery, message access controls, destination mismatch, older-job ordering |
| GitHub client | Create/update, branch selection, UTF-8, file SHA, identical-content no-op, error classification, conflict refresh, rate-limit timing, network failure, destination pinning |
| Local HTTP service | Real local requests: health, authentication, origins, preflight, malformed body, validation, upload with simulated GitHub, metadata-only log |

GitHub calls use simulated responses. No real repository commits or live account authentication were performed. No credential from the original archive was used.

## Remaining limitations

Browser-based visual and end-to-end extension tests could not run here. Playwright was present but Chromium was absent; installation failed with HTTP 502/network timeouts. Static UI and JavaScript checks passed, but do not replace rendering in Chrome/Edge.

LeetCode's live website and private request formats were not verified using an authenticated account. Capture tests use representative submission/check payloads. Windows launchers and the interactive hidden-token prompt were not run on Windows. Node 22 was not available; tests ran on Node 24.19.0.

## Live smoke test on your computer

1. Revoke the token exposed in the original ZIP; create a replacement scoped to a test repository with Contents read/write access. Initialize the repository with a README.
2. Run setup and start the companion. Disable v1, load v2 unpacked, and save/test the pairing key in Settings.
3. Check dashboard/popup layout, navigation, search and status filters at your normal screen size.
4. Submit a new accepted solution. Confirm the toast and synced entry. Compare the entire GitHub source, indentation and final lines with the submitted code.
5. Submit a second solution in the same tab and one in another language. Verify separate file paths/extensions.
6. Stop the companion, submit another accepted solution, and confirm its code stays in the retry queue. Restart the companion, retry, and verify successful upload.
7. Pause sync, add a manual solution, restart the browser, and verify it remains pending. Resume and check the result.
8. Export history and confirm no credentials appear. Remove a completed local entry and verify its GitHub file remains.

This is a source release ready for local setup and smoke testing; it is not a claim of live-account or store-release certification.
