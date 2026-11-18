import { readDocument, type Document, type Person, type Relation } from '../src/core';

let n = 0;
export function doc(ownerId: string, text: string, extra: Partial<Document> = {}): Document {
  const r = readDocument(text);
  return { id: `d${++n}`, ownerId, type: r.type ?? 'other', fields: r.fields, addedAt: '2026-01-01T00:00:00Z', seq: n, ...extra };
}
export const person = (id: string, relation: Relation, extra: Partial<Person> = {}): Person => ({ id, name: id, relation, facts: { location: 'US' }, createdAt: '2026-01-01', ...extra });

// Synthetic sample documents (made-up people and numbers).
export const T = {
  passport: (no: string, sur: string, giv: string, issue = '11/05/2024', exp = '10/05/2034') => `REPUBLIC OF INDIA\nType  Country Code  Passport No.\nP     IND           ${no}\nSurname\n${sur}\nGiven Name(s)\n${giv}\nNationality\nINDIAN\nSex   Date of Birth\nM     14/06/1986\nDate of Issue    Date of Expiry\n${issue}       ${exp}`,
  i94: (until: string, entry: string, cls: string, no: string) => `Most Recent I-94\nAdmission (I-94) Record Number: 123456789A1\nMost Recent Date of Entry: ${entry}\nClass of Admission: ${cls}\nAdmit Until Date: ${until}\nLast/Surname: KUMAR\nFirst (Given) Name: ARUN\nDocument Number: ${no}`,
  approval: (receipt: string, notice: string, from: string, to: string, cls = 'H1B') => `I-797A | NOTICE OF ACTION\nReceipt Number               Case Type\n${receipt}                I129 - PETITION FOR A NONIMMIGRANT WORKER\nReceived Date   Priority Date   Petitioner\n01/10/2025                      ACME TECH INC\nNotice Date     Page            Beneficiary\n${notice}      1 of 1          KUMAR, ARUN\nNotice Type: Approval Notice\nClass: ${cls}\nValid from ${from} to ${to}\nThe above petition and extension of stay have been approved.\n-------------------------------------------\nDeparture Record\nAdmission (I-94) Record Number\n61234567890\nClass ${cls}   Valid until ${to}`,
  receipt: (receipt: string, received: string, form = 'I129 - PETITION FOR A NONIMMIGRANT WORKER') => `I-797C | NOTICE OF ACTION\nReceipt Number               Case Type\n${receipt}                ${form}\nReceived Date   Priority Date   Petitioner\n${received}            ACME TECH INC\nNotice Date     Page            Beneficiary\n${received}      1 of 1          KUMAR, ARUN\nNotice Type: Receipt Notice\nRequested Action: Extension of stay`,
  ead: (cat: string, from: string, to: string) => `UNITED STATES OF AMERICA\nEMPLOYMENT AUTHORIZATION CARD\nSurname\nKUMAR\nGiven Name\nPRIYA\nUSCIS#        Category    Card#\n218-473-112   ${cat}         IOE0927314561\nValid From: ${from}\nCard Expires: ${to}`,
  greenCard: (cat: string, exp: string, since: string) => `UNITED STATES OF AMERICA\nPERMANENT RESIDENT\nSurname\nKUMAR\nGiven Name\nASHA\nUSCIS#        Category\n219-384-756   ${cat}\nCard Expires: ${exp}\nResident Since: ${since}`,
};
