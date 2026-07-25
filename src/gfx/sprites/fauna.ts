import { Painter, PixelSprite, RGB, rgb } from './painter';

export function makeButterflyTextures(wing: number): [PixelSprite, PixelSprite] {
  const wc = rgb(wing);
  const dark: RGB = rgb(0x3a2c28);
  const open = new Painter(14, 10);
  for (const sx of [-1, 1]) {
    for (let dx = 1; dx <= 4; dx++) {
      for (let dy = -2; dy <= 2; dy++) {
        if (Math.abs(dy) <= 3 - Math.abs(dx - 2)) open.set(7 + sx * dx - (sx < 0 ? 1 : 0), 4 + dy, wc);
      }
    }
    open.set(7 + sx * 3 - (sx < 0 ? 1 : 0), 4, dark);
  }
  open.set(6, 3, dark);
  open.set(6, 4, dark);
  open.set(6, 5, dark);

  const closed = new Painter(14, 10);
  for (let dy = -3; dy <= 3; dy++) {
    closed.set(6, 4 + dy, dark);
    if (Math.abs(dy) < 3) {
      closed.set(5, 4 + dy, wc);
      closed.set(7, 4 + dy, wc);
    }
  }
  return [open.toSprite(), closed.toSprite()];
}

export function makeFrogTextures(): [PixelSprite, PixelSprite] {
  const body: RGB = rgb(0x5da24a);
  const belly: RGB = rgb(0x9ecf7a);
  const dark: RGB = rgb(0x3a6e30);
  const eye: RGB = rgb(0x1e2418);

  const sit = new Painter(12, 9);
  for (let y = 3; y < 8; y++) {
    for (let x = 2; x < 10; x++) {
      const dx = (x - 5.5) / 4;
      const dy = (y - 5.5) / 2.6;
      if (dx * dx + dy * dy < 1) sit.set(x, y, y >= 7 ? belly : body);
    }
  }
  sit.set(3, 2, body);
  sit.set(8, 2, body);
  sit.set(3, 3, eye);
  sit.set(8, 3, eye);
  sit.set(2, 7, dark);
  sit.set(9, 7, dark);

  const hop = new Painter(12, 9);
  for (let y = 2; y < 7; y++) {
    for (let x = 1; x < 11; x++) {
      const dx = (x - 6) / 5;
      const dy = (y - 4.5) / 2.2;
      if (dx * dx + dy * dy < 1) hop.set(x, y, y >= 6 ? belly : body);
    }
  }
  hop.set(9, 1, body);
  hop.set(9, 2, eye);
  hop.set(2, 7, dark);
  hop.set(3, 8, dark);
  hop.set(1, 6, dark);
  return [sit.toSprite(), hop.toSprite()];
}

export function makeDragonflyTextures(body: number): [PixelSprite, PixelSprite] {
  const bc = rgb(body);
  const wing: RGB = rgb(0xcfe8ea);
  const eye: RGB = rgb(0x1c2c30);

  const paint = (raised: boolean): PixelSprite => {
    const p = new Painter(16, 10);
    for (let x = 3; x <= 11; x++) p.set(x, 5, bc);
    p.set(11, 4, bc);
    p.set(12, 4, bc);
    p.set(13, 4, eye);
    p.set(3, 5, bc);
    for (const wx of [7, 9]) {
      if (raised) {
        p.set(wx - 1, 3, wing);
        p.set(wx, 2, wing);
        p.set(wx, 1, wing);
        p.set(wx + 1, 3, wing);
        p.set(wx + 1, 2, wing);
      } else {
        p.set(wx - 2, 4, wing);
        p.set(wx - 1, 4, wing);
        p.set(wx + 1, 4, wing);
        p.set(wx + 2, 4, wing);
        p.set(wx - 2, 6, wing);
        p.set(wx + 2, 6, wing);
      }
    }
    return p.toSprite();
  };
  return [paint(true), paint(false)];
}

export function makeBirdTextures(): [PixelSprite, PixelSprite] {
  const dark: RGB = rgb(0x2e3a55);
  const up = new Painter(12, 8);
  for (let i = 0; i < 4; i++) {
    up.set(5 - i, 4 - i, dark);
    up.set(6 + i, 4 - i, dark);
  }
  up.set(5, 5, dark);
  up.set(6, 5, dark);

  const down = new Painter(12, 8);
  for (let i = 0; i < 4; i++) {
    down.set(5 - i, 3 + Math.floor(i * 0.6), dark);
    down.set(6 + i, 3 + Math.floor(i * 0.6), dark);
  }
  down.set(5, 2, dark);
  down.set(6, 2, dark);
  return [up.toSprite(), down.toSprite()];
}
