// Catches a render crash in any screen and shows a calm "Try again" instead of a white screen.
import React from 'react';
import { Pressable, Text, View } from 'react-native';

type State = { error?: Error };
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = {};
  static getDerivedStateFromError(error: Error): State { return { error }; }
  componentDidCatch(error: Error) { if (__DEV__) console.warn('Screen crashed', error); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: '#0A0B0D', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 16 }}>
        <Text style={{ color: '#FFFFFF', fontSize: 20, fontWeight: '700' }}>Something went wrong</Text>
        <Text style={{ color: 'rgba(235,235,245,0.62)', fontSize: 15, textAlign: 'center' }}>Your data is safe on this phone. Try again — if it keeps happening, restart the app.</Text>
        <Pressable onPress={() => this.setState({ error: undefined })} accessibilityRole="button" accessibilityLabel="Try again" style={{ backgroundColor: '#0A84FF', borderRadius: 14, paddingHorizontal: 24, minHeight: 50, justifyContent: 'center' }}>
          <Text style={{ color: '#FFFFFF', fontSize: 17, fontWeight: '600' }}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}
