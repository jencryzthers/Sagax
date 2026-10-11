import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("react", () => ({
  useSyncExternalStore: (
    _subscribe: (listener: () => void) => () => void,
    snapshot: () => boolean,
  ) => snapshot(),
}));

function memoryStorage(initial?: Record<string, string>) {
  const values = new Map(Object.entries(initial ?? {}));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal("window", new EventTarget());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("unready providers preference", () => {
  it("is off when unset", async () => {
    vi.stubGlobal("localStorage", memoryStorage());
    const preference = await import("./unready-providers-preference");
    expect(preference.useShowUnreadyProviders()).toBe(false);
  });

  it("turns on only for a stored 1", async () => {
    vi.stubGlobal("localStorage", memoryStorage({ "omb-show-unready-providers": "1" }));
    const preference = await import("./unready-providers-preference");
    expect(preference.useShowUnreadyProviders()).toBe(true);
  });

  it("persists on and off", async () => {
    const storage = memoryStorage();
    vi.stubGlobal("localStorage", storage);
    const preference = await import("./unready-providers-preference");
    preference.setShowUnreadyProviders(true);
    expect(storage.getItem("omb-show-unready-providers")).toBe("1");
    expect(preference.useShowUnreadyProviders()).toBe(true);
    preference.setShowUnreadyProviders(false);
    expect(storage.getItem("omb-show-unready-providers")).toBe("0");
    expect(preference.useShowUnreadyProviders()).toBe(false);
  });
});
