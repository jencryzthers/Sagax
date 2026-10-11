import { describe, expect, it } from "vitest";

import type { Message } from "@/state/store";
import { isAppleMobileWebClient, isToolActivityRow, showToolCallRows } from "./tool-activity-rows";

const chip = (partial: Partial<Message>): Message => ({
  id: "m",
  role: "bot",
  kind: "activity",
  at: 1,
  tool: { name: "Read", ok: true },
  ...partial,
});

describe("isAppleMobileWebClient", () => {
  it("detects iPhone, iPad, iPadOS-as-Mac and Capacitor iOS", () => {
    expect(isAppleMobileWebClient({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe(true);
    expect(isAppleMobileWebClient({ userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)" })).toBe(true);
    expect(isAppleMobileWebClient({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 5 })).toBe(true);
    expect(isAppleMobileWebClient({ capacitorPlatform: "ios" })).toBe(true);
  });

  it("leaves desktop Electron and desktop Safari alone", () => {
    expect(isAppleMobileWebClient({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)", maxTouchPoints: 0 })).toBe(false);
    expect(isAppleMobileWebClient({
      userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      electron: true,
    })).toBe(false);
    expect(isAppleMobileWebClient({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" })).toBe(false);
  });
});

describe("isToolActivityRow", () => {
  it("counts running, success and error receipts, and nothing else", () => {
    expect(isToolActivityRow(chip({ tool: { name: "Bash" } }))).toBe(true);
    expect(isToolActivityRow(chip({ tool: { name: "Read", ok: true } }))).toBe(true);
    expect(isToolActivityRow(chip({ tool: { name: "Write", ok: false } }))).toBe(true);
    expect(isToolActivityRow(chip({ tool: { name: "notice: waiting", ok: true } }))).toBe(false);
    expect(isToolActivityRow(chip({ tool: { name: "recovery: backup", ok: true } }))).toBe(false);
    expect(isToolActivityRow(chip({ tool: { name: "error: boom", ok: false } }))).toBe(false);
    expect(isToolActivityRow(chip({
      tool: { name: "Parallel task" },
      parallelTask: { threadId: "p", title: "T", requestMessageId: "r", role: "card" },
    }))).toBe(false);
    expect(isToolActivityRow(chip({
      tool: { name: "Messaged @Ada" },
      comm: { groupId: "g", withBotId: "ada", withName: "Ada", withColor: "teal" },
    }))).toBe(false);
    expect(isToolActivityRow(chip({
      tool: { name: "Opened thread" },
      threadRef: { botId: "b", threadId: "t", title: "Opened" },
    }))).toBe(false);
    expect(isToolActivityRow({ id: "t", role: "bot", kind: "text", at: 1, text: "hi" })).toBe(false);
  });
});

describe("showToolCallRows", () => {
  const on = { features: { showToolCalls: true } };
  const ios = { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" };

  it("follows the server flag on desktop and forces off on iOS", () => {
    expect(showToolCallRows(on, { userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" })).toBe(true);
    expect(showToolCallRows(on, ios)).toBe(false);
    expect(showToolCallRows({}, ios)).toBe(false);
    expect(showToolCallRows(on, { ...ios, electron: true })).toBe(true);
  });
});
