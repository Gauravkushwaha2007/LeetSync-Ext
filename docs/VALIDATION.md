# AutoSync 3.0 validation

Command: `npm test` at the project root. Runtime: Node.js 24.19.0 on Linux; declared minimum Node 22.

**39 automated tests passed; 0 failed.** Tests use protocol fixtures/mock GitHub responses and a real local HTTP server for broker checks. No real OAuth app registration, live GitHub authorization or repository commits were performed.

Coverage includes:

- PKCE challenge derivation, OAuth state rejection, declined authorization, exact callback checking, malformed token rejection and fail-closed public configuration.
- Broker origin/callback/verifier validation, server-only app secret, sanitized errors, fixed provider endpoints, refresh and revoke routes.
- Account identification, per-account queue isolation, account switching during upload, reconnecting an existing account, concurrent capture deduplication and content-script access controls.
- Refresh rotation and identity checking, mismatched identity rejection, login cancellation during disconnect and v2 migration.
- Writable repository filtering and pagination, explicit branch/destination fingerprinting, rename-safe repository IDs, create/update SHA handling, UTF-8, duplicate content and error classification.
- Full fetch/XHR submission capture, acceptance matching, multiple submissions, Run/rejected exclusions, queue limits, retention and backoff.

All packaged JavaScript is syntax checked, and manifest/UI script/style references are checked before packaging. Source archive excludes original secrets, Git history, dependencies and executables.

## Not verified here

- Live GitHub account authorization, publisher app configuration, hosted HTTPS service, Chrome Web Store registration or publication.
- Browser-rendered dashboard and full extension runtime end-to-end flow. Chromium was unavailable in the environment; the earlier download attempt failed. Static checks are not visual/browser certification.
- Real LeetCode request formats against a logged-in account. Capture fixtures are representative, not a promise of future website compatibility.
- Node 22 itself or Windows/Edge execution.

## Publisher live smoke test

1. Configure a publisher-owned app, exact extension callback and HTTPS broker as in PUBLISHER.md. Load the configured extension with that ID.
2. Connect GitHub account A. Confirm authorization occurs only on github.com and that the detected identity is correct.
3. Select A's repository and branch; submit accepted code and compare the complete GitHub source.
4. Switch to account B. Confirm A's history/destination disappear from the active workspace. Select B's repository and repeat.
5. Return to A and confirm only A's queue/settings return. Test switching accounts during an upload; any sent upload must stay in A's repository.
6. Test public-only authorization, explicit private access, organizations that restrict OAuth, read-only repos and protected branches.
7. Test cancellation, invalid/expired authorization, token renewal, network outage/retry and disconnect/revoke.
8. Inspect popup/dashboard at normal and small widths. Exercise repo/branch pagination, search, manual entry, pause/resume and export. Verify exports have no credentials.
9. Audit the final configured extension ZIP and hosting logging policy before Web Store submission.
