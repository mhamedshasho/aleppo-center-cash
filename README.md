# Aleppo Center Cash

<p align="center">
  <strong>Arabic RTL cloud accounting for Aleppo Center</strong><br>
  Accounts • Payments • SYP / USD • Workspaces • Cloud Sync
</p>

<p align="center">
  <a href="https://aleppo-center-cash.vercel.app/">Open Web App</a> •
  <a href="https://github.com/mhamedshasho/aleppo-center-cash/actions/workflows/android-apk.yml">Android Builds</a> •
  <a href="https://github.com/mhamedshasho/aleppo-center-cash/actions">All Actions</a>
</p>

---

## 🚀 Use the app

**Web:** https://aleppo-center-cash.vercel.app/

**Android APK builds:**  
https://github.com/mhamedshasho/aleppo-center-cash/actions/workflows/android-apk.yml

Android builds are generated automatically with GitHub Actions.

### 📥 Download the APK

1. Open **Android Builds** above.
2. Choose the latest run with a green **Success** mark.
3. Scroll to **Artifacts**.
4. Download **aleppo-center-cash-debug-apk**.
5. Extract the downloaded ZIP.
6. The APK will be inside the extracted folder.

> The GitHub Actions artifact is a ZIP containing the APK. Extract it before installing.

### 📱 Install on Android

1. Download and extract the latest successful build.
2. Open **app-debug.apk**.
3. If Android asks for permission to install apps from this source, allow it for the browser or file manager you used.
4. Install the app.
5. Open Aleppo Center Cash and sign in.

> These builds are debug APKs intended for testing and deployment validation. Android may display a warning because the APK is not a Play Store release.

---

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
- Android APK build pipeline

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

GitHub Actions also runs automated validation and Android APK builds.

## 📦 Build page

**All Android builds:**  
https://github.com/mhamedshasho/aleppo-center-cash/actions/workflows/android-apk.yml

**All GitHub Actions:**  
https://github.com/mhamedshasho/aleppo-center-cash/actions

---

<p align="center">
  <strong>Aleppo Center Cash</strong><br>
  Built for practical cloud accounting.
</p>