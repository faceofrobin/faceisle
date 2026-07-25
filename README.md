# isle

A quiet procedural island you walk in the browser. Day fades into night, the wind moves through the trees, and nothing asks you to hurry. Inspired by games like [Proteus](https://en.wikipedia.org/wiki/Proteus_(video_game)).

Terrain, creatures, and sound are all generated at runtime by a small custom engine. The whole game is **400 KB**.

[Play on itch.io](https://kengocodes.itch.io/isle) · [Play in browser](https://isle-gamma.vercel.app/) · [Source](https://github.com/kengocodes/isle)

![Dawn on the shore](docs/screenshots/dawn.png)

<p align="center">
  <img src="docs/screenshots/midday.png" width="49%" alt="Midday hills" />
  <img src="docs/screenshots/sunset.png" width="49%" alt="Sunset shore" />
</p>
<p align="center">
  <img src="docs/screenshots/woods.png" width="49%" alt="Woods at dawn" />
  <img src="docs/screenshots/night.png" width="49%" alt="Night sky" />
</p>

## Stack

- **TypeScript** + **Vite 6**
- Custom **WebGL2** renderer (no runtime dependencies)
- Custom loop: procedural world, pixel post, generative **Web Audio**

## Setup

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + bundle → dist/
npm run preview   # serve the production build
npm test
```

Static hosting: upload `dist/` (relative `base`, works in itch embeds). Vercel rewrites for legacy `/privacy` and `/terms` are in `vercel.json`.

## Controls

| Input         | Action                |
| ------------- | --------------------- |
| Click / tap   | Start (unlocks audio) |
| WASD / arrows | Walk                  |
| Mouse         | Look                  |
| Shift         | Stroll                |
| Esc           | Settings              |

Touch devices get an on-screen stick; drag elsewhere to look.

Shareable islands use query params, e.g. `?seed=A7C3E911&t=0.26&weather=clear&goto=marsh`.

## License

[MIT](LICENSE) © 2026 [kengocodes](https://github.com/kengocodes)
