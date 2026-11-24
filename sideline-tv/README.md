# Sideline TV (iPhone app)

Watches your MAC-based IPTV (MAG / Stalker portal) straight from your iPhone, the way the box app on your Firestick does: Live TV, Movies, VLC player.

- Your portal URL, MAC and box details are saved only on the phone. Nothing is stored in this repo or on a server.
- One-tap setup: in Sideline (Safari) → Live TV → Your IPTV → **Open in Sideline TV**.
- Build: change `ios-build.txt` (or run the "Sideline TV iPhone build" workflow). It builds on GitHub's Mac and sends to TestFlight once the repo variable `SIDELINETV_ASC_APP_ID` is set.
