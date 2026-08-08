import "./touchControls.css";
import type { Controls } from "../player/controls";

/** CSS px from center to full deflection (matches Sylvaria’s floating stick). */
const JOY_R = 56;
const JOY_EDGE = 70;
const STICK_DEAD = 0.14;

export class TouchControls {
  private root: HTMLElement;
  private zone: HTMLElement;
  private joy: HTMLElement;
  private knob: HTMLElement;
  private controls: Controls;
  private canvas: HTMLElement;
  private stickId: number | null = null;
  private lookId: number | null = null;
  private flyId: number | null = null;
  private originX = 0;
  private originY = 0;
  private lastLookX = 0;
  private lastLookY = 0;
  private onPause: () => void;

  constructor(
    controls: Controls,
    canvas: HTMLElement,
    onPause: () => void,
  ) {
    this.controls = controls;
    this.canvas = canvas;
    this.onPause = onPause;
    controls.setTouchMode(true);

    this.root = document.createElement("div");
    this.root.id = "touch-ui";
    this.root.className = "hidden";
    this.root.setAttribute("aria-hidden", "true");
    this.root.innerHTML = `
      <button type="button" class="touch-pause" id="btn-touch-pause">Pause</button>
      <button type="button" class="touch-fly" id="btn-touch-fly"
              aria-label="Fly">Fly</button>
      <div class="touch-joyzone" aria-hidden="true">
        <div class="touch-joy"><div class="touch-joy-knob"></div></div>
      </div>`;
    document.body.append(this.root);

    this.zone = this.root.querySelector(".touch-joyzone") as HTMLElement;
    this.joy = this.root.querySelector(".touch-joy") as HTMLElement;
    this.knob = this.root.querySelector(".touch-joy-knob") as HTMLElement;

    const pauseBtn = this.root.querySelector(
      "#btn-touch-pause",
    ) as HTMLButtonElement;
    pauseBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onPause();
    });

    this.bindFly(this.root.querySelector("#btn-touch-fly") as HTMLElement);
    this.bindStick();
    this.bindLook();
  }

  /**
   * Held, not tapped: the first press leaves the ground and holding it on beats
   * the wings, which is the same contract the space bar has.
   */
  private bindFly(button: HTMLElement): void {
    const press = (e: PointerEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (this.flyId !== null) return;
      this.flyId = e.pointerId;
      button.classList.add("on");
      try {
        button.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      this.controls.setFlap(true);
    };
    const release = (e?: PointerEvent): void => {
      if (e && e.pointerId !== this.flyId) return;
      this.flyId = null;
      button.classList.remove("on");
      this.controls.setFlap(false);
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    button.addEventListener("lostpointercapture", release);
    window.addEventListener("blur", () => release());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) release();
    });
  }

  show(): void {
    this.root.classList.remove("hidden");
    this.root.setAttribute("aria-hidden", "false");
  }

  hide(): void {
    this.root.classList.add("hidden");
    this.root.setAttribute("aria-hidden", "true");
    this.releaseStick();
    this.lookId = null;
  }

  private bindStick(): void {
    const release = (): void => this.releaseStick();

    this.zone.addEventListener("pointerdown", (e) => {
      // OS edge gestures can drop a touch without pointerup; if capture is
      // gone, the stale owner would ignore every new thumb press.
      if (this.stickId !== null && !this.zone.hasPointerCapture(this.stickId)) {
        release();
      }
      if (this.stickId !== null || e.button !== 0) return;
      e.preventDefault();
      this.controls.beginPlay();
      this.show();
      this.stickId = e.pointerId;
      this.zone.setPointerCapture(e.pointerId);

      // Keep the base fully on screen even when the thumb lands at the edge.
      this.originX = Math.max(JOY_EDGE, e.clientX);
      this.originY = Math.min(
        window.innerHeight - JOY_EDGE,
        Math.max(JOY_EDGE, e.clientY),
      );
      const zr = this.zone.getBoundingClientRect();
      this.joy.style.left = `${this.originX - zr.left}px`;
      this.joy.style.top = `${this.originY - zr.top}px`;
      this.joy.classList.add("on");
      this.knob.style.transform = "";
      this.controls.setTouchAxes(0, 0);
    });

    this.zone.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.stickId) return;
      e.preventDefault();
      let dx = (e.clientX - this.originX) / JOY_R;
      let dy = (e.clientY - this.originY) / JOY_R;
      const len = Math.hypot(dx, dy);
      if (len > 1) {
        dx /= len;
        dy /= len;
      }
      this.knob.style.transform = `translate(${dx * JOY_R}px, ${dy * JOY_R}px)`;

      let ax = dx;
      let ay = -dy;
      const mag = Math.hypot(ax, ay);
      if (mag < STICK_DEAD) {
        this.controls.setTouchAxes(0, 0);
        return;
      }
      const remapped = (mag - STICK_DEAD) / (1 - STICK_DEAD);
      this.controls.setTouchAxes((ax / mag) * remapped, (ay / mag) * remapped);
    });

    this.zone.addEventListener("pointerup", (e) => {
      if (e.pointerId === this.stickId) release();
    });
    this.zone.addEventListener("pointercancel", (e) => {
      if (e.pointerId === this.stickId) release();
    });
    this.zone.addEventListener("lostpointercapture", (e) => {
      if (e.pointerId === this.stickId) release();
    });
    window.addEventListener("blur", release);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) release();
    });
  }

  private releaseStick(): void {
    this.stickId = null;
    this.joy.classList.remove("on");
    this.knob.style.transform = "";
    this.controls.setTouchAxes(0, 0);
  }

  private bindLook(): void {
    const onDown = (e: PointerEvent) => {
      if (!this.controls.enabled) return;
      if (this.lookId !== null || e.button !== 0) return;
      if (
        (e.target as HTMLElement).closest?.(
          "#touch-ui, #btn-touch-fly, #footer-links, #settings, #legal",
        )
      ) {
        return;
      }
      e.preventDefault();
      this.controls.beginPlay();
      this.show();
      this.lookId = e.pointerId;
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
      try {
        this.canvas.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== this.lookId) return;
      e.preventDefault();
      const dx = e.clientX - this.lastLookX;
      const dy = e.clientY - this.lastLookY;
      this.lastLookX = e.clientX;
      this.lastLookY = e.clientY;
      this.controls.lookBy(dx, dy);
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== this.lookId) return;
      this.lookId = null;
    };
    const releaseLook = (): void => {
      this.lookId = null;
    };

    this.canvas.addEventListener("pointerdown", onDown);
    this.canvas.addEventListener("pointermove", onMove);
    this.canvas.addEventListener("pointerup", onUp);
    this.canvas.addEventListener("pointercancel", onUp);
    this.canvas.addEventListener("lostpointercapture", onUp);
    window.addEventListener("blur", releaseLook);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) releaseLook();
    });
  }
}
