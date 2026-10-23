import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Autosaver } from "./autosaver";

const DELAY = 1000;

interface Draft {
  title: string;
  content: string;
}

/** A save that stays pending until the test settles it, to control how saves overlap. */
function deferredSave() {
  const calls: Draft[] = [];
  const settle: Array<(result: { error?: string }) => void> = [];
  const save = (draft: Draft) => {
    calls.push(draft);
    return new Promise<{ error?: string }>((resolve) => settle.push(resolve));
  };
  return { calls, settle, save };
}

function setup(options: { canSave?: (draft: Draft) => boolean } = {}) {
  const saves = deferredSave();
  const initial: Draft = { title: "Notes", content: "" };
  const autosaver = new Autosaver<Draft>({
    initial,
    save: saves.save,
    delayMs: DELAY,
    equals: (a, b) => a.title === b.title && a.content === b.content,
    ...options,
  });
  return { autosaver, ...saves, initial };
}

describe("Autosaver", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("saves the latest value once typing pauses", async () => {
    const { autosaver, calls, settle } = setup();

    autosaver.change({ title: "Notes", content: "Hel" });
    autosaver.change({ title: "Notes", content: "Hello" });
    expect(autosaver.status).toEqual({ state: "unsaved" });
    expect(calls).toEqual([]);

    await vi.advanceTimersByTimeAsync(DELAY);
    expect(calls).toEqual([{ title: "Notes", content: "Hello" }]);
    expect(autosaver.status).toEqual({ state: "saving" });

    settle[0]?.({});
    await vi.advanceTimersByTimeAsync(0);
    expect(autosaver.status).toEqual({ state: "saved" });
  });

  it("never runs two saves at once, and saves what was typed meanwhile afterwards", async () => {
    const { autosaver, calls, settle } = setup();
    autosaver.change({ title: "Notes", content: "A" });
    await vi.advanceTimersByTimeAsync(DELAY);

    autosaver.change({ title: "Notes", content: "AB" });
    await vi.advanceTimersByTimeAsync(DELAY);
    expect(calls).toHaveLength(1);

    settle[0]?.({});
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toEqual([
      { title: "Notes", content: "A" },
      { title: "Notes", content: "AB" },
    ]);

    settle[1]?.({});
    await vi.advanceTimersByTimeAsync(0);
    expect(autosaver.status).toEqual({ state: "saved" });
  });

  it("keeps the change and reports the error when a save fails, then retries on flush", async () => {
    const { autosaver, calls, settle } = setup();
    autosaver.change({ title: "Notes", content: "A" });
    await vi.advanceTimersByTimeAsync(DELAY);

    settle[0]?.({ error: "Something went wrong." });
    await vi.advanceTimersByTimeAsync(0);
    expect(autosaver.status).toEqual({ state: "error", error: "Something went wrong." });

    const flushed = autosaver.flush();
    expect(calls).toHaveLength(2);
    settle[1]?.({});
    await flushed;
    expect(autosaver.status).toEqual({ state: "saved" });
  });

  it("saves right away on flush, without waiting for the pause", async () => {
    const { autosaver, calls, settle } = setup();
    autosaver.change({ title: "Notes", content: "A" });

    const flushed = autosaver.flush();
    expect(calls).toEqual([{ title: "Notes", content: "A" }]);

    settle[0]?.({});
    await flushed;
    expect(autosaver.status).toEqual({ state: "saved" });
  });

  it("does not save when the value goes back to what is already saved", async () => {
    const { autosaver, calls, initial } = setup();
    autosaver.change({ title: "Notes", content: "A" });
    autosaver.change(initial);

    await vi.advanceTimersByTimeAsync(DELAY);

    expect(calls).toEqual([]);
    expect(autosaver.status).toEqual({ state: "saved" });
  });

  it("does not save a value the server would refuse, such as an empty title", async () => {
    const { autosaver, calls } = setup({ canSave: (draft) => draft.title.trim() !== "" });
    autosaver.change({ title: "", content: "A" });

    await vi.advanceTimersByTimeAsync(DELAY);

    expect(calls).toEqual([]);
    expect(autosaver.status).toEqual({ state: "unsaved" });
  });

  it("tells listeners about each status change", async () => {
    const { autosaver, settle } = setup();
    const seen: string[] = [];
    autosaver.subscribe(() => seen.push(autosaver.status.state));

    autosaver.change({ title: "Notes", content: "A" });
    await vi.advanceTimersByTimeAsync(DELAY);
    settle[0]?.({});
    await vi.advanceTimersByTimeAsync(0);

    expect(seen).toEqual(["unsaved", "saving", "saved"]);
  });
});
