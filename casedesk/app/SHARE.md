# Share with family (v2.9)

Give your spouse (or any family member) the same documents on their own phone, without our server.

## How it works

**Sender**
1. Person page or Family tab → **Share with family**.
2. Choose people, untick any documents you don't want to send, choose **Include scans** (images and PDFs) on or off, and how long the code works (1, 7 or 30 days; default 7).
3. **Create secure file**. The phone builds an encrypted file, `Immigration Wallet share YYYY-MM-DD.iwshare`, and opens the iOS share sheet (AirDrop, Messages, WhatsApp, Mail, Files).
4. A **6-word code** is shown on screen. Tell it to the other person on a call or in person. It is shown once and never saved.

**Recipient**
1. Tap the file and open it in Immigration Wallet, or go to **Settings → Import shared documents** (also on Welcome) and choose the file.
2. Type the 6 words. Capitals, spaces and numbers don't matter, and the first 4 letters of each word are enough.
3. Check what's inside, answer **Which one is you?** (filled in automatically when the app recognises your own profile), then **Add to this phone**.
4. The app shows exactly what was added, updated and kept.

For updates later, the sender sends a new file and the recipient imports it the same way. Documents are merged, never duplicated.

## Security design in plain words

- **Same lock as the password backup.** The file uses the same format and code as `.casedesk` backups (`src/core/backup.ts`). A key is made from the code with **scrypt** (a slow, memory-hard function: N=2^13, r=8, p=1, random 16-byte salt). Then **AES-256-GCM** encrypts and authenticates the contents, with a random 12-byte nonce. It's pure JavaScript (@noble), so no native code is needed.
- **The code is the only secret.** It's 6 words picked at random by the phone's secure random generator from a list of 1,981 words (the BIP-39 English list minus some words that read badly), which is about **65 bits**. The code is never put into the file, the file name, the message or app storage. It exists only on the sender's screen.
- **Nothing readable is outside the encryption.** Names, numbers, document details and scans are all inside. Outside there are only the format line, the crypto settings and two dates (created and expires). The file name has a date and nothing else.
- **No silent changes.** The header line (including the expiry date) is authenticated together with the contents. If anyone changes a single character anywhere, the file won't open. A wrong code and a tampered file give the same message.
- **Expiry.** The expiry date is in the authenticated header and repeated inside the encrypted contents. The app won't import a file after that date.
- **Crafted files.** The app checks the crypto settings before doing any work, so a file can't make the phone run out of memory. It checks the decrypted contents (people, documents, owners, file types) before anything is saved. Scan file names are cleaned before they're written.
- **Links.** Only local `file://` URLs ending in `.iwshare` are opened. A link such as `casedesk://share-import?file=https://…` never makes the app download anything.
- **Wrong guesses.** After 5 wrong codes the import screen makes you wait, and the wait doubles each time. Brute force on a copied file is what the 65-bit code and scrypt protect against.
- **No server.** The app sends nothing. The file goes only where the sender sends it.
- **Clean up.** The sender's copy in the app cache is deleted when the share screen closes and before the next share. After a successful import, the recipient's incoming copy (Documents/Inbox or the picker's cache copy) is deleted.

## Merge rules (recipient's phone)

- **People** are matched like a backup merge (`core/merge.ts`): same id with the same name or passport, then passport number, then legal name plus date of birth, then name. The person chosen under *Which one is you?* is joined to this phone's own profile. Matched people are not changed.
- **New people** get relations as seen by the recipient. When the recipient is the sender's spouse, the sender becomes *Spouse* and the children stay *Child*. Anyone else becomes *Family*. "Dependent of" links are carried over.
- **Documents** are matched first by id (only for the same person or the same document number). Next comes the document number or dates for its type (passport number, receipt number, I-94 entry date and class, and so on). Last comes identical details for the same person.
- **Newer document wins.** "Newer" means the latest edit time (`updatedAt`, now set whenever a document is edited), or else the time it was added. If the incoming copy is newer, it replaces the details, keeping the recipient's id and person. Its scans replace the old ones only if the file has scans. If the copy on this phone is the same age or newer, it's kept. If it has no scan and the file does, the scan is added.
- **Nothing is deleted.** People and documents that aren't in the file stay as they are. Settings, reminders, cases and iCloud backup on the recipient's phone are not touched. Reminder settings are not sent.

## Threat model

| Who / what | Protected? |
|---|---|
| Someone who gets the file (lost message, forwarded chat, cloud copy, AirDrop to the wrong phone) but not the code | Yes. They can't read or change it, and can't learn names from the file name. |
| Messaging app or cloud provider storing the file | Yes, same as above. |
| Someone changing the file on the way (contents or expiry date) | Yes. It won't open. |
| An old file found later | Refused after the expiry date. Brute force before then is impractical (65 bits + scrypt). |
| Someone who has **both** the file and the code (for example, both sent in the same chat) | **No.** That's why the code is said aloud and not sent with the file. |
| Someone who can unlock the sender's or recipient's phone | No. The data is on those phones by design. Use Face ID lock (Settings). |
| A recipient who shares onward | No. Once imported, the documents are theirs. |
| Our server | Nothing to protect: it never sees the file or the code. |

## Limits

- **Opening the file straight from Messages, AirDrop or Files needs a new iOS build** (the `.iwshare` file type is registered in `app.json`: `CFBundleDocumentTypes`, `UTExportedTypeDeclarations`, `LSSupportsOpeningDocumentsInPlace=false`). On the current TestFlight build, save the file to Files and use **Settings → Import shared documents**, which works on every build because it uses the document picker that's already in the app. Android doesn't register the file type yet, so it uses the picker too.
- **Expiry uses the recipient's clock.** Someone who sets their phone's date back can open a file after its expiry date (they still need the code).
- **No take-back.** A file that's been sent can't be cancelled. Short expiry plus keeping the code private is the control.
- **A one-way copy, not live sync.** Edits on either phone stay on that phone until a new file is sent. Removing a document on the sender's phone doesn't remove it from the recipient's.
- **Size.** Scans are inside the file as base64, so a large family with many PDFs can make a file of tens of MB. Turn **Include scans** off to send details only.
- **scrypt cost** is tuned for phones running JavaScript (2–4 s on a recent iPhone), the same as backups. The cost is stored in each file, so it can be raised later without breaking older files.
- Cases (USCIS receipts tracked by hand) are not shared in this version. Receipts that are documents are shared.

## Files

- `src/core/share.ts`: codes, package format, checks, merge plan (pure, tested)
- `src/core/sharewords.ts`: word list (BIP-39 English, MIT)
- `src/core/backup.ts`: shared `sealText` / `openSealed` (same format as backups)
- `src/data/shareIO.ts`: build, share sheet, pick or open a file, import
- `src/screens/share.tsx`: entry rows and both screens. `app/share.tsx`, `app/share-import.tsx`, `app/+native-intent.tsx`: routes
- `tests/share.test.ts`: round trip, wrong code, tampered file, expiry, payload checks, merge rules, links
