# Chaos bag setup reference

The investigation setup now displays a physical bag illustration, grouped numeric tokens with copy counts, and a visible legend for every symbol in the selected bag. Scenario effects come directly from the cached Spreading Flames reference card (12105), switching faces for Hard / Expert. Elder Sign effects come from the selected investigators' cached card text. The bag contents continue to come from BAGS; this view does not draw tokens or modify saves.

The scenario reference was checked against [the published card](https://arkhamdb.com/card/12105) on 25 September 2026. The existing Arkham symbol font supplies the actual interface glyphs; the still-life artwork is decorative.

## Validation

- TypeScript and production build passed in both an isolated copy of this change and the shared working tree.
- Chromium and WebKit passed all four difficulty choices, keyboard selection, one/three investigator Elder Sign details, unchanged existing saves while previewing/cancelling, and starting/reloading a new game with the chosen bag.
- Visually reviewed the finished WebKit desktop panel and 320px layout. Checked 320, 390, 768 and 1440px widths in both browsers: no horizontal overflow, loaded artwork, 16px symbol explanations, and no console/page errors.
- Captures and the focused verification script/report are retained under ignored `output/chaos-bag/`.

## Artwork

- Asset: `public/art/chaos-bag.jpg`
- Generated with the built-in imagegen tool on 25 September 2026.
- Original: `/Users/borislavvukojevic/.codex/generated_images/01a0d996-5766-7570-a77f-8b457f4f7562/exec-12879c82-5a8d-4cfa-9de2-558c959acb27.png`
- Saved as JPEG at quality 85 for web delivery; the generated original is preserved.
- Prompt: Use case: product-mockup. Asset type: square illustration for an Arkham Horror tabletop game's chaos bag reference panel. Primary request: a tactile premium forest-green velvet drawstring pouch, visibly open with a dark inner mouth and thick antique gold cord, resting on a very dark desaturated green felt game table, several chunky ivory and antiqued brass circular game tokens scattered naturally at its base. One visible ivory token reads -1, one reads 0, others are turned over or have worn abstract etched details. No other text. Style: atmospheric realistic still-life product photography with painterly 1920s occult detective atmosphere, rich velvet folds, soft warm side light, deep dark green shadows, restrained brass accents; a real physical collector board-game component. Composition: centered entire pouch upright in three-quarter view, easily recognizable silhouette, occupies 65 percent of square, ample dark margins on every edge, no cropping of cords or tokens. Palette matches dark #142923 green and cream #e8ddbc. No hands, people, logos, frame, watermark, glowing magic or UI. Square 1024px or greater.
