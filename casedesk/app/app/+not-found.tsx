import { Redirect } from 'expo-router';

// Any unknown path (e.g. when the preview is hosted under a sub-path) opens the Today tab.
export default function NotFound() {
  return <Redirect href="/" />;
}
