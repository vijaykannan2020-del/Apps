// Voice & video calls between people on your own server (you and your family).
// Signalling: Matrix 1:1 VoIP events (m.call.invite / answer / candidates / hangup) in the private chat.
// Media: WebRTC, relayed through your server's TURN when a direct path isn't possible.
// UI: the native iPhone call screen (CallKit) + Inbox's in-call screen for video and controls.
import { Platform, AppState } from 'react-native';
import { useSyncExternalStore } from 'react';
import { router } from 'expo-router';
import RNCallKeep from 'react-native-callkeep';
import VoipPushNotification from 'react-native-voip-push-notification';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate, RTCAudioSession, MediaStream, mediaDevices } from 'react-native-webrtc';
import { S, Room, MEvent, api, setCallHook, roomName, allOthers, isPrivateRoom } from '@/lib/matrix';
import { pushCapable, IOS_APP } from '@/lib/push';

const enc = encodeURIComponent;
const PUSH_URL = 'http://pushgw:8080/_matrix/push/v1/notify';
export const callsAvailable = pushCapable; // native modules exist only in the real app, not Expo Go

export type CallState = 'ringing' | 'calling' | 'connecting' | 'connected' | 'ended';
export type Call = {
  callId: string; uuid: string; roomId: string; name: string; video: boolean; dir: 'in' | 'out';
  state: CallState; startedAt: number | null; endedReason?: string;
  muted: boolean; speaker: boolean; camOff: boolean; frontCam: boolean;
  local: MediaStream | null; remote: MediaStream | null;
};

// ---------- tiny store for the UI ----------
let cur: Call | null = null;
let pc: RTCPeerConnection | null = null;
let offer: { type: string; sdp: string } | null = null;
let remoteParty: string | null = null;
let outCands: any[] = []; let candTimer: any = null;
let inCands: any[] = []; let remoteSet = false;
let answerWanted = false; let inviteTimer: any = null;
let audioActive = false;
let signalled = false; // invite (caller) or answer (callee) has been sent — candidates must not go out before it
const earlyCands = new Map<string, any[]>(); // candidates that arrived before their invite
const subs = new Set<() => void>();
let ver = 0;
const emit = () => { ver++; subs.forEach(f => f()); };
export function useCall() {
  useSyncExternalStore(f => { subs.add(f); return () => { subs.delete(f); }; }, () => ver, () => ver);
  return cur;
}
/** CallKit reports call ids in lowercase; ours are uppercase — always compare this way. */
const same = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const set = (patch: Partial<Call>) => { if (cur) { cur = { ...cur, ...patch }; emit(); } };

