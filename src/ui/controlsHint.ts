import "./controlsHint.css";

/** How long the legend stays readable before fading out. */
const HOLD_MS = 7200;
const FADE_MS = 900;

const DESKTOP_HTML = `
  <div class="controls-hint-row">
    <span class="controls-hint-item">
      <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
      <span class="controls-hint-label">walk</span>
    </span>
    <span class="controls-hint-item">
      <span class="controls-hint-label">Mouse look</span>
    </span>
    <span class="controls-hint-item">
      <kbd>Space</kbd>
      <span class="controls-hint-label">fly</span>
    </span>
    <span class="controls-hint-item">
      <kbd>Esc</kbd>
      <span class="controls-hint-label">settings</span>
    </span>
  </div>`;

const TOUCH_HTML = `
  <div class="controls-hint-row">
    <span class="controls-hint-item">
      <span class="controls-hint-label">Walk / Hold Fly</span>
    </span>
    <span class="controls-hint-item">
      <span class="controls-hint-label">Drag — look</span>
    </span>
    <span class="controls-hint-item">
      <span class="controls-hint-label">Settings</span>
    </span>
  </div>`;

/**
 * Bottom-of-screen controls legend shown once play begins, then auto-fades.
 * Non-interactive; Settings still has the full list.
 */
export class ControlsHint {
  private root: HTMLElement;
  private touchMode: boolean;
  private holdTimer = 0;
  private leaveTimer = 0;
  private shown = false;

  constructor(touchMode: boolean) {
    this.touchMode = touchMode;
    this.root = document.createElement("div");
    this.root.id = "controls-hint";
    this.root.setAttribute("role", "status");
    this.root.setAttribute("aria-live", "polite");
    this.root.setAttribute("aria-hidden", "true");
    this.render();
    document.body.append(this.root);
  }

  setTouchMode(on: boolean): void {
    if (this.touchMode === on) return;
    this.touchMode = on;
    this.render();
  }

  /** Call once when the player first enters play. */
  show(): void {
    if (this.shown) return;
    this.shown = true;
    this.root.setAttribute("aria-hidden", "false");
    this.root.classList.remove("is-leaving");
    this.root.classList.add("is-visible");
    this.holdTimer = window.setTimeout(() => this.dismiss(), HOLD_MS);
  }

  dismiss(): void {
    if (!this.shown) return;
    window.clearTimeout(this.holdTimer);
    this.holdTimer = 0;
    this.root.classList.add("is-leaving");
    this.root.classList.remove("is-visible");
    this.root.setAttribute("aria-hidden", "true");
    window.clearTimeout(this.leaveTimer);
    this.leaveTimer = window.setTimeout(() => {
      this.root.remove();
    }, FADE_MS);
  }

  private render(): void {
    this.root.innerHTML = this.touchMode ? TOUCH_HTML : DESKTOP_HTML;
  }
}
