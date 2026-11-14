# Segue player contract and review — Version 31

Reviewed 2026-11-14 against the reported Version 30 screenshots. This is a
review of application behaviour, not a claim that real Spotify/iPhone audio
has been heard or tested from this workspace.

## Failure found

The old icon renderer used `playing || busy`, so waiting for AI or Spotify
could display a pause icon even without a running stream. The old small and
full controls rendered separately. A successful command plus one static
`is_playing` sample could also pass the earlier playback simulator.

Version 31 uses one transport element outside all four scrolling views,
one command controller, and one renderer. The simulator now models a moving
clock and deliberately frozen/misleading playback states.

## Required behaviour and evidence

| Requirement | Version 31 rule | Automated evidence |
|---|---|---|
| One player everywhere | One Play button, status, seek bar, queue selection and output; no separate expanded player controls | Four populated views; one DOM button; footer/scroller/nav bounds; screenshots |
| Truthful Playing | Matching track/device, unpaused state and advancing position required | Moving versus frozen `is_playing: true` responses |
| Pending operations | Waiting/starting/checking/buffering show Cancel or progress, never a fake Pause | Delayed AI and frozen-start tests; all-view error checks |
| Shared actions | Keyboard and media actions route to the same controller; browser media-session handlers only for its SDK output | Keyboard input/navigation browser checks; serialized controller cases |
| Stable pause/resume | Pause confirmation precedes Paused; saved checkpoint is clamped and reverified | Pause failure, ignored pause, external pause/resume, saved position recovery |
| No duplicate commands | Same pending Play coalesces; actions serialize; cancelled starts stop before replacements | Deferred first Play followed by a different Play; duplicate Play test |
| Paused navigation | Next/Previous select without starting audio | Request counts and paused browser navigation |
| Previous | Restart after three seconds; otherwise use listening history | Repeated Previous through visited songs |
| Shuffle | Shuffle only upcoming tracks; current/past remain fixed; no duplicates or audio commands | Repeated tail shuffles, unshuffle, saved mode/order reload |
| Repeat | Off ends, All wraps, One repeats the AI passage; manual Next ignores repeat-one | Automatic and manual queue cases, single-song replay |
| Seeking | Within the chosen passage; paused checkpoint never starts audio; playing seek is verified | Bounded seek and resume tests; browser checkpoint reload |
| Output changes | Stop scheduling another track/device; surface missing/restricted/disconnected outputs | Device selection tests, wrong-context observation, API/SDK/autoplay failure |
| Stale/stalled stream | Remove Playing after stale state; buffer frozen progress and eventually stop with Retry | Mid-play freeze and network failure/recovery cases |
| No silent track skipping | A failed next song stays selected with Retry; automatic scheduling never jumps past it | Failed-next test; end/pause-failure test |
| AI readiness | No estimated-segment playback; first pick can wait; next picks batched by eight | Restored undecided mix, first AI wait, quota/batching/cancellation cases |
| Cache reuse | Per-song AI mappings survive mixes, close/reopen, and list clears | Cache equality checks and no-new-AI-call assertions |
| Short/unavailable songs | Short passages can fit shorter songs; unplayable/restricted/malformed items filtered before building | Short-song passage and normalization tests |
| Non-disruptive library | Opening active mix navigates only; building another mix saves alongside active playback | No extra Play/Pause calls; same active queue reference |
| Non-disruptive corrections | Marking a hook during playback saves it for next time | Current start/end and request count unchanged |
| Rename/clear | In-page controls do not block song timers; lists clear without deleting AI timings | Browser name editing, clear/cancel, reopen and retained cache |
| Audio volume | Never force phone volume or fade a transition; report zero output volume when Spotify exposes it | Zero-volume simulator and no volume API calls |
| Persistence | Source draft, order, checkpoint, shuffle, repeat and history stored per Spotify account; no autoplay on reopen | Reload/account/privacy/queue-mode checks |
| Phone layout | Persistent footer does not cover main content or nav; touch controls >=44 px; actions kept away from top-right pill | 320/390/768/1024 widths, both themes; final phone recheck |

## Verification

- `node segue/tests/playback.test.cjs`: 72 focused regression scenarios.
- `python segue/tests/browser_flow.py`: intercepted synthetic Spotify/AI
  responses, moving clock, ignored initial seeks, all four views, control
  modes, paused navigation, keyboard focus, persisted positions and clears.
- Extra phone flow: frozen start rejected on every view, retry succeeds,
  external pause/resume updates without a new Play, network-loss status is
  honest, reconnection does not replay, zero output volume is disclosed.
- Unrelated unit scenarios stub transport confirmation; the new controller
  and transport scenarios and browser flows exercise the real verifier.
- No live keys, accounts, production playlists or downloaded audio used.

## Real phone acceptance still required

1. Confirm Version 31 in the same Home Screen app; open Spotify on the same
   account and expose the intended output. Hear that the displayed song,
   device and AI start time match the actual audio.
2. Move through every tab while listening. The same footer must stay visible
   and the song must not restart. Pause must actually stop the sound.
3. While paused, Next/Previous/seek must remain silent. Play must start the
   selected song/checkpoint. Test shuffle and all repeat modes audibly.
4. Confirm that volume/Bluetooth/AirPlay routing and Premium/account access
   are correct. Progress proves Spotify reports a moving stream; it cannot
   prove what the phone speaker or headphones actually emit.
5. Test screen lock/background separately. iOS can suspend page timers.
   A static web app cannot guarantee native Spotify's lock-screen scheduling,
   seamless timing, offline music or gapless/overlapping Spotify playback.
   These remain explicit limits, not automated passes.
