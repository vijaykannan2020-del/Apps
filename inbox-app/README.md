# Inbox — iPhone app (Expo)

The native version of My Inbox. Talks to the same server as the web app (`../my-inbox`), so chats, logins and settings are shared.

- **Stack:** Expo SDK 58, Expo Router (`src/app`), expo-image (authenticated media), expo-blur (glass header/dock), expo-secure-store (login in Keychain).
- **Server code:** `src/lib/matrix.ts` (ported from `../my-inbox/web/index.html`).
- **Try it without an Apple Developer account:** every push to `inbox-app/` runs `.github/workflows/inbox-app.yml`, which publishes an EAS Update. Open it in the free **Expo Go** app.
- **Later (needs the $99 Apple account):** `eas build --profile preview` → TestFlight, then add calls (WebRTC + CallKit) and native push.

## Phases
1. ✅ Login, chat list (All/WhatsApp/Instagram/Messenger, Unread/Groups, archive, pin), chat (bubbles, photos, reactions, reply, copy, send text/photo), accounts.
2. Voice notes, video playback, forward, search inside messages, schedule send, reminders (parity with web Inbox).
2b. ✅ Build 3: instant open (chat list cached on the phone), photo viewer with zoom + Share + Save to Photos, multi-photo send + camera, @mentions in groups, setup-chat option buttons, in-app banner for new messages, Auto/Light/Dark theme, change password, Google Drive backup screen, reels open in Instagram.
3. Real app (TestFlight): notifications, voice/video calls with lock-screen ringing, wife's private chat.
