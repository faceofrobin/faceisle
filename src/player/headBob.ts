
const HEAD_BOB_AMPLITUDE = 0;

export function headBobVertical(bobSin: number, moving: number): number {
  return bobSin * HEAD_BOB_AMPLITUDE * moving;
}

export function footstepCrossing(prevBob: number, bob: number, moving: number, threshold = 0.25): boolean {
  return prevBob > 0 && bob <= 0 && moving > threshold;
}
