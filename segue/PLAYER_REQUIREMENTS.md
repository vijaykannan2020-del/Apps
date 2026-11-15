# Segue Version 37 playback contract

The Version 34 controller is superseded by a new SDK-only controller. Read
[README.md](README.md) for timing/cache details and real-platform limits.

| Requirement | Rule | Evidence |
|---|---|---|
| Browser only | Load one selected URI into SDK ready ID; no native selection/fallback | URI and device assertions; source contains no account-wide status fallback |
| One playback truth | SDK state only; no global Spotify poll | SDK missing/frozen/wrong-song cases |
| Truthful Playing | Matching song, unpaused, advancing position | Frozen start rejection and CD animation checks |
| Wrong song | Pause that local SDK stream; never adopt or falsely label it | Unit/browser wrong-track injection |
| Cancellation | Serialize commands; cancel preparation; stop a late load before replacement | Deferred URI load, repeated Play and AI cancellation |
| Pause | Verify SDK paused before Paused; failure stays unconfirmed | Ignored pause case |
| Resume | Use local SDK resume/seek when the same song is loaded | Request-count checks |
| Paused navigation | Select silently; reject old polls | Next/Previous/seek with deferred paused poll |
| Queue | Upcoming shuffle only; history Previous; repeat Off/All/One | Controller and browser cases |
| Complete sources | All album pages and artist releases/tracks; no song-count or search cap | 145-track album/160-track artist unit checks; 128-track browser album |
| Automatic batches | Small startup request, larger while playing, input budget and uncached filtering | Small/large metadata tests and serialized requests |
| Cross-release reuse | Same Spotify ID or verified ISRC/duration; no title-only reuse | Alias/mismatch/backfill tests and zero-new-AI browser flow |
| Database | Migrate and persist timing/library records in IndexedDB; retain backup; do not silently load stale data on failure | 6 MiB save, reload, migration and unavailable-database browser cases |
| AI only | Reject incomplete/invalid timings; never generate a fixed fallback | Missing end, reversed range and out-of-duration cases |
| No fixed excerpt length | Complete passage; short, multi-minute and song-end ranges allowed | 14-second, 142-second and song-end examples |
| Old cache | Retain old entries, revalidate capped picks once, retain previous values | Cache migration and reuse cases |
| Exact returned range | Ask best beat-driven charanam; no lyric lookup or post-answer extension | Returned 158–245s range stays unchanged despite a later saved marker |
| Late AI | Prefetch ahead; confirmed pause at the selected complete charanam end if next pick is late; no full-song extension | Late-next wait and pause-failure/Retry pause cases |
| No false mixing promise | No volume ramps/overlap; iOS volume not JS-settable | SDK documentation; no ramp code |
| Notification buttons | Register track Previous/Next; remove 10-second skip handlers | Handler inspection and browser invocation |
| App identity | Stable explicit Segue ID/scope/start URL | Manifest assertions; Plate Log unchanged |
| Shared UI | Same controls inline/right CD deck or compact float; no output badges | DOM identity, four-view browser flow |
| Visuals | Cinema Book neutral palette; CD rotates only on confirmed movement | 14 layout/theme cases and motion states |
| Persistence | Preserve mixes, song timings/corrections; clears remove lists only | Clear/reload/account-scoped library cases |

## Required phone verification — not automated passes

1. Open Version 35 in the same installation. Hear that the named song and actual
   audio agree. Try pause, resume, Previous, Next, shuffle, repeat and scrubbing.
2. For a new AI pick, hear that the selected charanam finishes before the
   next verse; whole-recording fallback is rejected. Try a saved song across two releases: its saved range should be reused.
   This release does not automatically replace valid older saved choices. Judge its end audibly. A line-start timestamp is not vocal-end proof.
3. Listen through multiple transitions. Network/start latency may still cause
   gaps. Artificially late AI should wait at the selected charanam end rather than play the full remainder.
   Actual lyric completion still needs audible judgment; the AI does not hear audio.
4. Test notification Previous/Next and pause/resume, then tap its title. Confirm
   which app opens. Explicit identity is added; Plate Log routing is NOT proven
   fixed and the web Media Session API cannot specify the destination app URL.
5. Test locked-screen/CarPlay separately. Browser/iOS controls and scheduling can
   differ from foreground tests; no native CarPlay UI or background timing guarantee.
6. Confirm saved mixes/AI mappings remain. Do not clear website data/uninstall
   as an update workaround without considering local data loss.

These checks use synthetic Spotify/AI/SDK boundaries. They cannot certify
real speaker output, lyric completion, iOS notification routing, true fades,
gapless Spotify loading, or native CarPlay behavior.
