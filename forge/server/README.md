# Forge server

Runs **Claude Code** and **Codex** on Vijay's GitHub repos for the Forge phone app (`forge/index.html`,
live at https://vijaykannan2020-del.github.io/Apps/forge/).

## Where it runs

On the Oracle server next to My Inbox, in `/opt/forge` (Docker, container alias `forge-api`, port 8790 on
My Inbox's Docker network). HTTPS comes from My Inbox's Caddy: `https://vijayinbox.duckdns.org/forge/*`.

Install is automatic: `my-inbox/auto-update.sh` (runs every minute) installs this folder once into
`/opt/forge` and runs `setup.sh`. After that `/etc/cron.d/forge-auto` keeps it updated from `main`, and
`/etc/cron.d/forge-weekly` rebuilds once a week so the newest Claude Code and Codex CLIs are installed.

## Sign-in and secrets

- Sign-in = My Inbox login. Only a Synapse **admin** (the server owner) is allowed.
- GitHub token, Claude key / subscription token, OpenAI key are typed in the app's Settings and kept only in
  `/opt/forge/data/secrets.json` (mode 600). Codex ChatGPT sign-in lives in `/opt/forge/data/codex/auth.json`.
  Nothing secret is in this repository.

## How a session works

1. The app picks a repo + base branch + agent. The server clones it into `data/work/<id>` and creates
   branch `forge/<slug>-<id>`.
2. Each message runs `claude -p … --output-format stream-json` (resumes with `--resume`) or
   `codex exec --json …` (resumes with `codex exec resume <thread>`) inside that folder, as the
   non-root `node` user with permission prompts skipped (the container is the sandbox).
3. Events are saved to `data/sessions/<id>.json`; the app long-polls `GET /sessions/<id>/events?after=<v>`.
   Runs keep going if the phone is closed.
4. The agent never pushes. The app's **Commit & push** / **Create pull request** / **Squash & merge**
   buttons do that with the GitHub token (passed per command as a header, never stored in `.git/config`).

## Project folders and photos

A project can be one app folder inside a repo (e.g. `casedesk/app` in Apps): the session stores `folder` and
the agents run in that folder. Photos sent with a message are saved in the clone under `.forge-uploads/`
(git-ignored) and their paths are given to the agent (Codex also gets them with `-i`).

## API (all under `/forge/api`, Bearer = Matrix access token)

`POST /login` · `GET /me` · `POST /settings` · `POST|GET /codex/login` (ChatGPT device sign-in) ·
`POST /codex/logout` · `GET /repos` · `GET /repos/:owner/:repo/branches|folders` · `GET|POST /sessions` ·
`GET|DELETE /sessions/:id` · `GET /sessions/:id/events?after=` · `POST /sessions/:id/message|stop|commit|pr|merge|rename` ·
`GET /sessions/:id/diff|files|file?path=`

## Useful on the server

```
cd /opt/forge && docker compose logs -f api      # live log
tail -f /var/log/forge-update.log /var/log/forge-install.log
```