// ---------- helpers ----------
const PARTY = 'inbox' + Math.random().toString(36).slice(2, 10);
const newId = () => 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
/** Same UUID the server puts in the VoIP push for this call (FNV-1a ×4 → UUID). Keep in sync with pushgw. */
export function uuidFor(callId: string) {
  let out = '';
  for (let k = 0; k < 4; k++) {
    let h = (0x811c9dc5 ^ (k * 0x9e3779b1)) >>> 0;
    for (let i = 0; i < callId.length; i++) { h ^= callId.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    out += h.toString(16).padStart(8, '0');
  }
  return `${out.slice(0, 8)}-${out.slice(8, 12)}-4${out.slice(13, 16)}-a${out.slice(17, 20)}-${out.slice(20, 32)}`.toUpperCase();
}
async function sendCallEvent(roomId: string, type: string, content: any) {
  const txn = 'm' + Date.now() + Math.random().toString(36).slice(2, 8);
  return api('PUT', `/_matrix/client/v3/rooms/${enc(roomId)}/send/${type}/${txn}`, { call_id: cur?.callId, party_id: PARTY, version: '1', ...content });
}
async function iceServers() {
  const list: any[] = [{ urls: 'stun:stun.l.google.com:19302' }];
  try {
    const t = await api('GET', '/_matrix/client/v3/voip/turnServer');
    if (t && t.uris && t.uris.length) list.push({ urls: t.uris, username: t.username, credential: t.password });
  } catch {}
  return list;
}

async function makePeer(video: boolean) {
  const stream = await mediaDevices.getUserMedia({ audio: true, video: video ? { facingMode: 'user', width: 1280, height: 720, frameRate: 30 } : false }) as MediaStream;
  set({ local: stream });
  pc = new RTCPeerConnection({ iceServers: await iceServers(), iceTransportPolicy: 'all' } as any);
  stream.getTracks().forEach(t => pc!.addTrack(t, stream));
  const anyPc = pc as any;
  anyPc.addEventListener('icecandidate', (e: any) => {
    if (!e.candidate) { if (signalled) flushCands(); return; }
    outCands.push({ candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex });
    if (!candTimer && signalled) candTimer = setTimeout(flushCands, 200);
  });
  anyPc.addEventListener('track', (e: any) => {
    const s = (e.streams && e.streams[0]) || new MediaStream([e.track]);
    set({ remote: s });
  });
  const onState = () => {
    const ice = (pc as any)?.iceConnectionState; const conn = (pc as any)?.connectionState;
    const st = conn === 'connected' || ice === 'connected' || ice === 'completed' ? 'connected' : conn === 'failed' || ice === 'failed' ? 'failed' : '';
    if (st === 'connected' && cur && cur.state !== 'connected') {
      set({ state: 'connected', startedAt: Date.now() });
      if (audioActive) { try { RTCAudioSession.audioSessionDidActivate(); } catch {} }
      if (cur.dir === 'out') RNCallKeep.reportConnectedOutgoingCallWithUUID(cur.uuid);
    }
    if (st === 'failed') end('Call failed — check your connection', true);
  };
  anyPc.addEventListener('connectionstatechange', onState);
  anyPc.addEventListener('iceconnectionstatechange', onState);
  return pc;
}
async function flushCands() {
  candTimer = null;
  if (!cur || !outCands.length || !signalled) return;
  // the other side can't use candidates before it has the invite; send them after it
  const batch = outCands.splice(0);
  try { await sendCallEvent(cur.roomId, 'm.call.candidates', { candidates: batch }); } catch { outCands.unshift(...batch); }
}
async function addRemoteCandidates(c: any[]) {
  if (!pc || !remoteSet) { inCands.push(...c); return; }
  for (const x of c) if (x && x.candidate) { try { await pc.addIceCandidate(new RTCIceCandidate(x)); } catch {} }
}

function reset() {
  try { cur?.local?.getTracks().forEach(t => t.stop()); } catch {}
  try { pc?.close(); } catch {}
  pc = null; offer = null; remoteParty = null; outCands = []; inCands = []; remoteSet = false; answerWanted = false; signalled = false;
  clearTimeout(candTimer); candTimer = null; clearTimeout(inviteTimer);
}

// ---------- outgoing ----------
export async function startCall(room: Room, video: boolean) {
  if (!callsAvailable) throw new Error('Calls work in the Inbox app from TestFlight');
  if (cur && cur.state !== 'ended') { router.push('/call'); return; }
  if (!isPrivateRoom(room)) throw new Error('Calls work in private chats with family on your own server');
  const callId = newId();
  cur = { callId, uuid: uuidFor(callId), roomId: room.id, name: roomName(room), video, dir: 'out', state: 'calling', startedAt: null,
    muted: false, speaker: video, camOff: false, frontCam: true, local: null, remote: null };
  emit(); router.push('/call');
  RNCallKeep.startCall(cur.uuid, cur.name, cur.name, 'generic', video);
  try {
    await makePeer(video);
    const o = await pc!.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: video } as any);
    await pc!.setLocalDescription(o as any);
    await sendCallEvent(room.id, 'm.call.invite', { lifetime: 60000, offer: { type: 'offer', sdp: (o as any).sdp }, invitee: allOthers(room)[0] });
    signalled = true;
    RNCallKeep.reportConnectingOutgoingCallWithUUID(cur.uuid);
    flushCands();
    inviteTimer = setTimeout(() => { if (cur && cur.callId === callId && cur.state === 'calling') hangup('No answer'); }, 60000);
  } catch (e: any) {
    end(e?.message?.includes('ermission') ? 'Allow microphone/camera for Inbox in Settings' : 'Could not start the call', true);
  }
}

