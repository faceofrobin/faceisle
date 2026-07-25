/**
 * Capture clean README screenshots from the live WebGL canvas.
 * Usage: node tools/capture-screenshots.mjs [baseUrl]
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "../docs/screenshots");
const BASE = process.argv[2] ?? "http://127.0.0.1:5173";
const W = 1600;
const H = 900;

/** @type {{ name: string, setup: string }[]} */
const SHOTS = [
  {
    name: "dawn",
    setup: `() => {
      const i = window.__isle;
      i.day.t = 0.255; i.day.update(0);
      const x = 132, z = 115;
      i.goto(x, z, Math.atan2(-x, -z), -0.04);
    }`,
  },
  {
    name: "midday",
    setup: `() => {
      const i = window.__isle;
      i.day.t = 0.42; i.day.update(0);
      i.goto(100, 130, Math.atan2(20, 40), -0.12);
    }`,
  },
  {
    name: "sunset",
    setup: `() => {
      const i = window.__isle;
      i.day.t = 0.735; i.day.update(0);
      const x = 63, z = 163;
      i.goto(x, z, Math.atan2(-x, -z), -0.06);
    }`,
  },
  {
    name: "woods",
    setup: `() => {
      const i = window.__isle;
      i.day.t = 0.26; i.day.update(0);
      const m = i.sites.marsh;
      i.goto(m.x + 14, m.z + 10, Math.atan2(14, 10), -0.08);
    }`,
  },
  {
    name: "night",
    setup: `() => {
      const i = window.__isle;
      i.day.t = 0.05; i.day.update(0);
      i.goto(140, 40, -1.2, -0.05);
    }`,
  },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: W, height: H },
    deviceScaleFactor: 1,
  });

  await page.goto(`${BASE}/?seed=0xA7C3E911&weather=clear&shot=1`, {
    waitUntil: "networkidle",
  });
  await page.waitForFunction(() => !!window.__isle, null, { timeout: 60000 });
  await page.waitForTimeout(1000);

  await page.evaluate(
    ([w, h]) => {
      window.__isle.resize(w, h);
    },
    [W, H],
  );
  await page.waitForTimeout(300);

  const canvas = page.locator("canvas").first();

  for (const shot of SHOTS) {
    await page.evaluate((fnSrc) => {
      const fn = new Function(`return (${fnSrc})`)();
      fn();
    }, shot.setup);
    await page.waitForTimeout(600);

    const path = resolve(OUT, `${shot.name}.png`);
    await canvas.screenshot({ path, type: "png" });
    const size = statSync(path).size;
    console.log(`wrote ${path} (${size} bytes)`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
