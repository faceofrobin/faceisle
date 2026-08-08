import { describe, expect, it } from "vitest";
import { Rng } from "../src/util/random";
import { Terrain } from "../src/world/terrain";

/**
 * A fingerprint of the terrain a seed generates.
 *
 * Shareable `?seed=` links are in the wild, so the home island has to keep
 * generating the island it always did. The archipelago varies islands through
 * `IslandShape`, never by changing the noise or the order it is drawn in —
 * these numbers are what holds that line.
 */
function fingerprint(seed: number): number {
  const t = new Terrain(new Rng(seed));
  let acc = 0;
  for (let i = 0; i < 4000; i++) {
    const x = ((i * 137) % 700) - 350;
    const z = ((i * 269) % 700) - 350;
    const b = t.biomeAt(x, z);
    acc +=
      t.heightAt(x, z) +
      t.slopeAt(x, z) * 3 +
      t.forestAt(x, z) * 7 +
      t.meadowAt(x, z) * 11 +
      b.autumn * 13 +
      b.marsh * 17;
  }
  return acc;
}

describe("terrain", () => {
  it("generates the same home island it always has", () => {
    expect(fingerprint(0xa7c3e911)).toBeCloseTo(55486.252116, 4);
    expect(fingerprint(1)).toBeCloseTo(56571.713656, 4);
    expect(fingerprint(0xdeadbeef)).toBeCloseTo(54674.008462, 4);
  });

  it("puts the home island's peak where it always was", () => {
    const peak = new Terrain(new Rng(0xa7c3e911)).peakSite;
    expect(peak.x).toBeCloseTo(64.9467, 3);
    expect(peak.y).toBeCloseTo(26.9462, 3);
    expect(peak.z).toBeCloseTo(-11.7443, 3);
  });

  it("carries an island's whole shape to wherever it sits", () => {
    const home = new Terrain(new Rng(7));
    const moved = new Terrain(new Rng(7), { centerX: 2400, centerZ: -900 });
    for (let i = 0; i < 200; i++) {
      const x = ((i * 61) % 600) - 300;
      const z = ((i * 173) % 600) - 300;
      expect(moved.heightAt(x + 2400, z - 900)).toBeCloseTo(home.heightAt(x, z), 9);
      expect(moved.forestAt(x + 2400, z - 900)).toBeCloseTo(home.forestAt(x, z), 9);
    }
    expect(moved.peakSite.x).toBeCloseTo(home.peakSite.x + 2400, 6);
    expect(moved.peakSite.z).toBeCloseTo(home.peakSite.z - 900, 6);
  });

  it("leaves open sea outside an island's reach", () => {
    const t = new Terrain(new Rng(3), { centerX: 1000, radius: 200 });
    expect(t.covers(1000, 0)).toBe(true);
    expect(t.covers(1400, 0)).toBe(false);
    expect(t.heightAt(1400, 0)).toBeLessThan(-3);
  });

  it("keeps land above water however low the relief", () => {
    for (const relief of [0.62, 0.8, 1, 1.32]) {
      const t = new Terrain(new Rng(11), { relief, radius: 140 });
      expect(t.heightAt(0, 0)).toBeGreaterThan(0.5);
    }
  });

  it("scales mesh detail with the island, at about two metres a quad", () => {
    const big = new Terrain(new Rng(5));
    const small = new Terrain(new Rng(5), { radius: 150 });
    expect(big.fullSegments).toBe(320);
    expect(small.fullSegments).toBeLessThan(big.fullSegments);
    expect(big.farSegments).toBeLessThan(big.fullSegments / 3);
  });
});

describe("landmarks", () => {
  /** Where an island's landmark stands, and a point `d` metres off it. */
  function around(t: Terrain, d: number): { at: number; off: number[] } {
    const p = t.peakSite;
    const off = [0, 1, 2, 3].map((i) => {
      const a = (i / 4) * Math.PI * 2;
      return t.heightAt(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d);
    });
    return { at: t.heightAt(p.x, p.z), off };
  }

  it("rings a caldera with a wall and floods the middle", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const t = new Terrain(new Rng(seed), { landmark: "caldera" });
      const { at, off } = around(t, 96);
      // Every direction out to the rim is well above the floor, and the floor
      // is under the sea — which is what makes the lake.
      for (const rim of off) expect(rim - at).toBeGreaterThan(20);
      expect(at).toBeLessThan(0);
    }
  });

  it("raises a spire to a point", () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const t = new Terrain(new Rng(seed), { landmark: "spire" });
      const near = around(t, 70);
      for (const h of near.off) expect(near.at - h).toBeGreaterThan(25);
      // And it is a needle, not a dome: most of that is lost in the first 25 m.
      const close = around(t, 25);
      for (const h of close.off) expect(near.at - h).toBeGreaterThan(12);
    }
  });

  it("gives a built landmark a hill to stand on, above water", () => {
    for (const landmark of ["colossus", "elder"] as const) {
      for (const seed of [1, 2, 3, 4, 5]) {
        const t = new Terrain(new Rng(seed), { landmark });
        const { at, off } = around(t, 70);
        expect(at).toBeGreaterThan(3);
        // A rise, but a gentle one — the thing standing on it is the landmark.
        for (const h of off) expect(at - h).toBeLessThan(28);
      }
    }
  });

  it("leaves the home island's mountain exactly as it was", () => {
    const before = new Terrain(new Rng(0xa7c3e911));
    const after = new Terrain(new Rng(0xa7c3e911), { landmark: "peak" });
    for (let i = 0; i < 300; i++) {
      const x = ((i * 97) % 600) - 300;
      const z = ((i * 211) % 600) - 300;
      expect(after.heightAt(x, z)).toBe(before.heightAt(x, z));
    }
  });
});
