# CaseDesk server

Node API for the CaseDesk app, running on your Oracle server. It does three jobs:

- **Fetches official data** (DOL wage files, the USCIS H-1B Data Hub, DOL PERM/LCA disclosures, and the State Department Visa Bulletin) and keeps it fresh automatically.
- **Calls the USCIS Case Status API** with your keys, so the keys never sit inside the app.
- **Builds the news feeds**: official notices from the Federal Register, plus a separate news-and-analysis feed from the web.

The app works without the server: it falls back to its built-in copies and demo case statuses.

| Endpoint | What it does |
|---|---|
| `GET /api/health` | What's connected and loaded |
| `GET /api/case/:receipt` | Live USCIS case status (cached 3 h per receipt) |
| `GET /api/news` | `kind: "official"` = Federal Register (USCIS, DHS, DOL-ETA); `kind: "news"` = web news. Refreshed hourly |
| `GET /api/visa-bulletin` | Current employment-based Visa Bulletin, parsed from travel.state.gov daily |
| `GET /api/wage/states` → `/api/wage/counties?state=TX` → `/api/wage/soc?q=` → `/api/wage?soc=&area=` | Same lookup flow as DOL's FLAG wage search: state → county (mapped to its MSA/area) → occupation → Level I–IV |
| `GET /api/employer?q=hcl america` | H-1B approvals by year (USCIS Data Hub) + PERM certifications + LCAs (DOL) |
| `GET /api/expect?form=I-129&office=EAC&received=2026-08-14&premium=0&cls=L1A` | What to expect for one case: official USCIS form statistics (`data/form-stats.json`), I-129 RFE/approval rates by class, processing-time range, premium clock, and anonymous community timelines (only when 10+ similar cases are decided). No receipt numbers |
| `GET /api/processing-times` | Serves `data/content/processing.json` if you publish one (otherwise the app uses its built-in copy) |
| `GET /api/content/guides` | Serves `data/content/guides.json`, so guides can be updated without an app release |

## Set up on the Oracle server (Ubuntu). Do one step at a time

1. **Install Node 22, Caddy and unzip**
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - && sudo apt-get install -y nodejs unzip
   sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
   curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
   sudo apt update && sudo apt install -y caddy
   ```
2. **Copy this folder** to `/home/ubuntu/casedesk-server`, then run `npm install`.
3. **Create `.env`** with `cp .env.example .env && nano .env`. Paste in:
   - the current download links. Open each official page named in the file and copy the link.
   - your USCIS keys (see step 7).
4. **Load the data** with `npm run update-data`. It downloads the files, unzips the wage file and builds `data/wages.json` and `data/employers.json`.
5. **Run the API as a service, with weekly data refresh**
   ```bash
   sudo cp deploy/casedesk.service deploy/casedesk-data.service deploy/casedesk-data.timer /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now casedesk casedesk-data.timer
   ```
6. **Turn on HTTPS**
   - Point a domain at the server's IP.
   - Put the domain into `deploy/Caddyfile`, then run `sudo cp deploy/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy`.
   - Open ports 80 and 443 in the Oracle VCN security list, and on the server:
     `sudo iptables -I INPUT -p tcp --dport 80 -j ACCEPT && sudo iptables -I INPUT -p tcp --dport 443 -j ACCEPT && sudo netfilter-persistent save`
7. **Get USCIS Case Status API keys**
   - Sign up at <https://developer.uscis.gov> and create an app for **Case Status API – Sandbox**.
   - Put the client ID and secret into `.env` and test.
   - Then request **Production access**. USCIS gives you the production URLs to put in `.env`.
8. **Connect the app**: in the app's `app.json`, set `"extra": { "apiBase": "https://your-domain" }`.

Check that it's working with `curl https://your-domain/api/health`.

## Keeping it fresh

| Data | How it updates |
|---|---|
| News, Visa Bulletin | Automatic: news hourly, Visa Bulletin daily |
| USCIS form statistics (quarterly all-forms report, I-129 RFE data) | Automatic every Sunday: links found on uscis.gov's data page, or the predictable file names for the last 8 quarters. Override with `FORM_STATS_URLS` |
| Wages, H-1B, PERM, LCA | Automatic every Sunday. When DOL or USCIS post a new year or quarter, paste the new link into `.env` |
| USCIS chart for EB I-485s | Set `USCIS_EB_CHART` each month from uscis.gov/visabulletininfo |
| Guides, processing times | Edit `data/content/guides.json` / `processing.json`. The app picks them up on next launch |
| Fees | In the app, `src/data/fees.ts`. Recheck against G-1055 when USCIS announces changes |

Notes:
- LCA files are very large. Only add `LCA_URLS` if the server has 4 GB+ RAM.
- `xlsx` is only used to read DOL's own spreadsheets.
