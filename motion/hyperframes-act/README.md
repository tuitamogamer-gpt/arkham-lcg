# Act reveal

Editable HyperFrames source for `public/motion/act-reveal.webm`. The silent 480 × 240 decoration lasts 1.7 seconds at 30 fps and contains no gameplay text. Its brass and paper colors follow [the game motion identity](../DESIGN.md).

Install this isolated project's pinned GSAP dependency and use the pinned HyperFrames CLI:

```sh
npm ci
npm run check
npm run render
```

Rendering requires Chrome/Chromium and FFmpeg. If the CLI cannot download its capture browser, select an installed browser before rendering:

```sh
HYPERFRAMES_BROWSER_PATH=/usr/bin/chromium npm run render
```

The renderer produces VP9 WebM with transparency, then `export-fallback.mjs` decodes that actual alpha channel and composites matching frames over black into `public/motion/act-reveal.mp4`. The game uses screen blending for the MP4 fallback. Both files are silent, finite and textless. The game plays the effect once only for an actual act advance and supplies accessible text separately. It never supplies rules, sound, decisions or card information. Reduced motion and player preferences belong to the game integration.

To review the composition in the Studio:

```sh
npx --yes hyperframes@0.8.141 preview --port 3017 --background --no-open
npx --yes hyperframes@0.8.141 preview --status
```

Studio URL: `http://localhost:3017/#project/hyperframes-act`.
