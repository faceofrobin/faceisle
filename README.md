# FACEISLE

**An infinite archipelago shaped by The Face.**

Faceisle is a quiet browser world of grass, trees, stone, weather, water, and flight. At ground level, each island feels like a small natural place: woods move in the wind, shorelines fold into the sea, creatures wander, and day slowly becomes night.

Take the form of a raven and climb.

From high above, the geography reveals its older intention. Every island is The Face.

The Face is not placed on top of the terrain as a logo or texture. It becomes the terrain itself. Its positive shapes form land, its negative spaces become lagoons, marshes, reefs, shadowed stone, and channels of water. Each island retains procedural variation while preserving the exact structure and geometry of The Face.

Faceisle is currently being transformed from the original procedural island engine into this new world.

## The central idea

The landscape must work at two distances.

On foot, it should read as a convincing island with hills, beaches, forests, flowers, reeds, stones, wildlife, and changing weather. The player should not feel as though they are walking across an emblem.

From the air, those same natural systems should resolve into The Face.

The revelation is geographic, not decorative.

## Current state

The existing engine already provides:

- An infinite, deterministic archipelago generated from a world seed
- Walkable procedural terrain
- Raven flight and island-to-island travel
- Streaming near, far, and unloaded island states
- Trees, grass, flowers, reeds, mushrooms, and biome variation
- Beaches, marshes, pools, mountains, snow, stone, and landmarks
- Birds, butterflies, dragonflies, frogs, and fireflies
- A complete day-and-night cycle
- Clear, cloudy, and rainy weather
- Generative environmental audio
- A small custom WebGL2 renderer with no runtime dependencies
- Desktop and touch controls

The next terrain system will replace the existing primarily circular island falloff with a mask derived from the exact artwork for The Face.

Until that terrain work lands, screenshots in this repository show the underlying island engine rather than the final Face-shaped geography.

## How The Face becomes an island

The Face artwork remains the authoritative source. It must not be redrawn, approximated, or procedurally reinterpreted.

The intended terrain pipeline is:

1. Preserve the exact Face artwork as a clean SVG or lossless black-and-white source image.
2. Convert that source into a compact signed-distance field for fast terrain sampling.
3. Use the distance field to determine land, shore, shallow water, and open sea.
4. Layer the existing procedural hills and surface noise inside the landform.
5. Allow only restrained erosion at the shoreline, preserving the identity and geometry of The Face.
6. Let the existing biome and vegetation systems populate the resulting ground naturally.
7. Build both a detailed walking mesh and an aerial mesh capable of retaining the eyes, glasses, mouth, and other essential shapes.

The SVG is the stencil. The procedural engine is the weather.

## Geographic interpretation

The precise treatment will be tested in the world, but the working interpretation is:

| Element of The Face | Possible geographic expression |
| --- | --- |
| White facial forms | Grassland, forest, sand, and elevated terrain |
| Black internal forms | Water, marsh, dark stone, ravines, or low ground |
| Eyes and glasses | Lagoons, channels, cliffs, and narrow land bridges |
| Hair and outer negative space | Deep water and irregular coastline |
| Circular border | Reef, sandbar, cliff ring, or distant outer island |
| Fine lines | Streams, paths, low ridges, or carefully widened aerial features |

The geography may vary in material and elevation, but the structure of The Face remains unchanged.

## Procedural variation

Every generated island should be recognizably The Face without becoming the same island repeated forever.

A seed may change:

- Terrain relief and hill placement
- Forest density and tree species
- Meadow, autumn, marsh, and snow regions
- Ground palette and seasonal character
- Stones, flowers, wildlife, and weather
- The treatment of internal dark shapes
- Landmarks placed only where they do not obscure The Face
- Slight orientation changes within a deliberately narrow range

A seed must not change:

- The structure or geometry of The Face
- The relationship of its eyes, glasses, mouth, hair, and border
- The aerial readability of the complete landform

## The aerial revelation

The current flight system allows the player to become a raven and climb above the islands. Faceisle will tune the flight ceiling, distant terrain resolution, haze, and camera behavior so the full landform can be discovered naturally.

The ideal sequence is simple:

- Walk through an apparently organic island.
- Notice unusual waterways and ridges.
- Become the raven.
- Climb until the paths and coast begin to align.
- See The Face looking back from the sea.

## Images and documentation

Existing engine screenshots live in:

```text
docs/screenshots/
```

New README-specific artwork and development images should live in:

```text
docs/readme/
```

Recommended filenames:

```text
docs/readme/faceisle-hero.png
docs/readme/the-face-source.png
docs/readme/terrain-mask.png
docs/readme/aerial-reveal.png
docs/readme/ground-level.png
docs/readme/shoreline-study.png
```

Use PNG for screenshots and pixel artwork. Use SVG for diagrams, masks, and the authoritative vector version of The Face. Keep original source artwork lossless.

Once the new images exist, the opening hero can be added with:

```md
![Faceisle seen from above](docs/readme/faceisle-hero.png)
```

Development comparisons can use a simple table:

```md
| On the island | Above the island |
| --- | --- |
| ![Ground level](docs/readme/ground-level.png) | ![Aerial reveal](docs/readme/aerial-reveal.png) |
```

Do not place README images in `src/` or `public/` unless the running game also needs to load them. Documentation images belong under `docs/`; runtime assets belong under `public/` or an appropriate source asset module.

## Stack

- TypeScript
- Vite 6
- Custom WebGL2 renderer
- Custom procedural world and geometry systems
- Generative Web Audio
- No runtime dependencies

## Local setup

```bash
npm install
npm run dev
```

The development server opens at `http://localhost:5173`.

Production commands:

```bash
npm run build
npm run preview
npm test
```

The production build is written to `dist/` and can be deployed as a static site.

## Controls

| Input | On the island | On the wing |
| --- | --- | --- |
| Click or tap | Start and unlock audio | — |
| Mouse | Look | Steer |
| WASD or arrows | Walk | Tuck, spread, and bank |
| Space | Become the raven | Beat wings and climb |
| Shift | Stroll | Fold wings and dive |
| Esc | Settings | Settings |

Touch devices receive dedicated walking, flight, movement, and settings controls.

## Shareable worlds

World state can be opened through query parameters:

```text
?seed=A7C3E911&t=0.26&weather=clear&goto=marsh
```

| Parameter | Effect |
| --- | --- |
| `seed` | Selects a deterministic world seed |
| `t` | Sets the day phase from `0` to `1` |
| `weather` | Forces `clear`, `cloudy`, or `rain` |
| `goto` | Opens at a named landmark or `x,z` coordinate |
| `yaw` / `pitch` | Sets the initial view |
| `shot=1` | Hides interface chrome for captures |

## Origin and license

Faceisle is based on **isle**, an MIT-licensed procedural island experience created in 2026 by [kengocodes](https://github.com/kengocodes/isle).

The original engine, its elegant procedural systems, and its quiet spirit remain the foundation of this adaptation. Faceisle redirects that foundation toward the visual mythology of The Face.

See [LICENSE](LICENSE) for license details.
