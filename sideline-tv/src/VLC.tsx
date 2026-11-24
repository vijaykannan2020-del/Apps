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
};

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
    />
  );
}
