// Thin wrapper over the VLC native view (react-native-vlc-media-player's iOS view, RCTVLCPlayer).
// VLC plays the live TV streams (MPEG-TS) and movie files (mkv/mp4/HLS) that iPhone's own player can't.
import { requireNativeComponent, type ViewStyle } from 'react-native';

type Ev = { nativeEvent: any };
type NativeProps = {
  style?: ViewStyle;
  source: { uri: string; initOptions: string[]; isNetwork: boolean; autoplay: boolean };
  src: { uri: string; isNetwork: boolean; isAsset: boolean; type: string; mainVer: number; patchVer: number };
  autoplay: boolean;
  paused: boolean;
  seek?: number;
  audioTrack?: number;
  textTrack?: number;
  subtitleUri?: string;
  videoAspectRatio?: string;
  progressUpdateInterval?: number;
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
};

const RCTVLCPlayer = requireNativeComponent<NativeProps>('RCTVLCPlayer');
// The native player calls every one of these without checking, so all must be set (a missing one crashes).
const noop = () => {};

export type Track = { id: number; name: string };
export type VideoInfo = { duration?: number; audioTracks?: Track[]; textTracks?: Track[] };
export type Progress = { currentTime: number; duration: number; position: number };

export function VLCView(p: {
  uri: string;
  options: string[];
  paused?: boolean;
  seek?: number;          // 0..1 position; pass a new value to jump
  audioTrack?: number;
  textTrack?: number;     // -1 turns subtitles off
  subtitleUri?: string;
  aspect?: string;
  style?: ViewStyle;
  onPlaying?: () => void;
  onBuffering?: () => void;
  onError?: () => void;
  onEnded?: () => void;
  onProgress?: (p: Progress) => void;
  onLoad?: (i: VideoInfo) => void;
}) {
  const extra: Partial<NativeProps> = {};
  if (p.seek !== undefined) extra.seek = p.seek;
  if (p.audioTrack !== undefined) extra.audioTrack = p.audioTrack;
  if (p.textTrack !== undefined) extra.textTrack = p.textTrack;
  if (p.subtitleUri) extra.subtitleUri = p.subtitleUri;
  if (p.aspect) extra.videoAspectRatio = p.aspect;
  return (
    <RCTVLCPlayer
      style={p.style}
      source={{ uri: p.uri, initOptions: p.options, isNetwork: true, autoplay: true }}
      src={{ uri: p.uri, isNetwork: true, isAsset: false, type: '', mainVer: 0, patchVer: 0 }}
      autoplay
      paused={!!p.paused}
      {...extra}
      progressUpdateInterval={250}
      onVideoPlaying={() => p.onPlaying?.()}
      onVideoBuffering={() => p.onBuffering?.()}
      onVideoError={() => p.onError?.()}
      onVideoEnded={() => p.onEnded?.()}
      onVideoProgress={e => p.onProgress?.({ currentTime: Number(e.nativeEvent?.currentTime) || 0, duration: Number(e.nativeEvent?.duration) || 0, position: Number(e.nativeEvent?.position) || 0 })}
      onVideoLoad={e => p.onLoad?.(e.nativeEvent || {})}
      onVideoOpen={noop}
      onVideoLoadStart={noop}
      onVideoPaused={noop}
      onVideoStopped={noop}
      onRecordingState={noop}
      onSnapshot={noop}
    />
  );
}
