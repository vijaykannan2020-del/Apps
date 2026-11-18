import { Profile, usesEAD, isBlanket, hasApprovalNotice } from './profile';

export type Slot = { type: string; label: string; key: keyof Profile };
// The documents someone on this visa should have, in the order people think of them.
export function slotsFor(p?: Profile | null): Slot[] {
  const s: Slot[] = [
    { type: 'Passport', label: 'Passport', key: 'passportExpiry' },
    { type: 'Visa stamp', label: 'Visa stamp', key: 'visaStampExpiry' },
    { type: 'I-94', label: 'I-94', key: 'i94Expiry' },
  ];
  if (!p || hasApprovalNotice(p.visa)) s.push(p && isBlanket(p) ? { type: 'I-129S (blanket L)', label: 'I-129S (blanket L)', key: 'petitionEnd' } : { type: 'Approval (I-797A/B)', label: 'I-797 approval', key: 'petitionEnd' });
  if (p && usesEAD(p.visa)) s.push({ type: 'EAD card', label: 'EAD card', key: 'eadExpiry' });
  return s;
}

