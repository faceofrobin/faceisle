/** First-paint island loader: progress updates + fade-out when ready. */

function $(id: string): HTMLElement | null {
  return document.getElementById(id);
}

export function yieldFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

/** Two frames so layout/paint can flush before a heavy sync step. */
export async function yieldPaint(): Promise<void> {
  await yieldFrame();
  await yieldFrame();
}

export class BootScreen {
  private root: HTMLElement;
  private label: HTMLElement;
  private fill: HTMLElement;
  private value = 0;

  constructor() {
    const root = $("boot");
    const label = $("boot-label");
    const fill = $("boot-fill");
    if (!root || !label || !fill) {
      throw new Error("missing #boot loader markup");
    }
    this.root = root;
    this.label = label;
    this.fill = fill;
    this.root.classList.add("is-live");
  }

  /**
   * @param progress 0..1
   * @param label status copy
   * @param heavy when true, bar eases toward the value slowly (covers a
   *   long sync constructor while CSS keeps animating)
   */
  set(progress: number, label?: string, heavy = false): void {
    this.value = Math.min(1, Math.max(this.value, progress));
    this.root.classList.toggle("is-heavy", heavy);
    this.fill.style.width = `${Math.round(this.value * 100)}%`;
    if (label) this.label.textContent = label;
  }

  async finish(): Promise<void> {
    this.set(1, "Ready");
    this.root.classList.remove("is-heavy");
    await yieldPaint();
    this.root.classList.add("is-done");
    this.root.setAttribute("aria-busy", "false");
    document.body.classList.add("ready");
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, 560);
    });
    this.root.remove();
  }
}
