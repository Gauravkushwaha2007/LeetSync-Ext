# AutoSync privacy information

Publisher: replace this source document's publisher/contact details with your own before publishing it as the public privacy policy.

AutoSync processes your GitHub account identifier, authorized repository metadata, selected destination, LeetCode submission source and local sync history to provide automatic solution backups.

Your GitHub password and MFA are entered only on GitHub. GitHub-issued OAuth credentials are stored in the extension's local browser profile, accessible to trusted extension contexts. They are not cloud-synced by AutoSync or included in history exports. The hosted authentication service processes OAuth codes, verifier/refresh credentials and app authentication only to exchange, renew or revoke access. Its application code does not persist them. The publisher must configure hosting infrastructure not to log OAuth request/response bodies.

Solution source is transmitted directly from your extension to GitHub and committed to your chosen repository. It is never sent through the OAuth broker. Repository visibility and GitHub's retention rules apply to uploaded files. Choosing a public repository publishes the source there.

Pending source remains locally until uploaded or manually removed. Completed local history keeps metadata and links but removes source to conserve space. Accounts have separate local histories. Disconnect removes the active local credentials and attempts token revocation, while retaining queued/history data for that account. History can be exported and removed through the workspace. Uninstalling the extension removes its browser-local data. GitHub repository files must be managed separately on GitHub.

The extension contains no analytics or advertising integration. GitHub and the publisher's hosting provider process service traffic under their respective policies. Hosting access metadata may still exist depending on the publisher's infrastructure settings.

The user can review/revoke authorization from GitHub Settings → Applications. Revocation or uninstalling AutoSync does not remove already-committed GitHub source.
