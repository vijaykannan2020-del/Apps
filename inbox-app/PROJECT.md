
- v28: one-column vs side-by-side now worked out from the real list width at launch (iOS sends no signal when the app opens already unfolded).
- v29: scroll bars back at the edge (iOS was adding the Duo strip twice); first chat clear of the front-screen clock strip; folded: right page slides in only after the new screen is on it (no chat flash before Accounts).
- v30: Duo front screen uses iOS's own back button (under the clock); Inbox's extra back arrow removed there (kept on normal iPhones).
- v31: folded: screens other than the one just opened stay blank in the right-hand page (iOS updates it only after it slides in), so no old chat/Accounts flash.
- v32: Duo open: native glass side strip back — 5 tabs (see-through glyphs tinted by iOS) + call/video/info in chats; bottom bar only on one-column screens.
- v33: connection status (dots next to the list title + banner when an app is disconnected/reconnecting/syncing; server watcher pushes "X disconnected"/"X reconnected" alerts via /push/bridges + bridge provisioning API); folded bottom bar supports press-and-slide with a lifted lens; folded opens show the tapped screen immediately (no black frame); Duo strip: chat actions top, tabs bottom; picking a tab from Accounts returns to the list view.
