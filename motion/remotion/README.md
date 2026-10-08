# Scenario resolution ornament

The live composition is `src/components/milestones/ResolutionComposition.tsx`.
It uses Remotion's frame clock and interpolation inside the in-game Player;
there is no exported video, audio, timer, network asset, or gameplay mutation.

Use matching `remotion` and `@remotion/player` version `4.0.534`. The composition
is 480 × 240 at 30 fps, lasts 54 frames (1.8 seconds), and runs once. The host
owns the accessible HTML title, event detection, reduced-motion preference,
replay suppression, and a 2.2-second presentation timeout independent of playback. The clear title area is
x=80–400 / y=88–175 in composition coordinates.

`victory` and `defeat` are presentation variants only when the actual ending
supplies that outcome. `ended` is the neutral case seal for an ending whose
outcome is not known. The artwork itself contains no outcome text. All colors
follow `motion/DESIGN.md` and the existing midnight table identity.
