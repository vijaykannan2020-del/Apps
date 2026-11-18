import { EmptyState, Screen } from '../src/ui';
import { home } from '../src/screens/common';
export default function NotFound() {
  return <Screen><EmptyState icon="doc" title="This page doesn’t exist" action={{ title: 'Go to Home', onPress: home }} /></Screen>;
}
