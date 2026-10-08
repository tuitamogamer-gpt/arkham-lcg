# Arkham Chronicle milestone motion

## Style Prompt
Use the game's existing midnight investigation table: restrained brass, oxidized green, ink, smoke and printed paper. Short, deliberate reveals feel like opening a case file or breaking a seal. Ornament frames the milestone and leaves the physical cards and controls legible. All motion is silent and finite.

## Colors
- `#091211`: midnight canvas, transparent for overlays where possible.
- `#0e1918`: dark table surface.
- `#c7a36a`: brass rules, seals and act progress.
- `#ddd4b9`: printed paper text.
- `#9d594e`: muted omen and defeat accent, used sparingly.

## Typography
Teutonic for milestone titles and Crimson Pro for supporting copy. Local licensed fonts live in `public/fonts/`. Actual gameplay text remains accessible DOM content; decorative exported effects should not bake in labels.

## Motion
Only actual act/agenda advances and scenario endings receive new cinematic accents. Use 1.4–2.2 seconds, one event at a time, smooth deceleration, and one quiet landing. No delays to rules, no click interception, no loops. Honor existing full/subtle/off preferences and system reduced motion. Saved-game loads, inspection, resource actions, routine draws, undo and seat switches do not trigger milestones.

## What NOT to Do
- No constant particle field, confetti, shaking table or bright flashes.
- No generic neon gradients, saturated gaming HUD or invented card artwork.
- No future draws, concealed faces or inferred win text.
- No autoplay sound, progress gate or animation that blocks a decision.
- No duplicate cinematic layers for the same milestone.
