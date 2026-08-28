import { describe, expect, it } from "vitest";
import { FACE_MASK_SIZE, sampleFaceDistance } from "../src/world/faceTerrainMask";

function point(px: number, py: number): [number, number] {
  const scale = FACE_MASK_SIZE - 1;
  return [(px / scale) * 2 - 1, (py / scale) * 2 - 1];
}

describe("The Face signed-distance terrain mask", () => {
  it("keeps the source orientation and its essential positive forms", () => {
    expect(sampleFaceDistance(0, 0)).toBeGreaterThan(0);
    expect(sampleFaceDistance(...point(64, 3))).toBeGreaterThan(0);
    expect(sampleFaceDistance(...point(34, 64))).toBeGreaterThan(0);
    expect(sampleFaceDistance(...point(57, 91))).toBeGreaterThan(0);
  });

  it("preserves water in the background and pupils", () => {
    expect(sampleFaceDistance(-1, -1)).toBeLessThan(0);
    expect(sampleFaceDistance(...point(45, 51))).toBeLessThan(0);
    expect(sampleFaceDistance(...point(82, 49))).toBeLessThan(0);
  });

  it("returns normalized signed distances and samples smoothly", () => {
    const [x, z] = point(64, 3);
    const a = sampleFaceDistance(x, z);
    const b = sampleFaceDistance(x + 0.001, z + 0.001);
    expect(a).toBeLessThan(0.06);
    expect(Math.abs(a - b)).toBeLessThan(0.01);
    expect(sampleFaceDistance(1.25, 1.25)).toBeLessThan(0);
  });
});
