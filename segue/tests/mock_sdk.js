// Browser test double only. No credentials or actual music; state comes from the intercepted API.
window.Spotify={Player:class {
  constructor(options){window.SDK_PLAYER=this;window.SDK_OPTIONS=options;window.SDK_CONSTRUCTORS=(window.SDK_CONSTRUCTORS||0)+1;this.events={};}
  addListener(name,fn){this.events[name]=fn;}
  connect(){window.SDK_CONNECTS=(window.SDK_CONNECTS||0)+1;setTimeout(()=>this.events.ready?.({device_id:'browser'}),0);return Promise.resolve(true);}
  disconnect(){}
  activateElement(){window.SDK_ACTIVATIONS=(window.SDK_ACTIVATIONS||0)+1;return Promise.resolve();}
  async getCurrentState(){if(window.SDK_NO_STATE)return null;try{const r=await fetch('https://api.spotify.com/v1/me/player');if(!r.ok)return null;const s=await r.json();return s?.device?.id==='browser'?{position:s.progress_ms,paused:!s.is_playing,track_window:{current_track:s.item}}:null;}catch{return null;}}
  setVolume(){return Promise.resolve();}
}};
window.onSpotifyWebPlaybackSDKReady?.();
