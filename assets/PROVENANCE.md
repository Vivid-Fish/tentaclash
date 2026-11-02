# Where the assets came from

Generated on Tim's own gateway (Azizam, `openai.vivid.fish`) on 2026-11-01, then
re-encoded for the browser. The originals are not committed; regenerate with these
prompts if needed.

| File | Route | Prompt | Post |
|---|---|---|---|
| `textures/underwater-equi.jpg` | `image` (krea2-turbo, 2048×1024, 10 steps) | equirectangular 360 degree underwater panorama, deep teal and dark blue water, bright sun disc and god rays at the top center, sandy seabed along the bottom, distant dark coral reef silhouettes on the horizon, drifting plankton motes, no animals, no text, no watermark, soft volumetric haze, cinematic, photographic, horizontally seamless | PNG→JPEG q4 |
| `textures/sand-seamless.jpg` | `image` (krea2-turbo, 1024×1024, 10 steps) | seamless tileable texture of pale warm sand on a seabed, fine grains, scattered small coral rubble and shell fragments, flat even top-down lighting, no shadows, no creatures, photographic, high detail, tileable edges | PNG→JPEG q3 |
| `audio/whistle.m4a` | `sfx` (sa3-small-sfx, 2 s) | referee starting whistle, single short loud sports whistle blast, underwater muffled, close perspective | FLAC→AAC 80k mono |
| `audio/cheer.m4a` | `sfx` (4 s) | crowd of small aquatic creatures cheering and clicking, celebratory aquatic applause, muffled underwater, medium distance | FLAC→AAC 80k mono |
| `audio/pin.m4a` | `sfx` (2 s) | heavy hand slapping down onto a padded table, deep muffled impact thud, underwater | FLAC→AAC 80k mono |
| `audio/ambience.m4a` | `sfx` (20 s) | underwater ambient drone, deep ocean room tone, slow gentle current, soft bubble hiss, no melody, seamless loop | FLAC→AAC 96k stereo |

The creature rigs are geometry, not images: no texture generated for the octopus or
the opponents. Their colours come from the `vivid-fish-brand` tokens
(`~/code/vivid-fish-brand/src/tokens.css`), which is the palette the whole reef uses.

Total asset weight after re-encoding: 728 KB, inlined into one HTML file as data URLs.
