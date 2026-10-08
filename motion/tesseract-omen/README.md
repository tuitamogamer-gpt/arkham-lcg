# Agenda omen seal

A silent 1.8-second engraved brass seal for an actual agenda advance. The ring settles, muted red ink fractures its center, and the accent fades away. It carries no gameplay text, audio, loop, or interaction.

[AgendaOmen.tsrct](AgendaOmen.tsrct) is the portable editable source, authored and validated with the public Tesseract CLI **0.3.1**. Eight native vector shape layers sit in one timed group. Fifteen AnimationGraph entries drive draw-on, a four-pixel separation, and the opacity envelope. There are no flattened design images or external assets in the source.

[AgendaOmen.webm](AgendaOmen.webm) is the matching 400 × 400, 30 fps browser preview with VP9 alpha. The gameplay copy is `public/motion/agenda-omen.webm`. [AgendaOmen.mp4](AgendaOmen.mp4) is the same motion composited over black; use `mix-blend-mode: screen` for that fallback. MP4 has no alpha channel. Both exports are finite and silent.

[The readable filmstrip](Previews/AgendaOmen-readable-filmstrip.png) samples the saved revision from 0.00 to 1.77 seconds over the game's table color. [Browser playback](Previews/AgendaOmen-browser-playback.png) shows an actual Chromium playback frame. Dark and paper-background reviews check transparent edges. The source poster remains transparent.

The effect is decorative. The game retains its accessible agenda text and controls. Integration should only mount it for a confirmed new agenda advance, avoid replay on loads/undo/seat changes, and honor reduced motion and the existing motion preference. See [the shared design reference](../DESIGN.md).

## Verified rendering

The Linux x64 public CLI archive was checked against its published SHA-256. Telemetry was disabled before authoring. A compatible Mesa lavapipe driver was supplied locally after the CLI reported no Vulkan adapter.

Every browser-export frame was rendered by `tsrct preview` from the saved native project, then encoded with FFmpeg libvpx-vp9. FFmpeg with the explicit VP9 decoder confirmed transparent uncovered pixels and opaque linework. Chromium played 53 presented frames across the 1.8-second clip, including visible content with alpha 255 around 0.9 seconds and its quiet fade near the end. It reported no page error. An earlier check that sought after playback ended read a stale blank frame; the retained real-time review uses presented-frame callbacks.

The pinned CLI also completed an actual isolated native ProRes export on this Linux host using its supported external FFmpeg backend. The verified intermediate is ProRes 4444, `yuva444p12le`, 30 fps, 1.8 seconds, with alpha 0–65535. Its actual dimensions are 266 × 266 when the CLI applies its `720p` resolution option to the 400-pixel authoring canvas. That intermediate is retained in the ignored working directory, not shipped to the browser.

`review.json` binds the source and delivered previews. The `.tesseract-work` folder retains the authoring scripts, supported action batch, and checked-out native JSON. Renderer caches, schemas, diagnostic exports, and earlier failed playback checks are ignored.

To rerender the saved project, provide the pinned CLI through `TESSERACT_CLI` and any Vulkan driver configuration in your environment, then run `python3 .tesseract-work/render.py`. It renders 54 PNG frames at 30 fps without changing the source. Browser compression used:

```sh
ffmpeg -framerate 30 -i .tesseract-work/frames/%04d.png \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 36 \
  -deadline good -cpu-used 3 -row-mt 1 -an AgendaOmen.webm
```
