// Widget deep link casedesk://open/case/<key> (v2.5). Widgets never carry receipt numbers, so they
// link to a case by a key without one (src/core/widgets.ts caseKey); this resolves it and opens the case.
import { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useFamily } from '../../../src/data/FamilyProvider';
import { caseKey } from '../../../src/core/widgets';

export default function OpenCase() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const f = useFamily();
  useEffect(() => {
    if (!f.ready) return;
    const c = f.caseList.find((x) => caseKey(x) === key);
    router.replace((c ? `/case/${encodeURIComponent(c.id)}` : '/cases') as never);
  }, [f.ready, f.caseList, key]);
  return null;
}
