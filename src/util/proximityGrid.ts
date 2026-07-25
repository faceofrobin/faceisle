const CELL = 12;

export class ProximityGrid {
  private cells = new Map<number, number>();

  add(x: number, z: number): void {
    const k = this.key(Math.floor(x / CELL), Math.floor(z / CELL));
    this.cells.set(k, (this.cells.get(k) ?? 0) + 1);
  }

  countNear(x: number, z: number, radius: number): number {
    const span = Math.ceil(radius / CELL);
    const ci = Math.floor(x / CELL);
    const cj = Math.floor(z / CELL);
    let total = 0;
    for (let i = -span; i <= span; i++) {
      for (let j = -span; j <= span; j++) {
        total += this.cells.get(this.key(ci + i, cj + j)) ?? 0;
      }
    }
    return total;
  }

  private key(i: number, j: number): number {
    return (i + 2048) * 4096 + (j + 2048);
  }
}
