/**
 * Common mobile browser quirks for a full-screen WebGL walk:
 * - iOS double-tap zoom (touch-action CSS is primary; dblclick/gesture as belt)
 * - iOS Safari pinch/gesture events
 * - Long-press callout / context menu on the canvas
 * - Multi-touch page zoom while playing
 */

let installed = false;

export function installMobileGuards(opts: {
  canvas: HTMLElement;
  isMenuOpen: () => boolean;
}): void {
  if (installed) return;
  installed = true;

  const block = (e: Event) => {
    e.preventDefault();
  };

  // Legacy iOS Safari pinch/gesture API (still fires on some versions).
  document.addEventListener("gesturestart", block, { passive: false });
  document.addEventListener("gesturechange", block, { passive: false });
  document.addEventListener("gestureend", block, { passive: false });

  // Extra insurance where touch-action is ignored or late to apply.
  document.addEventListener("dblclick", block, { passive: false });

  opts.canvas.addEventListener("contextmenu", block);
  document.addEventListener(
    "contextmenu",
    (e) => {
      if (opts.isMenuOpen()) return;
      e.preventDefault();
    },
    { passive: false },
  );

  // Block pinch-zoom page scaling while in the game (menus keep their own
  // touch-action / scrolling).
  document.addEventListener(
    "touchmove",
    (e) => {
      if (opts.isMenuOpen()) return;
      if (e.touches.length > 1) e.preventDefault();
    },
    { passive: false },
  );
}
