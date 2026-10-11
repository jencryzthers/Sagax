// Internal / TestFlight / dev hear full-duplex by default (issue #292,
// Cryptic review). A public App Store / SAGAX_PUBLIC_RELEASE build stays
// off. The Advanced toggle is the kill-switch.
import { describe, expect, it } from "vitest";

import { defaultFullDuplex, FULL_DUPLEX_REV } from "./voice-build";
import { cleanCallSettings, DEFAULT_CALL_SETTINGS } from "./call-settings";

describe("defaultFullDuplex", () => {
  it("is on for internal, TestFlight and dev builds", () => {
    expect(defaultFullDuplex({ dev: true })).toBe(true);
    expect(defaultFullDuplex({ testFlight: true })).toBe(true);
    expect(defaultFullDuplex()).toBe(true);
  });

  it("is off only for a public release channel", () => {
    expect(defaultFullDuplex({ publicRelease: true })).toBe(false);
    expect(defaultFullDuplex({ publicRelease: true, dev: true })).toBe(false);
    expect(defaultFullDuplex({ publicRelease: true, testFlight: true })).toBe(false);
  });
});

describe("CallSettings.fullDuplex default", () => {
  it("is on in this tree so JC hears it, with a kill-switch that persists", () => {
    expect(DEFAULT_CALL_SETTINGS.fullDuplex).toBe(true);
    expect(FULL_DUPLEX_REV).toBe(2);
    expect(cleanCallSettings({ input: "auto", pause: "short" }).fullDuplex).toBe(true);
    expect(cleanCallSettings({ fullDuplex: true, fullDuplexRev: 2 }).fullDuplex).toBe(true);
    expect(cleanCallSettings({ fullDuplex: false, fullDuplexRev: 2 }).fullDuplex).toBe(false);
  });

  it("treats a stored false from the old default-off commit as stale", () => {
    expect(cleanCallSettings({ fullDuplex: false }).fullDuplex).toBe(true);
    expect(cleanCallSettings({ fullDuplex: false, fullDuplexRev: 1 }).fullDuplex).toBe(true);
    expect(cleanCallSettings({ fullDuplex: "yes" }).fullDuplex).toBe(true);
  });
});
