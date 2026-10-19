# AutoSync v3 architecture and security

## Authentication flow

1. A trusted extension page asks its service worker to connect. LeetCode content scripts cannot trigger login, list repositories, retrieve state or change settings.
2. The worker generates random state and a PKCE verifier, derives an S256 challenge and stores the short-lived pending transaction in trusted `chrome.storage.session`.
3. `chrome.identity.launchWebAuthFlow` opens GitHub's authorization page with the public Client ID, exact chromiumapp.org redirect, scope, state and challenge. GitHub handles the password, MFA and account picker.
4. The worker verifies exact callback origin/path, single matching state, one authorization code, no fragment, and a ten-minute deadline. It consumes pending state before exchange.
5. The worker sends the code/verifier to the fixed HTTPS broker. The broker validates the allowed extension Origin and exact corresponding redirect, adds its server-only app secret, and calls GitHub's fixed token endpoint.
6. Tokens return in a no-store JSON response, never in a redirect URL. The worker calls GitHub `/user` to identify the numeric account before saving a connected session.
7. The worker retrieves writable user repositories and branches. Selection is checked against GitHub before it is saved.

No static user token is embedded. The public OAuth app registration is shared across the product; every authorization grants a separate user's access. The publisher app secret only belongs to the hosted service.

## Credentials and account boundaries

OAuth credentials are stored locally in the browser profile with `TRUSTED_CONTEXTS` access; content scripts are excluded. The dashboard receives sanitized account/settings/history messages rather than token fields. Credentials are not stored in `storage.sync`, sent to LeetCode, exported, or logged by the service.

Trusted extension pages can technically access trusted extension storage. This is not an encrypted vault or an OS-user isolation boundary. An attacker controlling the browser profile or trusted extension code can obtain local credentials. Keep the extension free of remote scripts and protect publisher releases. Manifest V3's default extension CSP is retained; no remotely hosted code, eval or inline scripts are used.

Profiles use GitHub numeric user IDs. Destination fingerprints include account ID, repository ID, branch and folder. Queue items pin these values. A new login selects that user's own history/settings. Switching accounts cannot route a prior account's queue through the new token. Old queues remain local until that account signs in again.

Requests recheck the session ID before obtaining the OAuth token. If a request was already sent, disconnect cannot recall it; completion is written only to the original account's history. A generation guard prevents late login/refresh completion from restoring credentials after disconnect. Refresh validates account identity again and rotates saved credentials; invalid/changed identity requires reconnect.

## Sync data path

LeetCode page observation → isolated content-script message → validated worker queue → GitHub Contents API.

The OAuth service is not in the source upload path. It has no generic proxy endpoint and no repository-write endpoint. OAuth operations are only exchange, refresh and token revocation. File writes use fresh SHA values and the chosen explicit branch. GitHub conflicts are retried by the durable queue. Repository IDs are resolved before writes to handle renames safely.

LeetCode's MAIN-world observation bridge is not cryptographic acceptance proof. A compromised LeetCode page can forge accepted payloads. Only schema-valid solution data can enter the queue, and the page cannot pick the GitHub destination, read credentials or invoke arbitrary GitHub endpoints.

## Permissions and least privilege

- `identity`: OAuth browser flow and extension redirect.
- `storage`: credentials/settings/local queue; content scripts cannot read storage.
- `alarms`: retry processing when the worker wakes.
- `https://api.github.com/*`: authenticated repository discovery and uploads.
- Exact broker HTTPS origin: exchange/refresh/revoke only.
- LeetCode matches: content scripts observe relevant submission traffic.

Default OAuth scope is `public_repo read:user offline_access`. Opt-in private access requests `repo` instead of `public_repo`. OAuth `repo` access is broader than one selected repository; the destination picker limits AutoSync's behavior, not the scope of the token at GitHub. Existing app authorizations may retain previously granted broader permissions; users can revoke the grant on GitHub and authorize again to narrow it. A future GitHub App installation model would offer repository-scoped provider permissions but is not claimed by this implementation.

## Failure handling

Auth cancellation, callback mismatch and bad state never exchange a code. Configuration is fail-closed. Timeouts and GitHub rate limits preserve queue data. Permanent auth/permission errors require user correction. The broker sanitizes upstream error bodies and uses no-store responses, timeouts, request-size limits and bounded concurrency. Deploy it behind HTTPS and edge rate limiting; keep sensitive request/response bodies out of hosting logs.

Revocation after disconnect is best effort if the network/provider is unavailable. The UI reports that limitation and links to GitHub's application-access page. Revoke the grant there to remove remaining provider access. Automatic token expiry, refresh response loss, browser-profile deletion and extension uninstall can require reauthorization; the implementation does not claim impossible exactly-once refresh delivery across network failure.
