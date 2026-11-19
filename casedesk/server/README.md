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
| Wages, H-1B, PERM, LCA | Automatic every Sunday. When DOL or USCIS post a new year or quarter, paste the new link into `.env` |
| USCIS chart for EB I-485s | Set `USCIS_EB_CHART` each month from uscis.gov/visabulletininfo |
| Guides, processing times | Edit `data/content/guides.json` / `processing.json`. The app picks them up on next launch |
| Fees | In the app, `src/data/fees.ts`. Recheck against G-1055 when USCIS announces changes |

Notes:
- LCA files are very large. Only add `LCA_URLS` if the server has 4 GB+ RAM.
- `xlsx` is only used to read DOL's own spreadsheets.

## Community Q&A (v2.4)

Questions, answers, upvotes and moderation in `src/forum.mjs`; sign-in token checks in `src/auth.mjs`; word / personal-data filter in `src/filter.mjs`. Data: `data/forum.json` (flushed every 10 s and on shutdown). Only a hash of the Apple/Google user id and session tokens is stored — never emails. Tests: `npm run test:unit`.

| Endpoint | What it does |
|---|---|
| `POST /api/auth/apple` `{identityToken, nonce, authorizationCode?}` | Verifies the Apple token (Apple keys, iss, aud, exp, nonce) → `{token, user}` |
| `POST /api/auth/google` `{idToken}` | Same for Google (needs `GOOGLE_CLIENT_ID`) |
| `POST /api/auth/signout` | Ends this session |
| `GET /api/me` · `POST /api/me {name?, pushToken?, acceptRules?}` · `DELETE /api/me` | Account, display name, answer notifications, rules acceptance, delete account (and everything it posted) |
| `GET /api/forum/posts?sort=new\|top\|unanswered&tags=H-1B,I-129&q=&cursor=&limit=&mine=1` | Feed (reading needs no sign-in) |
| `POST /api/forum/posts` · `GET/DELETE /api/forum/posts/:id` · `POST /api/forum/posts/:id/edit` | Ask, read, delete, edit |
| `POST /api/forum/posts/:id/answers` · `POST /api/forum/answers/:id/edit` · `DELETE /api/forum/answers/:id` | Answers (the asker gets a push) |
| `POST /api/forum/posts/:id/vote` · `POST /api/forum/answers/:id/vote` `{up}` · `POST /api/forum/posts/:id/accept {answerId}` | Upvotes, accepted answer |
| `POST /api/forum/report {kind, id, reason, note}` · `GET/POST/DELETE /api/forum/blocks {userId}` · `POST /api/forum/contact {message}` | Report, block, contact moderators |
| `GET /api/forum/rules` · `GET /api/forum/tags` · `GET /support` | Rules, tags, support page (App Store Support URL) |
| `GET /api/admin/forum/reports?status=open\|all` · `GET /api/admin/forum/messages` · `POST /api/admin/forum/hide\|restore\|delete {kind, id}` · `POST /api/admin/forum/ban {userId, banned}` | Moderation, header `Authorization: Bearer $ADMIN_TOKEN` |

Rules enforced on the server: sign-in + accepted rules to write; title 10–150, details 20–5000, answers 10–5000 characters; 1–5 known tags; at most 2 links (none in titles); abuse words, spam phrases, receipt numbers, A-numbers, SSNs, emails and phone numbers refused; 5 questions/hour, 15/day, 20 answers/hour; content reported by 3 people is hidden until reviewed; banned accounts stay banned after deletion.

Moderating from a terminal:
```
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://casedeskapp.duckdns.org/api/admin/forum/reports | jq
curl -s -XPOST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"kind":"post","id":"p_..."}' https://casedeskapp.duckdns.org/api/admin/forum/hide
curl -s -XPOST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"userId":"u_..."}' https://casedeskapp.duckdns.org/api/admin/forum/ban
```