// ---------- incoming ----------
function onInvite(r: Room, ev: MEvent) {
  const c = ev.content || {};
  const age = ev.unsigned?.age ?? (Date.now() - ev.origin_server_ts);
  if (ev.sender === S.userId || age > (c.lifetime || 60000)) return;
  if (cur && cur.state !== 'ended') {
    if (cur.callId === c.call_id) return;
    // busy: politely reject the second call
    api('PUT', `/_matrix/client/v3/rooms/${enc(r.id)}/send/m.call.reject/${'r' + Date.now()}`, { call_id: c.call_id, party_id: PARTY, version: '1' }).catch(() => {});
    return;
  }
  const video = /m=video/.test(c.offer?.sdp || '');
  const wanted = answerWanted; // answered on the lock screen before this invite synced
  reset();
  answerWanted = wanted;
  offer = c.offer; remoteParty = c.party_id || null;
  inCands = earlyCands.get(c.call_id) || []; earlyCands.delete(c.call_id);
  cur = { callId: c.call_id, uuid: uuidFor(c.call_id), roomId: r.id, name: roomName(r), video, dir: 'in', state: 'ringing', startedAt: null,
    muted: false, speaker: video, camOff: false, frontCam: true, local: null, remote: null };
  emit();
  // If a VoIP push already showed the call screen this does nothing (same UUID); otherwise it rings now.
  RNCallKeep.displayIncomingCall(cur.uuid, cur.name, cur.name, 'generic', video);
  inviteTimer = setTimeout(() => { if (cur && cur.callId === c.call_id && cur.state === 'ringing') end('Missed call'); }, Math.max(5000, (c.lifetime || 60000) - age));
  if (answerWanted) doAnswer();
}

async function doAnswer() {
  if (!cur || cur.dir !== 'in') return;
  if (!offer) { answerWanted = true; return; } // answered from the lock screen before the invite synced
  answerWanted = false;
  set({ state: 'connecting' });
  if (AppState.currentState === 'active') router.push('/call');
  try {
    await makePeer(cur.video);
    await pc!.setRemoteDescription(new RTCSessionDescription(offer as any));
    remoteSet = true; addRemoteCandidates(inCands.splice(0));
    const a = await pc!.createAnswer();
    await pc!.setLocalDescription(a as any);
    await sendCallEvent(cur.roomId, 'm.call.answer', { answer: { type: 'answer', sdp: (a as any).sdp } });
    signalled = true;
    flushCands();
  } catch (e: any) { end('Could not connect the call', true); }
}

// ---------- events from the other side ----------
function onCallEvent(r: Room, ev: MEvent) {
  const c = ev.content || {};
  if (ev.type === 'm.call.invite') return onInvite(r, ev);
  if (ev.type === 'm.call.candidates' && ev.sender !== S.userId && (!cur || c.call_id !== cur.callId)) {
    const l = earlyCands.get(c.call_id) || []; l.push(...(c.candidates || [])); earlyCands.set(c.call_id, l);
    if (earlyCands.size > 20) earlyCands.delete(earlyCands.keys().next().value as string);
    return;
  }
  if (!cur || c.call_id !== cur.callId || ev.sender === S.userId) {
    // our own other device answered/declined → stop ringing here
    if (cur && c.call_id === cur.callId && ev.sender === S.userId && c.party_id !== PARTY && (ev.type === 'm.call.answer' || ev.type === 'm.call.reject')) end('Answered on another device');
    return;
  }
  switch (ev.type) {
    case 'm.call.answer':
      if (cur.dir !== 'out' || remoteSet) return;
      remoteParty = c.party_id || null;
      clearTimeout(inviteTimer);
      set({ state: 'connecting' });
      pc?.setRemoteDescription(new RTCSessionDescription(c.answer)).then(() => { remoteSet = true; addRemoteCandidates(inCands.splice(0)); }).catch(() => end('Could not connect the call', true));
      sendCallEvent(cur.roomId, 'm.call.select_answer', { selected_party_id: c.party_id }).catch(() => {});
      break;
    case 'm.call.candidates':
      if (remoteParty && c.party_id && c.party_id !== remoteParty && cur.dir === 'out' && remoteSet) return;
      addRemoteCandidates(c.candidates || []);
      break;
    case 'm.call.hangup':
      end(cur.state === 'ringing' ? 'Missed call' : 'Call ended');
      break;
    case 'm.call.reject':
      end(cur.dir === 'out' ? 'Declined' : 'Call ended');
      break;
    case 'm.call.select_answer':
      if (cur.dir === 'in' && c.selected_party_id && c.selected_party_id !== PARTY) end('Answered on another device');
      break;
  }
}

