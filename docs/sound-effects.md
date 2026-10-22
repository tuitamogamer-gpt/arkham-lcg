# Optional game sound

Sound is off by default. Settings has separate ambience and effects controls, a master volume slider and **Mute all audio**. These preferences are stored locally. Muting or setting volume to zero stops a playing milestone voice and cancels pending playback immediately. Enabling sound later does not replay an earlier event.

Three short vocal cues were generated with the connected **Fish Audio** service on 22 October 2026, using its public Fish Official **Sarah** voice and `s2.1-pro` model:

| Observed event | Cue | Local file |
| --- | --- | --- |
| Act advances | “A new lead.” | `public/audio/fish-act.mp3` |
| Agenda advances | “Time is running out.” | `public/audio/fish-agenda.mp3` |
| Scenario ends | “The investigation is over.” | `public/audio/fish-ending.mp3` |

The ending cue is neutral: a native `IsOver` state does not establish victory. Routine actions retain the existing synthesized effects. The new clips are vocal cues, not generated music or environmental sound effects.

New cues follow the same public-state transitions as the existing significant-event presentation. Initial hydration, saved-game restoration, Undo and repeated snapshots do not announce old milestones. Sound is independent of the visual motion setting. Leaving the table, hiding the page, rewinding a checkpoint or observing a newer milestone cancels pending and active voice playback. Failed downloads, decoding and autoplay never advance or block the game.

Only one milestone voice can play at a time. The app uses local MP3 assets, with no Fish credentials, generation requests or external audio URLs in the runtime. The service worker precaches the three files for offline use; this background caching does not enable sound.

## Source and verification

[Generation manifest](../sound/fish-audio/manifest.json) retains the exact prompts, provider tasks, original and normalized file hashes, durations and processing command. Clips were normalized to a quiet `-20 LUFS` target with a `-3 dBTP` ceiling, encoded as mono 44.1 kHz MP3 and stripped of source metadata. All three files decode successfully. [Automated transcript checks](../sound/fish-audio/transcript-check.json) match their intended phrases; they are not a human listening review.

The lifecycle tests exercise opt-in, failed loading/decoding, canceled asynchronous work, superseding cues and master controls. The production browser check instruments real Web Audio decoding and buffer playback, checks saved-state isolation, Undo/load races, mobile controls and actual offline cached bytes:

```sh
BASE_URL=http://127.0.0.1:5187 node --import tsx scripts/fish-audio-browser-check.mjs
```

The browser checkpoints are isolated presentation fixtures. They do not certify a winning whole scenario or a new native runtime.
