// Thin wrapper over the VLC native view (react-native-vlc-media-player's iOS view, RCTVLCPlayer).
// VLC plays the live TV streams (MPEG-TS) and movie files (mkv/mp4) that iPhone's own player can't.
import { requireNativeComponent, type ViewStyle } from 'react-native';

type Ev = { nativeEvent: any };
type NativeProps = {
  style?: ViewStyle;
  source: { uri: string; initOptions: string[]; isNetwork: boolean; autoplay: boolean };
  src: { uri: string; isNetwork: boolean; isAsset: boolean; type: string; mainVer: number; patchVer: number };
  autoplay: boolean;
  paused: boolean;
  videoAspectRatio?: string;
  onVideoPlaying?: (e: Ev) => void;
  onVideoBuffering?: (e: Ev) => void;
  onVideoError?: (e: Ev) => void;
  onVideoEnded?: (e: Ev) => void;
  onVideoOpen?: (e: Ev) => void;
  onVideoLoadStart?: (e: Ev) => void;
  onVideoPaused?: (e: Ev) => void;
  onVideoStopped?: (e: Ev) => void;
  onVideoProgress?: (e: Ev) => void;
  onVideoLoad?: (e: Ev) => void;
  onRecordingState?: (e: Ev) => void;
  onSnapshot?: (e: Ev) => void;
  progressUpdateInterval?: number;
};
// The native player calls every one of these without checking, so all must be set (a missing one crashes).
const noop = () => {};

const RCTVLCPlayer = requireNativeComponent<NativeProps>('RCTVLCPlayer');

export function VLCView(p: {
  uri: string;
  options: string[];
  paused?: boolean;
  style?: ViewStyle;
  onPlaying?: () => void;
  onBuffering?: () => void;
  onError?: () => void;
  onEnded?: () => void;
  onProgress?: () => void;
}) {
  return (
    <RCTVLCPlayer
      style={p.style}
      source={{ uri: p.uri, initOptions: p.options, isNetwork: true, autoplay: true }}
      src={{ uri: p.uri, isNetwork: true, isAsset: false, type: '', mainVer: 0, patchVer: 0 }}
      autoplay
      paused={!!p.paused}
      onVideoPlaying={() => p.onPlaying?.()}
      onVideoBuffering={() => p.onBuffering?.()}
      onVideoError={() => p.onError?.()}
      onVideoEnded={() => p.onEnded?.()}
      onVideoOpen={noop}
      onVideoLoadStart={noop}
      onVideoPaused={noop}
      onVideoStopped={noop}
      onVideoProgress={() => p.onProgress?.()}
      onVideoLoad={noop}
      onRecordingState={noop}
      onSnapshot={noop}
      progressUpdateInterval={0}
    />
  );
}
