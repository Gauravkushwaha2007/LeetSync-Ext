# Changelog

## 2.0.0

- Replaced visible-editor scraping with request/accepted-verdict matching for fetch and XHR.
- Added persistent sync queue, retry backoff, service-worker restart recovery, pause/resume and queue badge.
- Added workspace overview, searchable history, filters, manual source entry, settings, exports and local history removal.
- Added configurable owner, repository, branch, folder and port, with an interactive setup wizard.
- Added language-specific source paths and UTF-8 preservation.
- Added duplicate-content detection, SHA-aware updates, serialized writes and conflict retries.
- Added destination pinning and per-problem ordering to prevent wrong-repository or stale overwrites.
- Added pairing authentication, loopback-only binding, origin restrictions, input validation, network timeouts and safe error messages.
- Added metadata-only rotating local activity logs.
- Removed runtime npm dependencies; added Windows launchers and setup documentation.
- Added automated capture, service, GitHub-client, queue and worker regression coverage.
