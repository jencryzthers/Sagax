// Pure duplex turn policy: barge-in cancels the active turn (speaking or
// thinking), flag off keeps today's steer-while-thinking behavior.
import { describe, expect, it } from "vitest";

import { bargeInEffects, thinkingCueMs } from "./duplex-policy";

describe("duplex barge-in policy", () => {
  it("duplex barge-in while the bot is thinking cancels and interrupts", () => {
    expect(bargeInEffects({ duplex: true, botBusy: true, botAudible: false })).toBe("cancel-and-interrupt");
  });

  it("flag off while thinking does not interrupt", () => {
    expect(bargeInEffects({ duplex: false, botBusy: true, botAudible: false })).toBe("none");
  });

  it("duplex barge-in while speaking cancels and interrupts", () => {
    expect(bargeInEffects({ duplex: true, botBusy: true, botAudible: true })).toBe("cancel-and-interrupt");
  });

  it("flag off while speaking still cancels and interrupts", () => {
    expect(bargeInEffects({ duplex: false, botBusy: true, botAudible: true })).toBe("cancel-and-interrupt");
  });

  it("speaking after the turn finished only drops remaining speech", () => {
    expect(bargeInEffects({ duplex: true, botBusy: false, botAudible: true })).toBe("cancel-speech-only");
    expect(bargeInEffects({ duplex: false, botBusy: false, botAudible: true })).toBe("cancel-speech-only");
  });

  it("idle listening is not a barge-in", () => {
    expect(bargeInEffects({ duplex: true, botBusy: false, botAudible: false })).toBe("none");
    expect(bargeInEffects({ duplex: false, botBusy: false, botAudible: false })).toBe("none");
  });

  it("thinking cue is 400 ms when duplex, 1200 ms otherwise", () => {
    expect(thinkingCueMs(true)).toBe(400);
    expect(thinkingCueMs(false)).toBe(1200);
  });
});
