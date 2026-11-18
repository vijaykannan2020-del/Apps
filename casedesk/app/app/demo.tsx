// Sample family for store screenshots and demos: casedesk://demo — only fills an empty app, never overwrites.
import { useEffect } from 'react';
import { View } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';

const add = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

export default function Demo() {
  const router = useRouter();
  const { to } = useLocalSearchParams<{ to?: string }>();
  useEffect(() => {
    (async () => {
      if (!(await AsyncStorage.getItem('cd.profile.v1'))) {
        await AsyncStorage.multiSet([
          ['cd.profile.v1', JSON.stringify({ visa: 'H-1B', name: 'Alex Morgan', employer: 'Acme Software Inc.', i94Expiry: add(140), petitionEnd: add(320), passportExpiry: add(80), visaStampExpiry: add(400) })],
          ['cd.family.v1', JSON.stringify([
            { id: 'demo-s', name: 'Priya', relation: 'Spouse', profile: { visa: 'H-4 EAD', i94Expiry: add(140), petitionEnd: add(320), eadExpiry: add(45), passportExpiry: add(900) } },
            { id: 'demo-c', name: 'Arjun', relation: 'Child', profile: { visa: 'H-4', i94Expiry: add(140), petitionEnd: add(320), passportExpiry: add(600) } },
          ])],
          ['cd.cases.v1', JSON.stringify([
            { receipt: 'IOE0912345678', form: 'I-129', owner: 'me', nickname: 'H-1B extension', status: 'Case Is Being Actively Reviewed By USCIS', updated: add(-6), history: [{ date: add(-6), status: 'Case Is Being Actively Reviewed By USCIS' }, { date: add(-40), status: 'Case Was Received' }] },
            { receipt: 'IOE0912345679', form: 'I-765', owner: 'demo-s', nickname: 'Priya · I-765', status: 'Case Was Approved', updated: add(-2), history: [{ date: add(-2), status: 'Case Was Approved' }, { date: add(-95), status: 'Case Was Received' }] },
          ])],
        ]);
      }
      router.replace(((to as string) || '/') as any);
    })();
  }, []);
  return <View style={{ flex: 1, backgroundColor: '#000' }} />;
}
