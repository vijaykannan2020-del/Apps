// Invite text sent with a share (and alone from Settings → Invite family). Pure, tested.
// It never contains the share code: the function doesn't even receive it.
export function firstName(name?: string): string {
  const n = (name ?? '').trim().split(/\s+/)[0] ?? '';
  return n && !/^(me|you|myself)$/i.test(n) ? n : '';
}

/** With a share file: install, open the file, enter the code I tell you. */
export function shareInviteText(senderName: string | undefined, link: string): string {
  const who = firstName(senderName) || 'Someone in your family';
  return `${who} shared immigration documents with you in Immigration Wallet.\n1) Install the app: ${link}\n2) Open this file in the app\n3) Enter the 6-word code I tell you`;
}

/** Without documents: just the app. */
export function appInviteText(senderName: string | undefined, link: string): string {
  const who = firstName(senderName) || 'Someone in your family';
  return `${who} invited you to Immigration Wallet: your family’s US immigration documents and dates on your own phone, private by design.\nInstall the app: ${link}`;
}