// ---------- ending ----------
function end(reason: string, failed = false) {
  if (!cur || cur.state === 'ended') return;
  const uuid = cur.uuid;
  reset();
  set({ state: 'ended', endedReason: reason, local: null, remote: null });
  // 1 failed, 2 remote ended, 3 unanswered, 6 missed
  RNCallKeep.reportEndCallWithUUID(uuid, failed ? 1 : reason === 'Missed call' ? 6 : 2);
  setTimeout(() => { if (cur && cur.state === 'ended' && cur.uuid === uuid) { cur = null; emit(); } }, 1800);
}
/** You hang up (or decline). */
export function hangup(reason = 'Call ended') {
  if (!cur || cur.state === 'ended') return;
  const { roomId, state, dir, uuid } = cur;
  if (dir === 'in' && state === 'ringing') sendCallEvent(roomId, 'm.call.reject', {}).catch(() => {});
  else sendCallEvent(roomId, 'm.call.hangup', { reason: state === 'calling' ? 'invite_timeout' : 'user_hangup' }).catch(() => {});
  try { RNCallKeep.endCall(uuid); } catch {}
  end(reason === 'No answer' ? 'No answer' : reason);
}
export const answer = () => { if (cur) { RNCallKeep.answerIncomingCall(cur.uuid); doAnswer(); } };

// ---------- in-call controls ----------
export function toggleMute() {
  if (!cur) return; const m = !cur.muted;
  cur.local?.getAudioTracks().forEach(t => { t.enabled = !m; });
  RNCallKeep.setMutedCall(cur.uuid, m); set({ muted: m });
}
export function toggleCamera() {
  if (!cur || !cur.video) return; const off = !cur.camOff;
  cur.local?.getVideoTracks().forEach(t => { t.enabled = !off; }); set({ camOff: off });
}
export function flipCamera() {
  if (!cur) return;
  cur.local?.getVideoTracks().forEach((t: any) => { try { t._switchCamera(); } catch {} });
  set({ frontCam: !cur.frontCam });
}
export async function toggleSpeaker() {
  if (!cur) return; const on = !cur.speaker;
  try {
    const routes = await RNCallKeep.getAudioRoutes();
    const pick = on ? routes.find(r => /speaker/i.test(r.type) || /speaker/i.test(r.name)) : routes.find(r => /phone|receiver/i.test(r.type) || /iphone/i.test(r.name));
    if (pick) await RNCallKeep.setAudioRoute(cur.uuid, pick.name);
  } catch {}
  set({ speaker: on });
}

