# CaseDesk — Tracker for USCIS

An independent iPhone and Android app (Expo) for US immigration: USCIS case status, my own status checks and documents (stored on the phone only), Visa Bulletin, processing times, prevailing wage, fees, I-9, and employer H-1B / PERM / LCA search. It is not affiliated with USCIS or any government agency.

| Folder | What it is |
|---|---|
| `app/` | Expo SDK 58 app (expo-router, TypeScript). See `app/HANDOFF.md` |
| `server/` | Node API (Docker), running on the Oracle server next to My Inbox. See `server/README.md` |

## How the server is deployed (same idea as My Inbox)
- My Inbox's `auto-update.sh` installs `casedesk/server` into `/opt/casedesk` once. After that CaseDesk updates itself: every minute it checks GitHub `main`, and when `casedesk/server` changes it re-runs `setup.sh`.
- HTTPS goes through My Inbox's Caddy. `setup.sh` writes `CASEDESK_SITE=<domain>` into My Inbox's `.env` and restarts its Caddy. The API container joins My Inbox's Docker network as `casedesk-api`.
- Public settings live in `server/deploy.conf` (domain, Visa Bulletin chart, LCA on/off). Change them in GitHub and they apply within a minute.
- Secrets (USCIS API keys, optional Anthropic key) live only in `/opt/casedesk/.env` on the server. They are never in GitHub.
- Official data (DOL wages, USCIS H-1B Data Hub, DOL PERM) downloads automatically after install and every Sunday at 03:00. The download links are found on the official pages.
- Logs: `/var/log/casedesk-install.log`, `casedesk-update.log`, `casedesk-data.log`. Health check: `https://<domain>/api/health`.
