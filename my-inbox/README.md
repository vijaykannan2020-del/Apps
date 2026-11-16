# My Inbox — your own Beeper

One web app on your phone for WhatsApp, Instagram and Messenger. You can read and reply to all of them from one page.

```
iPhone (web app) ──HTTPS──> Caddy ──> Synapse (private Matrix server) <──> mautrix bridges ──> WhatsApp / Instagram / Messenger
```

Beeper uses this same setup. The difference is that everything here runs on **your** server.

## What you need
1. **A VPS**, for example Hetzner CX22 (~€4.5/mo) or a DigitalOcean $6 droplet, running Ubuntu 24.04 with 2 GB RAM or more.
2. **A domain or subdomain** with an `A` record pointing at the VPS IP, e.g. `inbox.yourname.com`.
   A free option is a DuckDNS subdomain (`yourname.duckdns.org`).

## Easiest install: no commands (works from an iPhone)
When creating the server on DigitalOcean, open **Advanced options → Add initialization scripts** and paste the script below with your own details filled in. The server installs and configures itself on first boot (about 10–15 minutes). Progress log: `/var/log/my-inbox-setup.log`.

```bash
#!/bin/bash
export INBOX_DOMAIN='yourname.duckdns.org'
export DUCKDNS_TOKEN='paste-your-duckdns-token'
export INBOX_USER='vijay'
export INBOX_PASS='choose-a-strong-password'
mkdir -p /opt && cd /opt
curl -fsSL https://github.com/vijaykannan2020-del/Apps/archive/refs/heads/main.tar.gz | tar xz --strip-components=1 Apps-main/my-inbox
cd my-inbox && ./setup.sh > /var/log/my-inbox-setup.log 2>&1
```

## Manual install (about 10 minutes)
```bash
# on your computer: copy the folder to the server
scp -r my-inbox root@YOUR_SERVER_IP:/opt/

# on the server
ssh root@YOUR_SERVER_IP
cd /opt/my-inbox
chmod +x setup.sh
./setup.sh
```
The script asks three questions: your domain, a username and a password. After that it installs Docker, writes all the configs and secrets, starts everything and creates your account.

## Connect your accounts
1. Open `https://your-domain` in Safari and log in.
2. Tap **Share → Add to Home Screen**. It now opens like a normal app.
3. Tap the 🔗 icon (top right) and pick a network to open its setup chat.
   - **WhatsApp**: tap `login`, choose QR, then in WhatsApp go to Settings → Linked devices → Link a device and scan the code.
   - **Instagram / Messenger**: tap `login` and follow the steps. The bridge asks you to paste cookies from a computer browser where you're logged in to instagram.com or messenger.com. Use DevTools → Application → Cookies, or the bridge's own instructions.
4. **Notifications:** in the same 🔗 screen, tap **Notifications** and allow. On iPhone this only works from the Home Screen app (iOS 16.4+), not a Safari tab. You get lock-screen alerts like "Sangeetha · WhatsApp", an unread badge on the icon, and tapping one opens that chat.
5. Your chats start showing up in the inbox. Each one has a WhatsApp, Instagram or Messenger badge.

## Everyday use
- Use the tabs to filter All / WhatsApp / Instagram / Messenger. Unread counts show on each tab.
- Send text, photos, videos and files. You can play voice notes, and reactions and edits show up.
- Opening a chat marks it read on the real app too.
- Messages you send from your phone's own apps also appear here, shown as you.

## Maintenance
```bash
cd /opt/my-inbox
docker compose logs -f whatsapp instagram messenger   # see what the bridges are doing
./update.sh                                           # get the latest My Inbox code (keeps your data)
docker compose pull && docker compose up -d           # update server parts now (also automatic every Sunday 4am)
tar czf backup.tgz data .env                          # backup
```

## Good to know
- **Ban risk:** the bridges use unofficial protocols. WhatsApp is generally stable. Meta sometimes asks Instagram and Messenger accounts to re-verify, or signs them out. Avoid sending large volumes or automated messages.
- **WhatsApp:** your phone needs to come online at least once every ~14 days, or the linked device gets dropped.
- **Privacy:** messages are stored on your VPS in readable form (end-to-end encryption between bridge and app is turned off to keep the app simple). The server is private, has no federation and allows no sign-ups.
- **Notification privacy:** message previews go through Apple's/Google's push service encrypted end-to-end (Web Push encryption), so they can't read them.
- **Muting a chat:** not in the app yet; for now mute it in the original app (WhatsApp mutes carry over).

### Already installed before notifications were added?
```bash
cd /opt/my-inbox   # after copying the new files over
echo "ip_range_whitelist: ['172.16.0.0/12', '10.0.0.0/8', '192.168.0.0/16']" >> data/synapse/homeserver.yaml
mkdir -p data/pushgw
docker compose up -d --build && docker compose restart synapse
```
