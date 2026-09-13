# Publisher configuration and launch

This document is for the extension owner. End users only install, authorize GitHub and select a repository.

## 1. Obtain a stable extension ID

Reserve/create the extension entry in the Chrome Web Store developer dashboard. Use its extension ID for the production release. For unpacked development, use the ID shown on chrome://extensions; keep a separate development OAuth app. Chrome's identity redirect is bound to the extension ID.

For unpacked testing with the production ID, follow Chrome's documented manifest public-key workflow; a manifest public key is not an OAuth secret. Do not invent an extension ID or use another extension's ID. Edge distribution has its own identity; configure its callback and allowed ID deliberately.

## 2. Register your GitHub OAuth app

Create an OAuth app under your account or organization. Use AutoSync's real homepage and set this **exact authorization callback**, replacing EXTENSION_ID:

`https://EXTENSION_ID.chromiumapp.org/github`

Disable wildcard callback matching. Register additional exact callbacks only for publisher-controlled extension IDs. A separate OAuth app for development avoids broad production allowlists.

Copy the app's Client ID. Generate a Client Secret and put it in the hosting provider's secret manager. **Never put the Client Secret into extension files, Git, build output, screenshots, or a public chat.** Enable expiring tokens if available. The extension requests `offline_access` and handles both expiring and non-expiring responses.

## 3. Host the OAuth service once

Deploy `oauth-service/` as a Node.js 22+ service or build its Dockerfile. No database is needed: the service does not retain OAuth tokens or user source.

Set these deployment environment variables:

| Variable | Value |
| --- | --- |
| GITHUB_CLIENT_ID | Your GitHub OAuth app's public client ID |
| GITHUB_CLIENT_SECRET | App secret from the hosting secret manager |
| EXTENSION_IDS | Comma-separated publisher-owned 32-character extension IDs |
| PORT | Listening port; default 8080 |

Start command: `node app.js` within `oauth-service`, or `npm run start:oauth` at the project root.

Expose the service on a real **HTTPS origin**, such as your own auth subdomain. The Node listener is for the hosting ingress; TLS termination is required at the public edge. Do not expose it as public plaintext HTTP. Configure health checks at `/health`.

Disable request/response-body logging in the proxy, hosting dashboard/APM and tracing tools for `/oauth/*`. Those bodies contain codes or credentials. Do not cache these routes. Put an edge rate limiter in front of the service and test expected traffic; the included per-process limiter uses socket IP and does not trust forwarded-IP headers. Behind one proxy, its limit is shared by that proxy's traffic. Adjust the deployment capacity/policy deliberately rather than trusting spoofable client headers.

The broker's CORS allowlist is browser-origin defense, not server authentication: non-browser clients can spoof Origin. PKCE possession, GitHub's single-use code verification, exact callback binding and fixed app credentials form the actual exchange boundary. The service accepts no caller-selected upstream URL or Client Secret.

## 4. Configure the release (public values only)

In PowerShell at the project root:

```powershell
$env:AUTOSYNC_CLIENT_ID = "YOUR_PUBLIC_CLIENT_ID"
$env:AUTOSYNC_EXTENSION_ID = "YOUR_ACTUAL_EXTENSION_ID"
$env:AUTOSYNC_BROKER_ORIGIN = "https://YOUR_AUTH_HOST"
npm run configure-release
```

The script writes `extension/config.js` with these public values and updates manifest host permissions to exactly the GitHub API and your broker origin. No Client Secret is read or written by this script. An app Client ID is a public identifier, not a user token.

Load `extension/` unpacked with the registered ID and run the live checks in VALIDATION.md. Do not upload the source archive wholesale to the Web Store: zip the configured **contents of extension/** so manifest.json is at the ZIP root. Never include the broker, a .env file, publisher secrets or tests in the Web Store package.

## 5. Publish only after live checks

- Run `npm test` and the authenticated two-account smoke test.
- Verify the exact callback and broker origin against the store extension ID.
- Host an accurate public privacy policy based on PRIVACY.md, complete Web Store disclosures and explain permissions.
- Submit the configured extension ZIP through the publisher dashboard. GitHub registration and store approval are external steps; this project cannot fabricate them.

This source delivery has not performed app registration, deployment or Web Store submission. Without your actual publisher-owned registration and HTTPS service, the sign-in button deliberately reports that this build is not configured.

## References

- [GitHub OAuth authorization, state, PKCE and refresh](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)
- [Chrome identity API](https://developer.chrome.com/docs/extensions/reference/api/identity)
- [GitHub token revocation](https://docs.github.com/en/rest/apps/oauth-applications)
