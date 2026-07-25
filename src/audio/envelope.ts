
const BED = 0.06;

const OVER_BED_DB = 14;

export const EVENT_CEILING = BED * Math.pow(10, OVER_BED_DB / 20);

export function capPeak(v: number): number {
  return Math.min(v, EVENT_CEILING);
}

export function onsetFor(peak: number): number {
  return 0.006 + Math.min(0.014, peak * 0.07);
}

export function softStrike(
  gain: AudioParam,
  peak: number,
  t: number,
  attackS: number,
  releaseEndS: number,
  releaseFloor = 0.0005,
): void {
  const start = Math.max(peak * 1e-4, 1e-4);
  const attackEnd = t + attackS;
  const releaseEnd = t + releaseEndS;
  gain.cancelScheduledValues(t);
  gain.setValueAtTime(start, t);
  gain.linearRampToValueAtTime(Math.max(peak, start), attackEnd);
  if (releaseEnd > attackEnd) {
    gain.exponentialRampToValueAtTime(releaseFloor, releaseEnd);
  }
}
