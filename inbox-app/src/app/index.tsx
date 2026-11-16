import { Redirect } from 'expo-router';
import { S } from '@/lib/matrix';

export default function Index() {
  return <Redirect href={S.token ? '/chats' : '/login'} />;
}
