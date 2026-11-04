<p align="center">
  <img src="client/public/redro-mark.svg" alt="Redro logo" width="120" />
</p>

<h1 align="center">Aleppo Center Cash</h1>

<p align="center">
  <strong>A Redro Company Product</strong><br>
  Developed and originally created by <strong>Mhamed Shasho</strong> · Published and maintained under <strong>Redro</strong>
</p>

<p align="center">
  <a href="https://aleppo-center-cash.vercel.app/">Open Web App</a> •
  <a href="https://github.com/mhamedshasho/aleppo-center-cash/releases">Downloads</a> •
  <a href="https://github.com/mhamedshasho/aleppo-center-cash/actions">Builds</a>
</p>

---

## Redro family

**Aleppo Center Cash is now officially part of the Redro product family.**

- **Parent company / publisher:** Redro
- **Product:** Aleppo Center Cash
- **Founder and original developer:** Mhamed Shasho
- **Product identity:** The application remains Aleppo Center Cash. Redro is the parent brand responsible for its publication and ongoing development.
- **Official Redro mark:** `client/public/redro-mark.svg`

This is a brand and company affiliation update. It does not change the accounting product's purpose, customer data model, or the way users work inside their workspaces.

## Product

Arabic RTL cloud accounting for Aleppo Center: accounts, payments, SYP / USD balances, workspaces, and cloud synchronization.

- **Web app:** https://aleppo-center-cash.vercel.app/
- **GitHub repository:** https://github.com/mhamedshasho/aleppo-center-cash
- **Releases:** https://github.com/mhamedshasho/aleppo-center-cash/releases

## Downloads

- **Android APK:** [Download APK](https://github.com/mhamedshasho/aleppo-center-cash/releases/download/v1.0.160/app-release.apk)
- **Windows Installer:** [Download latest Windows Installer](https://github.com/mhamedshasho/aleppo-center-cash/releases?q=desktop)
- **Windows Portable:** [Download latest Windows Portable](https://github.com/mhamedshasho/aleppo-center-cash/releases?q=portable)
- **All releases:** [Open GitHub Releases](https://github.com/mhamedshasho/aleppo-center-cash/releases)

> Windows builds are x64. The Installer installs the full Electron desktop application. The Portable build is intended to run without installation.

## Features

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
- Light, Dark, Gold, Red Nostalgia and Yellow & Black themes
- Workspace-shared theme settings across PC/mobile devices
- Server-saved invoice logo with Settings or Device logo choice in Invoice Maker
- Invoice PDFs automatically follow the selected theme
- Android APK and Windows desktop builds

## Accounting model

| Entry | Meaning |
|---|---|
| **له** | The shop owes the customer |
| **عليه** | The customer owes the shop |

SYP and USD are calculated independently and are never silently mixed.

## Architecture

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

## Security

- Supabase publishable key is used by the client.
- Database access is protected by RLS.
- Workspace membership is required.
- Sensitive server operations run through Edge Functions.
- Restoration exports can be encrypted locally with AES-GCM.

This project is **not** described as zero-knowledge or end-to-end encrypted.

Never commit secrets, database passwords, service-role keys, access tokens, or production accounting exports.

## Development

Requirements: Node.js, pnpm 10.x, and a Supabase project.

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

## Related Redro projects

- [Redro To-Do](https://github.com/mhamedshasho/redro-to-list)

## Documentation

- [Code Documentation — Arabic + English](docs/CODE-DOCUMENTATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Setup](docs/SETUP.md)
- [Deployment](docs/DEPLOY.md)
- [Multi-user architecture](docs/multi-user-simplified-architecture.md)
- [Release Notes](docs/RELEASE-NOTES.md)

---

<p align="center">
  <strong>Aleppo Center Cash</strong><br>
  A Redro Company Product · Created by Mhamed Shasho · Syria
</p>
