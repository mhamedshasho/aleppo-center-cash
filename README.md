# Aleppo Center Cash

<p align="center">
  <strong>Arabic RTL cloud accounting for Aleppo Center</strong><br>
  Accounts • Payments • SYP / USD • Workspaces • Cloud Sync
</p>

<p align="center">
  <a href="https://aleppo-center-cash.vercel.app/">Web App</a> •
  <a href="https://github.com/mhamedshasho/aleppo-center-cash/releases">Releases</a> •
  <a href="https://github.com/mhamedshasho/aleppo-center-cash/actions">GitHub Actions</a>
</p>

---

## 📥 Downloads

Use the **Releases** page for the packaged versions:

- **Android APK:** [Download / view APK releases](https://github.com/mhamedshasho/aleppo-center-cash/releases)
- **Windows Installer (EXE):** [Download Windows installer](https://github.com/mhamedshasho/aleppo-center-cash/releases)
- **Windows Portable EXE:** [Download Portable EXE](https://github.com/mhamedshasho/aleppo-center-cash/releases)

### Direct current builds

- **Android APK:** [v1.0.104 — app-release.apk](https://github.com/mhamedshasho/aleppo-center-cash/releases/download/v1.0.104/app-release.apk)
- **Windows Installer:** [v5 — Aleppo Center Cash Setup 1.0.1.exe](https://github.com/mhamedshasho/aleppo-center-cash/releases/download/v5/Aleppo.Center.Cash.Setup.1.0.1.exe)
- **Windows Portable:** [portable-v6 — Aleppo Center Cash 1.0.1.exe](https://github.com/mhamedshasho/aleppo-center-cash/releases/download/portable-v6/Aleppo.Center.Cash.1.0.1.exe)

> The Windows builds are x64. The Portable version does not require installation.

## 🚀 Use the web app

**Web:** https://aleppo-center-cash.vercel.app/

## ✨ Features

- Arabic RTL accounting workflow
- Customer accounts
- **له / عليه** payment tracking
- Separate **SYP / USD** balances
- Dashboard and account summaries
- Account transaction history
- Audit/activity history
- Workspace-based multi-user access
- Supabase Auth + PostgreSQL
- Row Level Security (RLS)
- Realtime synchronization
- Cloud restoration snapshots
- Encrypted AES-GCM JSON restoration files
- PDF / PNG reports
- Responsive desktop and mobile UI
- Light, Dark, Gold and Red Nostalgia themes
- Android APK and Windows desktop builds

## 💰 Accounting model

| Entry | Meaning |
|---|---|
| **له** | The shop owes the customer |
| **عليه** | The customer owes the shop |

SYP and USD are calculated independently and are never silently mixed.

## 🏗️ Architecture

```text
React + TypeScript + Vite
          │
          ▼
      Supabase
   ┌──────┼────────┐
   ▼      ▼        ▼
  Auth  PostgreSQL Realtime
   │      │        │
   └──────┼────────┘
          ▼
    Edge Functions
          │
          ▼
   Private restoration
```

## 🔐 Security

- Supabase publishable key is used by the client.
- Database access is protected by RLS.
- Workspace membership is required.
- Sensitive server operations run through Edge Functions.
- Restoration exports can be encrypted locally with AES-GCM.

This project is **not** described as zero-knowledge or end-to-end encrypted.

Never commit:

- `.env.local`
- database passwords
- `service_role` keys
- `sb_secret_` keys
- access tokens
- production accounting exports

## 🛠️ Development

Requirements:
- Node.js
- pnpm 10.x
- Supabase project

```bash
pnpm install
cp .env.example .env.local
pnpm check
pnpm build
pnpm dev
```

### Windows desktop builds

```bash
pnpm desktop:build
pnpm desktop:portable
```

The desktop build uses a relative asset base so the Electron app can load its Vite assets correctly from the local `file://` page.

## 📚 Documentation

- [Code Documentation — Arabic + English](docs/CODE-DOCUMENTATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Setup](docs/SETUP.md)
- [Deployment](docs/DEPLOY.md)
- [Multi-user architecture](docs/multi-user-simplified-architecture.md)
- [Release Notes](docs/RELEASE-NOTES.md)

## 🧪 Quality

```bash
pnpm check
pnpm build
```

GitHub Actions validates the repository and builds Android/Windows releases.

---

<p align="center">
  <strong>Aleppo Center Cash</strong><br>
  Built for practical cloud accounting.
</p>
