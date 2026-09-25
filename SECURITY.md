# Security Policy

## Reporting a vulnerability

Do not publish credentials, production data, access tokens, or exploitable details in a public issue.

For a security-sensitive report, contact the project owner privately through the repository's configured GitHub contact method.

## Secrets

Never commit:

- Supabase service-role keys
- Supabase secret keys
- database passwords
- Dropbox tokens
- production environment files
- accounting restoration files containing sensitive data

Client-side `VITE_` variables must be treated as public configuration.

## Data protection

The hosted application uses authenticated Supabase access and Row Level Security. Portable restoration files can be encrypted with AES-GCM.

The application is not E2EE and must not be marketed as E2EE or zero-knowledge.

## Production safety

Database migrations and restore operations should be reviewed before execution. Never reset or truncate production accounting tables as a troubleshooting shortcut.