// ---------- diagnostics (shown small on the call screen) ----------
export async function callStats(): Promise<string> {
  if (!pc) return '';
  try {
    const ice = (pc as any).iceConnectionState, conn = (pc as any).connectionState;
    const rep: any = await (pc as any).getStats();
    const all: any[] = []; rep.forEach((v: any) => all.push(v));
    const pair = all.find(x => x.type === 'candidate-pair' && (x.selected || x.nominated) && x.state === 'succeeded');
    const lc = pair && all.find(x => x.id === pair.localCandidateId), rc = pair && all.find(x => x.id === pair.remoteCandidateId);
    const kb = (n: number) => (n > 2048 ? Math.round(n / 1024) + 'k' : String(n || 0));
    const by = (type: string, kind: string) => all.filter(x => x.type === type && (x.kind || x.mediaType) === kind).reduce((a, x) => a + (x.bytesReceived || x.bytesSent || 0), 0);
    const lt = cur?.local?.getTracks().map(t => t.kind[0] + (t.enabled ? '' : '-')).join('') || '–';
    const rt = cur?.remote?.getTracks().map(t => t.kind[0]).join('') || '–';
    return `ice ${ice}/${conn} · ${lc ? lc.candidateType : '?'}→${rc ? rc.candidateType : '?'} · audio ↑${kb(by('outbound-rtp', 'audio'))} ↓${kb(by('inbound-rtp', 'audio'))} · video ↑${kb(by('outbound-rtp', 'video'))} ↓${kb(by('inbound-rtp', 'video'))} · tracks ${lt}/${rt} · audio session ${audioActive ? 'on' : 'off'}`;
  } catch (e: any) { return 'stats: ' + (e?.message || 'n/a'); }
}

// ---------- start-up ----------
let started = false;
export function startCalls() {
  if (started || !callsAvailable || Platform.OS !== 'ios') return; started = true;
  setCallHook(onCallEvent);
  RNCallKeep.setup({
    ios: { appName: 'Inbox', supportsVideo: true, maximumCallGroups: '1', maximumCallsPerCallGroup: '1', includesCallsInRecents: false },
    android: { alertTitle: 'Permissions', alertDescription: 'Inbox needs access to make calls', cancelButton: 'Cancel', okButton: 'OK', additionalPermissions: [] },
  } as any).catch(() => {});
  RNCallKeep.addEventListener('answerCall', ({ callUUID }) => { if (cur && same(cur.uuid, callUUID)) doAnswer(); else answerWanted = true; });
  RNCallKeep.addEventListener('endCall', ({ callUUID }) => { if (cur && same(cur.uuid, callUUID) && cur.state !== 'ended') hangup(); });
  RNCallKeep.addEventListener('didActivateAudioSession', () => { audioActive = true; try { RTCAudioSession.audioSessionDidActivate(); } catch {} });
  RNCallKeep.addEventListener('didDeactivateAudioSession', () => { audioActive = false; try { RTCAudioSession.audioSessionDidDeactivate(); } catch {} });
  RNCallKeep.addEventListener('didPerformSetMutedCallAction', ({ muted, callUUID }) => {
    if (cur && same(cur.uuid, callUUID) && cur.muted !== muted) { cur.local?.getAudioTracks().forEach(t => { t.enabled = !muted; }); set({ muted }); }
  });
  RNCallKeep.addEventListener('didLoadWithEvents', (events: any[]) => {
    for (const e of events || []) {
      if (e.name === 'RNCallKeepPerformAnswerCallAction') answerWanted = true;
      if (e.name === 'RNCallKeepDidActivateAudioSession') { audioActive = true; try { RTCAudioSession.audioSessionDidActivate(); } catch {} }
    }
  });
  // VoIP push token → Matrix pusher, so a locked/closed iPhone rings
  const registerVoip = (token: string) => {
    if (!token || !S.token) return;
    api('POST', '/_matrix/client/v3/pushers/set', { kind: 'http', app_id: IOS_APP + '.voip', pushkey: token, app_display_name: 'Inbox calls',
      device_display_name: 'iPhone', lang: 'en', data: { url: PUSH_URL }, append: false }).catch(() => {});
  };
  VoipPushNotification.addEventListener('register', registerVoip);
  VoipPushNotification.addEventListener('didLoadWithEvents', (events: any[]) => {
    for (const e of events || []) if (e.name === 'RNVoipPushRemoteNotificationsRegisteredEvent') registerVoip(e.data);
  });
}
