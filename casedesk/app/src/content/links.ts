// Install links (invite text, Settings → Invite family, casedesk/site/get.html). Keep the same value in
// casedesk/site/links.js (tests/invite.test.ts checks they match). The invite is built for the public
// App Store launch: the App Store page goes live on the app id when Apple releases the app.
export const APP_STORE_URL = 'https://apps.apple.com/app/id6836097003';
/** The page every invite links to: install button and the 3 steps (works on any phone). Served by
 *  GitHub Pages from casedesk/site, so it needs no server change. */
export const INVITE_URL = 'https://vijaykannan2020-del.github.io/Apps/casedesk/site/get.html';
