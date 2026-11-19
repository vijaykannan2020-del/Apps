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
| `GET /api/wallet/status` · `POST /api/wallet/pass` · `GET /api/wallet/csr` | Apple Wallet status card (v2.5, `src/wallet.mjs`): signs a `.pkpass` in memory from the card fields and returns it — stores nothing. 503 until the Pass Type ID certificate is in place; the CSR is offered only until then. 10 cards/hour per IP. See `app/WALLET.md` |
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

## Community (v2.7, Reddit-style)

Posts (question, discussion, timeline share, poll, repost), threaded comments (4 levels), up / down votes, feeds, saved posts, profiles, notifications and moderation in `src/forum.mjs`; sign-in token checks in `src/auth.mjs`; word / personal-data filter in `src/filter.mjs`. Data: `data/forum.json` (flushed every 10 s and on shutdown). Only a hash of the Apple/Google user id and session tokens is stored — never emails. Tests: `npm run test:unit`.

**Migration:** a v2.4 `forum.json` (questions + flat answers) is converted when it is loaded: answers become top-level comments with the same ids, votes, accepted answer and reports. The v2.4 endpoints (`/answers`, `{up: true}` votes, `answers` in the post reply) keep working for phones that have not updated yet.

| Endpoint | What it does |
|---|---|
| `POST /api/auth/apple` `{identityToken, nonce, authorizationCode?}` | Verifies the Apple token (Apple keys, iss, aud, exp, nonce) → `{token, user}` |
| `POST /api/auth/google` `{idToken}` | Same for Google. Needs `GOOGLE_CLIENT_ID` in `.env` **or in `deploy.conf`** (public file; a client id is not a secret). The token's `aud` must be that id |
| `POST /api/auth/signout` | Ends this session |
| `GET /api/me` · `POST /api/me {name?, avatar?, flair?, pushToken?, acceptRules?}` · `DELETE /api/me` | Account (with karma, counts, unread), display name, built-in avatar (24 ids, no uploads), visa flair, push, rules, delete account |
| `GET /api/forum/posts?sort=hot\|new\|top\|unanswered&t=day\|week\|month&tags=&q=&type=&author=&cursor=&limit=&mine=1&saved=1` | Feed (reading needs no sign-in). Hot = votes on a log scale + recency |
| `POST /api/forum/posts {type, title, body, tags, poll?: {options}, timeline?: {form, office, premium, steps: [{label, date}]}, repostOf?}` · `GET/DELETE /api/forum/posts/:id` · `POST …/edit` | Create, read (`{post, comments}` — flat list with `parentId` and `depth`), delete, edit |
| `POST /api/forum/posts/:id/comments {body, parentId?}` · `POST /api/forum/comments/:id/edit` · `DELETE /api/forum/comments/:id` | Comments and replies (the person replied to is notified) |
| `POST /api/forum/posts/:id/vote` · `POST /api/forum/comments/:id/vote` `{dir: 1\|-1\|0}` · `POST /api/forum/posts/:id/accept {commentId}` | Votes; accepted answer (questions, top-level comments) |
| `POST /api/forum/posts/:id/poll {option}` · `POST /api/forum/posts/:id/save {on}` | Poll vote (one per person, can be moved); save / unsave |
| `GET /api/forum/users/:id` | Public profile: name, avatar, flair, join date, karma, counts, their posts and comments |
| `GET /api/forum/notifications` · `POST /api/forum/notifications/read` | Replies to you and upvote milestones (also pushed when a token is set) |
| `POST /api/forum/report {kind: post\|comment\|user, id, reason, note}` · `GET/POST/DELETE /api/forum/blocks {userId}` · `POST /api/forum/contact {message}` | Report, block, contact moderators |
| `GET /api/forum/rules` · `GET /api/forum/tags` · `GET /api/forum/meta` · `GET /support` | Rules, tags, lists (avatars, flairs, offices, steps), support page |
| `GET /api/admin/forum/reports?status=open\|all` · `GET /api/admin/forum/messages` · `POST /api/admin/forum/hide\|restore\|delete {kind: post\|comment, id}` · `POST /api/admin/forum/ban {userId, banned}` | Moderation of posts, comments and reported profiles, header `Authorization: Bearer $ADMIN_TOKEN` |

Rules enforced on the server: sign-in + accepted rules to write; title 10–150, details 20–5000 (optional for timelines, polls and reposts), comments 2–5000 characters; 1–5 known tags; poll options 2–4 (filtered like titles); timeline fields only from fixed lists and real dates (no free text); at most 2 links (none in titles); abuse words, spam phrases, receipt numbers, A-numbers, SSNs, emails and phone numbers refused in every text; 5 posts/hour, 15/day, 30 comments/hour, 100/day; no voting on your own content; content reported by 3 people is hidden until reviewed (a hidden or blocked comment hides its replies too); banned accounts stay banned after deletion.

Deleting: a comment with replies, or a post other people commented on, becomes a `[deleted]` stub (author and text removed) so the thread stays readable; without replies it is removed. **Delete account** removes the person, their votes, poll votes, saves, notifications and sessions and applies the same rule to everything they wrote. Admin delete leaves `[removed by moderators]` where replies exist.

Moderating from a terminal:
```
curl -s -H "Authorization: Bearer $ADMIN_TOKEN" https://casedeskapp.duckdns.org/api/admin/forum/reports | jq
curl -s -XPOST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"kind":"comment","id":"c_..."}' https://casedeskapp.duckdns.org/api/admin/forum/hide
curl -s -XPOST -H "Authorization: Bearer $ADMIN_TOKEN" -d '{"userId":"u_..."}' https://casedeskapp.duckdns.org/api/admin/forum/ban
```
