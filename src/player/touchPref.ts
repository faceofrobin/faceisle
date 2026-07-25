/** True when the primary pointing device is coarse (phones/tablets). */
export function prefersTouchControls(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(pointer: coarse)").matches) return true;
  return (
    navigator.maxTouchPoints > 0 &&
    window.matchMedia("(hover: none)").matches
  );
}

/**
 * Enable touch UI immediately on coarse pointers, or on the first touch
 * (hybrids / laptops with a touchscreen — same pattern as Sylvaria).
 */
export function whenTouchControlsNeeded(enable: () => void): void {
  if (prefersTouchControls()) {
    enable();
    return;
  }
  window.addEventListener("touchstart", () => enable(), {
    once: true,
    passive: true,
  });
}
