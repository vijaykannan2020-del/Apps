// Example family (O2: look around before adding real data). Made-up people and document numbers;
// dates are relative to today so the checks always show something useful.
import type { Document, Person } from '../core/model';
import { addDays, addYears, today } from '../core/dates';
import { readDocument } from '../core/read';
import type { Store } from './store';

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const dmy = (d: string) => { const [y, m, dd] = d.split('-'); return `${dd}/${m}/${y}`; };
const mdy = (d: string) => { const [y, m, dd] = d.split('-'); return `${m}/${dd}/${y}`; };
const cbp = (d: string) => { const [y, m, dd] = d.split('-').map(Number); return `${y} ${MON[m - 1]} ${String(dd).padStart(2, '0')}`; };

const passport = (no: string, sur: string, giv: string, dob: string, iss: string, exp: string) =>
  `REPUBLIC OF INDIA\nType  Country Code  Passport No.\nP     IND           ${no}\nSurname\n${sur}\nGiven Name(s)\n${giv}\nNationality\nINDIAN\nSex   Date of Birth\nF     ${dmy(dob)}\nDate of Issue    Date of Expiry\n${dmy(iss)}       ${dmy(exp)}`;
const visa = (no: string, sur: string, giv: string, cls: string, iss: string, exp: string) =>
  `UNITED STATES OF AMERICA\nVISA\nControl Number\nSurname\n${sur}\nGiven Name\n${giv}\nPassport Number\n${no}\nVisa Type/Class   Entries   Issue Date    Expiration Date\nR  ${cls}            M         ${mdy(iss)}     ${mdy(exp)}\nAnnotation\nPETITIONER: CONTOSO ANALYTICS INC`;
const i94 = (no: string, sur: string, giv: string, cls: string, entry: string, until: string) =>
  `Most Recent I-94\nAdmission (I-94) Record Number: 987654321A1\nMost Recent Date of Entry: ${cbp(entry)}\nClass of Admission: ${cls}\nAdmit Until Date: ${cbp(until)}\nLast/Surname: ${sur}\nFirst (Given) Name: ${giv}\nDocument Number: ${no}`;
const approval = (rn: string, sur: string, giv: string, notice: string, from: string, to: string) =>
  `I-797A | NOTICE OF ACTION\nReceipt Number               Case Type\n${rn}                I129 - PETITION FOR A NONIMMIGRANT WORKER\nReceived Date   Priority Date   Petitioner\n${mdy(addDays(notice, -60))}                      CONTOSO ANALYTICS INC\nNotice Date     Page            Beneficiary\n${mdy(notice)}      1 of 1          ${sur}, ${giv}\nNotice Type: Approval Notice\nClass: H1B\nValid from ${mdy(from)} to ${mdy(to)}\nThe above petition and extension of stay have been approved.\n-------------------------------------------\nDeparture Record\nAdmission (I-94) Record Number\n61234567890\nClass H1B   Valid until ${mdy(to)}`;
const receipt = (rn: string, form: string, sur: string, giv: string, received: string, pd?: string) =>
  `I-797C | NOTICE OF ACTION\nReceipt Number               Case Type\n${rn}                ${form}\nReceived Date   Priority Date   Petitioner\n${mdy(received)}      ${pd ? mdy(pd) : '          '}      CONTOSO ANALYTICS INC\nNotice Date     Page            Beneficiary\n${mdy(addDays(received, 5))}      1 of 1          ${sur}, ${giv}\nNotice Type: Receipt Notice`;
const ead = (sur: string, giv: string, cat: string, from: string, to: string) =>
  `UNITED STATES OF AMERICA\nEMPLOYMENT AUTHORIZATION CARD\nSurname\n${sur}\nGiven Name\n${giv}\nUSCIS#        Category    Card#\n000-000-001   ${cat}         IOE0900000026\nValid From: ${mdy(from)}\nCard Expires: ${mdy(to)}`;

export async function loadDemo(store: Store) {
  const t = today();
  const mk = (id: string, name: string, relation: Person['relation'], status: Person['status']): Person => ({ id, name, relation, status, isMain: relation === 'self', facts: {}, createdAt: t, reminders: { on: true, lead: [180, 90, 30, 7] } });
  const people = [mk('me', 'Arun', 'self', 'H-1B'), mk('demo-spouse', 'Meera', 'spouse', 'H-4'), mk('demo-child', 'Leela', 'child', 'H-4')];
  people[0].facts = { workLocation: { city: 'Plano', state: 'TX' } };
  const texts: [string, string][] = [
    ['me', passport('Z0001234', 'KUMAR', 'ARUN', '1988-03-12', addYears(t, -3), addDays(addYears(t, 7), -1))],
    ['me', visa('Z0001234', 'KUMAR', 'ARUN', 'H1B', addYears(t, -3), addDays(t, -40))],
    ['me', approval('WAC0000000001', 'KUMAR', 'ARUN', addDays(t, -200), addDays(t, -190), addDays(addYears(t, 2), 160))],
    ['me', i94('Z0001234', 'KUMAR', 'ARUN', 'H1B', addDays(t, -120), addDays(addYears(t, 2), 160))],
    ['me', receipt('IOE0000000002', 'I140 - IMMIGRANT PETITION FOR ALIEN WORKER', 'KUMAR', 'ARUN', addDays(t, -90), addYears(t, -1))],
    ['demo-spouse', passport('Z0005678', 'KUMAR', 'MEERA', '1990-06-05', addDays(addYears(t, -10), 120), addDays(t, 119))],
    ['demo-spouse', visa('Z0005678', 'KUMAR', 'MEERA', 'H4', addYears(t, -3), addDays(t, -40))],
    ['demo-spouse', i94('Z0005678', 'KUMAR', 'MEERA', 'H4', addDays(t, -120), addDays(t, 119))],
    ['demo-spouse', ead('KUMAR', 'MEERA', 'C26', addDays(t, -215), addDays(t, 150))],
    ['demo-child', passport('Z0009012', 'KUMAR', 'LEELA', '2016-01-22', addYears(t, -2), addDays(addYears(t, 3), -1))],
  ];
  const docs: Document[] = texts.map(([owner, text], i) => {
    const r = readDocument(text);
    return { id: `demo-doc-${i}`, ownerId: owner, type: r.type ?? 'other', fields: r.fields, addedAt: new Date().toISOString(), seq: i, files: [] };
  });
  await store.savePeople(people);
  await store.saveDocs(docs);
  await store.saveCases([]);
  await store.updateSettings({ setupDone: true, tutorialSeen: true, firstDocAt: addDays(t, -40) + 'T00:00:00.000Z', familyCardDismissed: true });
}
