
import "./settings.css";
import {
  DEFAULT_DAY_LENGTH,
  MAX_DAY_LENGTH,
  MIN_DAY_LENGTH,
} from "../world/daycycle";

export interface SettingsValues {
  master: number;
  music: number;
  sfx: number;
  muted: boolean;
  /** Mouse-look multiplier (1 = default). UI range 0.25..2. */
  lookSensitivity: number;
  /** When true, moving the mouse up looks down. */
  invertY: boolean;
  /** Full day/night cycle length in seconds. */
  dayLength: number;
  /** When true, weather stays rainy for this visit. */
  alwaysRain: boolean;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  master: 0.8,
  music: 1,
  sfx: 1,
  muted: false,
  lookSensitivity: 1,
  invertY: false,
  dayLength: DEFAULT_DAY_LENGTH,
  alwaysRain: false,
};

export interface SettingsOptions {
  seed: number;
  /** When true, show touch control copy instead of keyboard/mouse. */
  touchMode?: boolean;
  onApply: (v: SettingsValues) => void;
  onOpenChange: (open: boolean) => void;
}

export function seedName(seed: number): string {
  return (seed >>> 0).toString(16).padStart(8, "0").toUpperCase();
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function sliderField(
  id: string,
  label: string,
  quieter: string,
  louder: string,
  initial: string,
  range: { min: number; max: number; step: number } = {
    min: 0,
    max: 100,
    step: 5,
  },
): string {
  return `
    <div class="set-field">
      <div class="set-field-head">
        <label class="set-label" for="${id}">${label}</label>
        <output class="set-value" id="${id}-out" for="${id}">${initial}</output>
      </div>
      <div class="set-slider">
        <button type="button" class="set-step" data-step="-1" data-for="${id}">
          <span aria-hidden="true">−</span><span class="set-sr">${quieter}</span>
        </button>
        <input class="set-range" id="${id}" type="range"
               min="${range.min}" max="${range.max}" step="${range.step}">
        <button type="button" class="set-step" data-step="1" data-for="${id}">
          <span aria-hidden="true">+</span><span class="set-sr">${louder}</span>
        </button>
      </div>
    </div>`;
}

type SettingsScreen = "sound" | "controls" | "gameplay" | "island";

const SCREENS: readonly {
  id: SettingsScreen;
  label: string;
  shortLabel: string;
}[] = [
  { id: "island", label: "This island", shortLabel: "Island" },
  { id: "sound", label: "Sound", shortLabel: "Sound" },
  { id: "controls", label: "Controls", shortLabel: "Controls" },
  { id: "gameplay", label: "Gameplay", shortLabel: "Play" },
];

const COMPACT_MQ = "(max-width: 40rem), (max-height: 32rem)";

/** Look-sensitivity slider: percent of the default feel (25%..200%). */
const LOOK_RANGE = { min: 25, max: 200, step: 5 } as const;

/** Day length slider in whole minutes (matches DayCycle clamp). */
const DAY_RANGE = {
  min: MIN_DAY_LENGTH / 60,
  max: MAX_DAY_LENGTH / 60,
  step: 1,
} as const;

function formatDayMinutes(mins: number): string {
  return `${mins} min`;
}

function speakDayMinutes(mins: number): string {
  return `${mins} minute${mins === 1 ? "" : "s"}`;
}

const MARKUP = `
<div class="set-scrim" data-set-dismiss></div>
<div class="set-panel" role="dialog" aria-modal="true" aria-labelledby="set-title">
  <div class="set-head">
    <div class="set-head-copy">
      <h2 class="set-title" id="set-title" tabindex="-1">Settings</h2>
      <p class="set-hint" id="set-hint">Press <kbd>Esc</kbd> to open or close this menu.</p>
    </div>
    <button type="button" class="set-x" id="set-close">
      <span aria-hidden="true">✕</span><span class="set-sr">Close settings</span>
    </button>
  </div>

  <div class="set-shell">
    <nav class="set-nav" aria-label="Settings categories">
      <div class="set-tabs" role="tablist" aria-orientation="vertical" id="set-tabs">
        ${SCREENS.map(
          (s, i) => `
          <button
            type="button"
            class="set-tab"
            role="tab"
            id="set-tab-${s.id}"
            data-screen="${s.id}"
            aria-controls="set-pane-${s.id}"
            aria-selected="${i === 0 ? "true" : "false"}"
            tabindex="${i === 0 ? "0" : "-1"}"
          ><span class="set-tab-full">${s.label}</span><span class="set-tab-short">${s.shortLabel}</span></button>`,
        ).join("")}
      </div>
    </nav>

    <div class="set-main">
      <section
        class="set-pane"
        role="tabpanel"
        id="set-pane-island"
        aria-labelledby="set-tab-island"
        tabindex="0"
      >
        <h3 class="set-h" id="set-h-island">This island</h3>
        <p class="set-note" id="set-seed-help">
          Every island grows from a single number. Start a new one whenever you like.
        </p>
        <div class="set-field">
          <label class="set-label" for="set-seed">Island seed</label>
          <input class="set-input" id="set-seed" type="text" readonly spellcheck="false"
                 autocomplete="off" aria-describedby="set-seed-help">
        </div>
        <div class="set-btn-row">
          <button type="button" class="set-btn" id="set-new">New island</button>
        </div>
      </section>

      <section
        class="set-pane"
        role="tabpanel"
        id="set-pane-sound"
        aria-labelledby="set-tab-sound"
        tabindex="0"
        hidden
      >
        <h3 class="set-h" id="set-h-sound">Sound</h3>
        <p class="set-note">
          Levels apply for this visit only. Closing the tab starts fresh.
        </p>
        ${sliderField("set-master", "Master", "Quieter", "Louder", "80%")}
        ${sliderField("set-music", "Music", "Quieter music", "Louder music", "100%")}
        ${sliderField("set-sfx", "Effects", "Quieter effects", "Louder effects", "100%")}
        <label class="set-check" for="set-muted">
          <input type="checkbox" id="set-muted">
          <span class="set-box" aria-hidden="true"></span>
          <span class="set-check-text">Mute</span>
        </label>
      </section>

      <section
        class="set-pane"
        role="tabpanel"
        id="set-pane-controls"
        aria-labelledby="set-tab-controls"
        tabindex="0"
        hidden
      >
        <h3 class="set-h" id="set-h-controls">Controls</h3>
        <p class="set-note">
          How looking around feels. Changes apply straight away, for this visit only.
        </p>
        ${sliderField(
          "set-look",
          "Look sensitivity",
          "Slower look",
          "Faster look",
          "100%",
          LOOK_RANGE,
        )}
        <label class="set-check" for="set-invert-y">
          <input type="checkbox" id="set-invert-y">
          <span class="set-box" aria-hidden="true"></span>
          <span class="set-check-text">Invert vertical look</span>
        </label>

        <h4 class="set-subh" id="set-h-keys">On the island</h4>
        <ul class="set-keys" id="set-keys" aria-labelledby="set-h-keys">
          <li><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrows — walk</li>
          <li><kbd>Shift</kbd> — stroll</li>
          <li><kbd>Space</kbd> — take to the air as a raven</li>
          <li>Click — look around</li>
          <li><kbd>Esc</kbd> — open or close this menu</li>
        </ul>

        <h4 class="set-subh" id="set-h-wing">On the wing</h4>
        <ul class="set-keys" id="set-wing" aria-labelledby="set-h-wing">
          <li><kbd>Space</kbd> — beat your wings and climb</li>
          <li>Look — where you point is where you go; dive to gather speed</li>
          <li><kbd>W</kbd> <kbd>S</kbd> — tuck or spread; <kbd>A</kbd> <kbd>D</kbd> — bank</li>
          <li><kbd>Shift</kbd> — fold your wings and stoop</li>
          <li>Let go and come down on land to walk again</li>
        </ul>
      </section>

      <section
        class="set-pane"
        role="tabpanel"
        id="set-pane-gameplay"
        aria-labelledby="set-tab-gameplay"
        tabindex="0"
        hidden
      >
        <h3 class="set-h" id="set-h-gameplay">Gameplay</h3>
        <p class="set-note">
          Changes apply straight away, for this visit only.
        </p>
        ${sliderField(
          "set-day",
          "Day length",
          "Shorter day",
          "Longer day",
          formatDayMinutes(DEFAULT_DAY_LENGTH / 60),
          DAY_RANGE,
        )}
        <label class="set-check" for="set-always-rain">
          <input type="checkbox" id="set-always-rain">
          <span class="set-box" aria-hidden="true"></span>
          <span class="set-check-text">Always rain</span>
        </label>
      </section>
    </div>
  </div>

  <div class="set-foot">
    <p class="set-status" id="set-status" role="status" aria-live="polite"></p>
    <button type="button" class="set-btn set-btn-go" id="set-done">Back to the island</button>
  </div>
</div>
`;

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

const BUS_KEYS = ["master", "music", "sfx"] as const;

export class SettingsMenu {
  private root: HTMLElement;
  private panel: HTMLElement;
  private status: HTMLElement;
  private values: SettingsValues;
  private opts: SettingsOptions;
  private open = false;
  private returnFocus: HTMLElement | null = null;
  private newIslandArmed = 0;
  private statusTimer = 0;
  private screen: SettingsScreen = "island";

  constructor(root: HTMLElement, opts: SettingsOptions) {
    this.opts = opts;
    this.root = root;
    this.values = { ...DEFAULT_SETTINGS };
    root.innerHTML = MARKUP;
    this.panel = this.$(".set-panel");
    this.status = this.$("#set-status");

    this.input("set-seed").value = seedName(opts.seed);
    this.applyInputModeCopy();
    this.bind();
    this.syncTabOrientation();
    this.syncControls();
    this.opts.onApply(this.values);
  }

  setTouchMode(on: boolean): void {
    this.opts.touchMode = on;
    this.applyInputModeCopy();
  }

  private applyInputModeCopy(): void {
    if (!this.opts.touchMode) {
      this.$("#set-hint").innerHTML =
        "Press <kbd>Esc</kbd> to open or close this menu.";
      this.$("#set-keys").innerHTML = `
          <li><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> or arrows — walk</li>
          <li><kbd>Shift</kbd> — stroll</li>
          <li><kbd>Space</kbd> — take to the air as a raven</li>
          <li>Click — look around</li>
          <li><kbd>Esc</kbd> — open or close this menu</li>`;
      this.$("#set-wing").innerHTML = `
          <li><kbd>Space</kbd> — beat your wings and climb</li>
          <li>Look — where you point is where you go; dive to gather speed</li>
          <li><kbd>W</kbd> <kbd>S</kbd> — tuck or spread; <kbd>A</kbd> <kbd>D</kbd> — bank</li>
          <li><kbd>Shift</kbd> — fold your wings and stoop</li>
          <li>Let go and come down on land to walk again</li>`;
      return;
    }
    this.$("#set-hint").textContent =
      "Tap Pause to open or close this menu.";
    this.$("#set-keys").innerHTML = `
      <li>Left side — drag to walk (stick appears under your thumb)</li>
      <li>Drag elsewhere — look around</li>
      <li>Fly — hold to take off, and to beat your wings</li>
      <li>Pause — open or close this menu</li>`;
    this.$("#set-wing").innerHTML = `
      <li>Fly — hold to climb, let go to glide down</li>
      <li>Drag to look; where you point is where you go</li>
      <li>Stick — tuck, spread and bank</li>
      <li>Come down on land to walk again</li>`;
  }

  get current(): SettingsValues {
    return { ...this.values };
  }

  get isOpen(): boolean {
    return this.open;
  }

  show(): void {
    if (this.open) return;
    this.open = true;
    const active = document.activeElement;
    this.returnFocus = active instanceof HTMLElement ? active : null;
    this.root.classList.remove("hidden");
    document.body.classList.add("settings-open");
    document.getElementById("footer-links")?.toggleAttribute("inert", true);
    this.setStatus("");
    this.selectScreen(this.screen, { focusTab: false });
    this.$("#set-title").focus({ preventScroll: true });
    this.opts.onOpenChange(true);
  }

  hide(): void {
    if (!this.open) return;
    this.open = false;
    this.root.classList.add("hidden");
    document.body.classList.remove("settings-open");
    document.getElementById("footer-links")?.toggleAttribute("inert", false);
    this.disarmNewIsland();
    this.opts.onOpenChange(false);
    if (this.returnFocus?.isConnected) this.returnFocus.focus({ preventScroll: true });
    this.returnFocus = null;
  }

  toggle(): void {
    if (this.open) this.hide();
    else this.show();
  }

  private bind(): void {
    this.$("#set-close").addEventListener("click", () => this.hide());
    this.$("#set-done").addEventListener("click", () => this.hide());
    this.$(".set-scrim").addEventListener("click", () => this.hide());

    this.panel.addEventListener("click", (e) => {
      const a = (e.target as HTMLElement).closest?.("a");
      if (a instanceof HTMLAnchorElement) this.hide();
    });

    this.panel.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        this.hide();
      } else if (e.key === "Tab") {
        this.trapTab(e);
      }
    });

    const tabs = this.$("#set-tabs");
    tabs.addEventListener("click", (e) => {
      const tab = (e.target as HTMLElement).closest<HTMLButtonElement>(".set-tab");
      if (!tab || !tabs.contains(tab)) return;
      const id = tab.dataset.screen as SettingsScreen | undefined;
      if (!id) return;
      this.selectScreen(id, { focusTab: true });
    });
    tabs.addEventListener("keydown", (e) => this.onTabKeydown(e));

    window.matchMedia(COMPACT_MQ).addEventListener("change", () => {
      this.syncTabOrientation();
    });

    for (const key of BUS_KEYS) {
      this.range(`set-${key}`, (n) => {
        this.values[key] = n / 100;
        return `${n}%`;
      }, (n) => `${n} percent`);
    }

    this.range(
      "set-look",
      (n) => {
        this.values.lookSensitivity = n / 100;
        return `${n}%`;
      },
      (n) => `${n} percent`,
    );

    this.range(
      "set-day",
      (n) => {
        this.values.dayLength = n * 60;
        return formatDayMinutes(n);
      },
      speakDayMinutes,
    );

    this.check("set-muted", (on) => {
      this.values.muted = on;
    });

    this.check("set-invert-y", (on) => {
      this.values.invertY = on;
    });

    this.check("set-always-rain", (on) => {
      this.values.alwaysRain = on;
    });

    for (const btn of this.panel.querySelectorAll<HTMLButtonElement>(".set-step")) {
      btn.addEventListener("click", () => {
        const input = this.input(btn.dataset.for ?? "");
        const step = Number(input.step || 1) * Number(btn.dataset.step ?? 1);
        input.value = String(
          clamp(Number(input.value) + step, Number(input.min), Number(input.max)),
        );
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }

    const newBtn = this.$("#set-new") as HTMLButtonElement;
    newBtn.addEventListener("click", () => {
      if (this.newIslandArmed) {
        window.clearTimeout(this.newIslandArmed);
        this.newIslandArmed = 0;
        location.href = `${location.origin}${location.pathname}`;
        return;
      }
      newBtn.textContent = "Click again to leave";
      newBtn.classList.add("set-btn-armed");
      this.setStatus("This island will be replaced. Click again to confirm.");
      this.newIslandArmed = window.setTimeout(() => this.disarmNewIsland(), 6000);
    });
  }

  private selectScreen(
    id: SettingsScreen,
    opts: { focusTab: boolean },
  ): void {
    this.screen = id;
    if (id !== "island") this.disarmNewIsland();

    for (const screen of SCREENS) {
      const tab = this.$(`#set-tab-${screen.id}`) as HTMLButtonElement;
      const pane = this.$(`#set-pane-${screen.id}`);
      const active = screen.id === id;
      tab.setAttribute("aria-selected", active ? "true" : "false");
      tab.tabIndex = active ? 0 : -1;
      tab.classList.toggle("is-active", active);
      pane.toggleAttribute("hidden", !active);
    }

    this.syncTabOrientation();
    if (opts.focusTab) {
      (this.$(`#set-tab-${id}`) as HTMLButtonElement).focus({ preventScroll: true });
    }
  }

  private syncTabOrientation(): void {
    const tabs = this.$("#set-tabs");
    const horizontal = window.matchMedia(COMPACT_MQ).matches;
    tabs.setAttribute("aria-orientation", horizontal ? "horizontal" : "vertical");
  }

  private onTabKeydown(e: KeyboardEvent): void {
    const tabs = Array.from(
      this.panel.querySelectorAll<HTMLButtonElement>(".set-tab"),
    );
    if (tabs.length === 0) return;
    const current = document.activeElement;
    const i = tabs.indexOf(current as HTMLButtonElement);
    if (i < 0) return;

    const horizontal =
      this.$("#set-tabs").getAttribute("aria-orientation") === "horizontal";
    const prevKey = horizontal ? "ArrowLeft" : "ArrowUp";
    const nextKey = horizontal ? "ArrowRight" : "ArrowDown";

    let next = -1;
    if (e.key === prevKey) next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === nextKey) next = (i + 1) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;

    e.preventDefault();
    const id = tabs[next].dataset.screen as SettingsScreen;
    this.selectScreen(id, { focusTab: true });
  }

  private disarmNewIsland(): void {
    if (this.newIslandArmed) window.clearTimeout(this.newIslandArmed);
    this.newIslandArmed = 0;
    const btn = this.$("#set-new");
    btn.textContent = "New island";
    btn.classList.remove("set-btn-armed");
    if (this.status.textContent.startsWith("This island will be replaced")) {
      this.setStatus("");
    }
  }

  private range(
    id: string,
    set: (n: number) => string,
    speak: (n: number) => string,
  ): void {
    const input = this.input(id);
    const out = this.$(`#${id}-out`);
    input.addEventListener("input", () => {
      const n = Number(input.value);
      out.textContent = set(n);
      input.setAttribute("aria-valuetext", speak(n));
      this.paintFill(input);
      this.commit();
    });
  }

  private check(id: string, set: (on: boolean) => void): void {
    const input = this.input(id);
    input.addEventListener("change", () => {
      set(input.checked);
      this.commit();
    });
  }

  private paintFill(input: HTMLInputElement): void {
    const min = Number(input.min) || 0;
    const max = Number(input.max) || 100;
    const pct = ((Number(input.value) - min) / (max - min)) * 100;
    input.style.setProperty("--fill", `${pct}%`);
  }

  private syncControls(): void {
    for (const key of BUS_KEYS) {
      const n = Math.round(this.values[key] * 100);
      const input = this.input(`set-${key}`);
      input.value = String(n);
      input.setAttribute("aria-valuetext", `${n} percent`);
      this.$(`#set-${key}-out`).textContent = `${n}%`;
      this.paintFill(input);
    }

    const lookPct = Math.round(this.values.lookSensitivity * 100);
    const look = this.input("set-look");
    look.value = String(clamp(lookPct, LOOK_RANGE.min, LOOK_RANGE.max));
    look.setAttribute("aria-valuetext", `${lookPct} percent`);
    this.$("#set-look-out").textContent = `${lookPct}%`;
    this.paintFill(look);

    const dayMins = Math.round(this.values.dayLength / 60);
    const day = this.input("set-day");
    day.value = String(clamp(dayMins, DAY_RANGE.min, DAY_RANGE.max));
    day.setAttribute("aria-valuetext", speakDayMinutes(dayMins));
    this.$("#set-day-out").textContent = formatDayMinutes(dayMins);
    this.paintFill(day);

    this.input("set-muted").checked = this.values.muted;
    this.input("set-invert-y").checked = this.values.invertY;
    this.input("set-always-rain").checked = this.values.alwaysRain;
  }

  private commit(): void {
    this.opts.onApply(this.values);
  }

  private setStatus(msg: string): void {
    if (this.statusTimer) window.clearTimeout(this.statusTimer);
    this.status.textContent = msg;
    if (!msg) return;
    this.statusTimer = window.setTimeout(() => {
      this.status.textContent = "";
    }, 6000);
  }

  private trapTab(e: KeyboardEvent): void {
    const items = Array.from(this.panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => !el.closest("[hidden]") && (el.offsetWidth > 0 || el.offsetHeight > 0),
    );
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === this.$("#set-title"))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  private $(sel: string): HTMLElement {
    const el = this.root.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`settings: missing ${sel}`);
    return el;
  }

  private input(id: string): HTMLInputElement {
    const el = this.root.querySelector<HTMLInputElement>(`#${id}`);
    if (!el) throw new Error(`settings: missing input #${id}`);
    return el;
  }
}
