# AutoSync

<div align="center">

### LeetCode → GitHub, automatically.

A Chrome extension that connects your GitHub account with LeetCode and automatically syncs your **accepted solutions** to a repository you choose.

<br/>

[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-4285F4?style=for-the-badge&logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/extensions/develop/migrate)
[![Node.js 22+](https://img.shields.io/badge/Node.js-22%2B-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](https://nodejs.org/)
[![GitHub OAuth](https://img.shields.io/badge/GitHub-OAuth-181717?style=for-the-badge&logo=github&logoColor=white)](https://docs.github.com/en/apps/oauth-apps)
[![Tests](https://img.shields.io/badge/tests-39%20passing-2ea44f?style=for-the-badge)](#validation)

</div>

---

## ✨ What AutoSync does

AutoSync removes the repetitive work of copying LeetCode solutions into GitHub.

**Solve → Submit → Accepted → GitHub**

After GitHub authorization, you choose the repository and branch once. AutoSync then captures the code belonging to the accepted submission and uploads it directly to your selected GitHub destination.

### Highlights

- 🔐 **GitHub OAuth + PKCE** — no personal access token or pairing key for users
- 👤 **Per-user GitHub accounts** — each user authorizes their own account
- 📦 **Repository & branch selection** — choose where solutions should go
- ⚡ **Automatic accepted-submission sync**
- 🧠 **Complete submitted source capture** — preserves the actual submitted code
- 🔁 **Queue, retry & recovery** — transient failures are retained and retried
- 🛡️ **SHA-aware GitHub writes** — safer updates and conflict handling
- 🚫 **Duplicate detection** — identical code does not create unnecessary commits
- 📊 **Activity dashboard** — sync history, queue state and actionable errors
- 🌐 **Direct GitHub uploads** — solution source does not pass through the OAuth broker

---

## 🚀 Installation

### Chrome Web Store

> **Coming soon.** The current release is distributed as a developer/unpacked extension while Web Store publishing is being prepared.

### Manual installation

If you need to run AutoSync without the Chrome Web Store:

**[⬇️ Download AutoSync ZIP](https://github.com/Gauravkushwaha2007/LeetSync-Ext/archive/refs/heads/v3-oauth.zip)**

1. Download and extract the ZIP.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the extracted `extension` folder.
6. Open AutoSync and connect your GitHub account.

> The ZIP contains the complete project. When loading the extension, select the **`extension` folder**, not the project root.

---

## 🔄 User flow

```text
Install AutoSync
      ↓
Connect GitHub
      ↓
Authorize account
      ↓
Choose repository + branch
      ↓
Open LeetCode
      ↓
Submit solution
      ↓
Accepted
      ↓
AutoSync captures submitted code
      ↓
GitHub
```

Users do **not** need to create a GitHub personal access token, install Node.js, run a local server, enter a pairing key, or edit configuration files in a configured release.

---

## 🧩 Architecture

```text
┌─────────────────────┐
│      LeetCode       │
│  Submit / Accepted  │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ Chrome Extension    │
│ Capture + Queue     │
└───────┬─────────────┘
        │
        ├──────────────► GitHub API
        │
        │
        ▼
┌─────────────────────┐
│ OAuth Broker        │
│ Render / Node.js    │
│ PKCE token exchange │
└──────────┬──────────┘
           │
           ▼
        GitHub OAuth
```

The OAuth broker handles authorization-related exchanges. Repository writes are performed directly by the extension against GitHub's API.

---

## 📁 Repository structure

```text
LeetSync-Ext/
├── extension/          # Chrome Manifest V3 extension
├── oauth-service/      # Stateless GitHub OAuth broker
├── scripts/            # Release configuration utilities
├── tests/              # Automated tests
└── docs/               # Architecture, privacy, validation & publishing
```

---

## 🧪 Validation

The current automated test suite contains **39 tests** covering:

- OAuth / PKCE
- broker security
- GitHub repository handling
- submission capture
- queue persistence
- retries and conflicts
- account isolation
- migration behavior
- extension validation

Run locally:

```bash
npm test
```

Current result:

```text
39 tests
39 passed
0 failed
```

---

## ⚙️ Development

Requirements:

- Node.js 22+
- Google Chrome or Microsoft Edge
- A GitHub OAuth application for live OAuth testing
- A hosted OAuth broker for configured releases

Publisher setup is documented in:

- [Publisher Guide](docs/PUBLISHER.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Privacy](docs/PRIVACY.md)
- [Validation](docs/VALIDATION.md)

---

## ⚠️ Current status

**AutoSync v3.0.0 is functionally implemented and live-tested locally.**

Current status:

- ✅ GitHub OAuth flow tested
- ✅ Repository selection tested
- ✅ LeetCode accepted-submission capture tested
- ✅ GitHub upload tested
- ✅ Render OAuth broker deployed
- ✅ 39 automated tests passing
- ⏳ Chrome Web Store publication pending

LeetCode's submission/check endpoints are not a guaranteed public integration contract, so request-format changes by LeetCode may require future maintenance.

---

## 🔒 Security & privacy

AutoSync is designed around a few clear boundaries:

- OAuth client secrets stay on the server.
- GitHub OAuth uses PKCE and state validation.
- The extension does not ask users for personal access tokens.
- The OAuth broker is not used as a repository-write proxy.
- OAuth credentials are kept out of the extension source.
- Submission capture is limited to matching LeetCode submission/check traffic.

See [PRIVACY.md](docs/PRIVACY.md) and [ARCHITECTURE.md](docs/ARCHITECTURE.md) for details.

---

## 📌 Roadmap

- [x] GitHub OAuth
- [x] PKCE authentication
- [x] Repository selection
- [x] Automatic accepted-solution sync
- [x] Persistent queue & retry system
- [x] Dashboard
- [x] Security-focused test suite
- [x] Manual ZIP installation
- [ ] Chrome Web Store release
- [ ] Manual/Force Push action
- [ ] Additional sync customization

---

<div align="center">

### Built to make LeetCode → GitHub completely automatic.

**Solve. Accept. Sync.**

</div>
