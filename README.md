# AutoSync 3.0 — GitHub OAuth

AutoSync connects each user to their own GitHub account and syncs newly accepted LeetCode submissions to a repository they select.

**Implemented source release.** The publisher must register a GitHub OAuth app, host the included authentication service, and configure the public app/extension IDs before real sign-in works. This archive is not already registered, deployed, or published on the Chrome Web Store. It intentionally refuses login while publisher configuration is missing.

## End-user flow (configured release)

1. Add AutoSync to Chrome. The workspace opens automatically.
2. Select **Connect with GitHub**. GitHub handles account selection, sign-in, authorization and any verification it requires.
3. Return to AutoSync. Your account is identified automatically and writable repositories are listed.
4. Choose a repository and an existing branch, then **Use this repository**.
5. Reload LeetCode. New accepted submissions are queued and synced automatically.

Users do **not** create personal access tokens, install Node.js, run a local server, enter pairing keys, or edit configuration files. OAuth still uses user-specific tokens internally; GitHub issues these through authorization rather than users supplying them manually.

## Features

- Authorization Code OAuth with PKCE S256 and random state verification.
- GitHub account identification, repository discovery, pagination, filtering, and branch selection.
- Public-repository scope by default; optional private-repository access with explicit consent.
- Account-specific queues/settings keyed by GitHub's numeric user ID.
- Numeric repository ID pinning, so a repository rename does not redirect to another repository with its old name.
- Automatic renewal when GitHub issues expiring access/refresh tokens; reconnect on invalid credentials or identity mismatch.
- Disconnect clears local credentials and attempts server-side token revocation.
- Direct extension-to-GitHub solution upload. Source code never travels through the OAuth service.
- Full submitted-code capture using submission request/verdict matching, preserving whitespace and off-screen code.
- Multiple languages, duplicate-content detection, SHA-aware updates, retries, pause/resume and history export.
- Light green workspace, activity search/filtering, manual solution uploads and actionable errors.

## Publisher and development

See [PUBLISHER.md](docs/PUBLISHER.md) for the one-time registration/deployment steps and [ARCHITECTURE.md](docs/ARCHITECTURE.md) for the security boundaries. These are publisher responsibilities, not steps each user must repeat.

Run tests with Node.js 22+:

```sh
npm test
```

No npm dependencies are required. A Chrome/Edge installation is needed for live extension tests.

```text
extension/       Chrome Manifest V3 extension and complete user interface
oauth-service/   Stateless OAuth exchange/refresh/revoke service and Dockerfile
scripts/         Publisher release configuration tool
tests/           Automated security and behavior tests
docs/            Publisher instructions, architecture, privacy and validation
```

## Sync behavior

Files are stored as `LeetCode/two-sum/cpp/solution.cpp` (or the selected folder). Branches and repositories must already exist; the UI links to GitHub's repository creation page. Initialize a new repository with a README, then refresh.

One item starts immediately after an enqueue/resume/retry action; the one-minute alarm handles remaining due items. The browser must be running. Network/server failures and rate limits retry up to eight attempts. SHA conflicts retry with a fresh read on the next attempt. Older unfinished entries block later versions of the same problem/language to prevent stale overwrites.

Changing destination leaves older entries waiting for their original account/repository/branch/folder. Switching accounts never reassigns their submissions. An upload already sent can finish in its original repository after disconnect/account switching.

Limits: 100 unfinished entries and 500 completed entries per account, with a conservative 8 MB aggregate profile/legacy budget. Source is retained for pending items and removed from completed local entries. GitHub holds completed source. Export includes pending source, never OAuth credentials. Removing local history does not delete GitHub files.

## Updating from v2

Load the updated extension in the same unpacked folder/extension identity. v3 removes the old pairing settings and preserves the old queue as a v2 backup. Settings offers **Export preserved v2 queue backup**. Old entries are not automatically attached to a GitHub account because v2 never verified account ownership. Recover pending code using **Add solution** after choosing your destination.

The local server and Windows setup launchers are retired. You may stop the old server. v1/v2 GitHub files are not deleted or moved. If an old token was exposed in an archive, revoke it through GitHub; this source release never copies it.

## Limitations

LeetCode's submission/check formats are not a guaranteed public API. Reload the tab after extension updates. Only submissions observed after loading are captured; closing/reloading before a verdict loses that in-flight observation. Run-only results and old accepted history do not auto-import. Use manual entry for recovery.

Organization OAuth policies and branch protection can still block access or direct commits. OAuth `repo` scope is broad; repository selection is an application-level write restriction, not GitHub's fine-grained permission boundary. See the security and privacy documents for details.

Current validation: 39 automated tests pass. Live GitHub authentication, Web Store publishing and browser visual/end-to-end checks remain unverified. See [VALIDATION.md](docs/VALIDATION.md).
