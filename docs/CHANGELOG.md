# Changelog

## 3.0.0 — Multi-user OAuth

- Replaced per-user PAT/local companion setup with a GitHub OAuth authorization flow.
- Added PKCE S256, random state, exact callback validation and automatic account identity verification.
- Added stateless hosted OAuth exchange/refresh/revoke service. Client Secret is read only from hosting environment.
- Added automatic writable-repository discovery, pagination, filtering, branch selection and optional private-repository consent.
- Added account-specific settings/history/queues keyed by numeric GitHub user ID.
- Added rotating token refresh, account-switch guards, disconnect and best-effort revocation.
- Moved solution upload directly into the extension's GitHub client with no broker source-code forwarding.
- Added numeric repository ID pinning, preserving destinations across renames.
- Replaced pairing-key interface with Connect with GitHub and a repository picker; kept the light green dashboard.
- Added v2 queue-backup export and removed old pairing credentials during migration.
- Removed local companion server, Windows setup scripts and obsolete tests.
- Added publisher registration/deployment instructions, privacy/security documentation and OAuth regression tests.

## 2.0.0

Introduced full submitted-code capture, persistent queues, retries, light green workspace, language support, duplicate prevention and SHA-aware GitHub uploads. Its PAT/local-server architecture is retired in v3.
