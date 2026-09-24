# Arkham visual identity

The original game's graphic language is the reference for the entire interface: type, printed borders, paper, colors, game symbols and physical card orientation. This extends the existing tabletop layout; it does not change rules, discovery, event pacing or saves.

## Reference

The [official 2026 rulebook](https://images-cdn.fantasyflightgames.com/filer_public/0e/d0/0ed09507-1705-47ed-a630-cd15885cabb0/ahc100_rulebook-web.pdf), especially page 8, establishes the visual direction: narrow irregular title lettering, traditional book text, cream paper, green ink, thin double rules and asymmetric rounded corners. Locally inspected reference: `output/tabletop-research/rulebook-08.png`. The original cached 2026 card scans remain the primary artwork and retain their original typography.

## Typography

- **Teutonic by Peter Wiegel** for titles, investigator names and card names. The font comes from the [author's distribution on DaFont](https://www.dafont.com/teutonic2.font), downloaded 24 September 2026. The archive includes the SIL Open Font License 1.1, retained as `public/fonts/Teutonic-OFL.txt`. This is not the unrelated medieval Teutonic family by Paul Lloyd. Use its native regular weight, without synthetic bold or italics.
- **Crimson Pro by Jacques Le Bailly** for narrative, rules, numbers and controls, with genuine variable regular and italic files. This is a freely licensed reading substitute, not a claim that it is the game's exact proprietary body font. Source: [Google Fonts upstream](https://github.com/google/fonts/tree/main/ofl/crimsonpro). SIL Open Font License retained as `public/fonts/CrimsonPro-OFL.txt`.
- Existing **Arkham Symbols** continues to provide game glyphs, independently of text fonts. Its provenance remains in `docs/icon-sources.json`.

All font files are served locally. `index.html` preloads the two regular faces; no external Google Fonts request is needed. Font roles are centralized as `--font-display`, `--font-reading` and `--font-ui`. Existing style layers refer to these roles instead of hardcoded unrelated typefaces.

## Surfaces and hierarchy

Teutonic is used for names and headings, while running rules and controls use Crimson Pro. Body copy and primary controls have larger sizes than the previous sans-serif interface. Dark, desaturated green frames surround the actual cards. Event narrative and result text sit on cream paper with dark ink. Asymmetric double-line frames echo the rulebook without adding decorative elements over cards or controls. Existing responsive geometry, focus ownership, manual confirmations and reduced-motion preferences remain authoritative.
