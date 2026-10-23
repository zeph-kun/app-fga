export type AutosaveStatus =
  | { readonly state: "saved" | "unsaved" | "saving" }
  | { readonly state: "error"; readonly error: string };

interface Options<T> {
  /** What the server already has. */
  readonly initial: T;
  /** Saves a value; answers with an error message when it fails. */
  readonly save: (value: T) => Promise<{ readonly error?: string }>;
  /** How long typing must pause before a save starts. */
  readonly delayMs: number;
  readonly equals: (a: T, b: T) => boolean;
  /** Values the server would refuse (an empty title) wait for a fix instead of failing. */
  readonly canSave?: (value: T) => boolean;
}

/**
 * Saves a value shortly after it stops changing, one save at a time. A change made while a save
 * is running is saved right after it, so the last thing typed is never lost or overwritten.
 */
export class Autosaver<T> {
  private saved: T;
  private latest: T;
  private current: AutosaveStatus = { state: "saved" };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly options: Options<T>) {
    this.saved = options.initial;
    this.latest = options.initial;
  }

  get status(): AutosaveStatus {
    return this.current;
  }

  /** Calls `listener` whenever the status changes; returns a function that stops it. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  change(value: T): void {
    this.latest = value;
    clearTimeout(this.timer);
    this.timer = undefined;

    if (this.options.equals(value, this.saved)) {
      if (!this.running) this.set({ state: "saved" });
      return;
    }
    if (!this.running) this.set({ state: "unsaved" });
    if (this.options.canSave?.(value) === false) return;
    this.timer = setTimeout(() => void this.run(), this.options.delayMs);
  }

  /** Saves now whatever is waiting, and resolves once nothing is left to save (or a save failed). */
  flush(): Promise<void> {
    clearTimeout(this.timer);
    this.timer = undefined;
    return this.run();
  }

  private run(): Promise<void> {
    this.running ??= this.drain().finally(() => {
      this.running = undefined;
    });
    return this.running;
  }

  private async drain(): Promise<void> {
    while (!this.options.equals(this.latest, this.saved) && this.options.canSave?.(this.latest) !== false) {
      const value = this.latest;
      this.set({ state: "saving" });
      let error: string | undefined;
      try {
        error = (await this.options.save(value)).error;
      } catch {
        error = "Something went wrong. Try again.";
      }
      if (error !== undefined) {
        this.set({ state: "error", error });
        return;
      }
      this.saved = value;
    }
    this.set({ state: this.options.equals(this.latest, this.saved) ? "saved" : "unsaved" });
  }

  private set(next: AutosaveStatus): void {
    const same = next.state === this.current.state && (next.state !== "error" || (this.current.state === "error" && next.error === this.current.error));
    if (same) return;
    this.current = next;
    for (const listener of this.listeners) listener();
  }
}
