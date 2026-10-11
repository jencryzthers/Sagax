import { mkdtempSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { removeTempDir } from "../../testing/cleanup.ts";
import {
  GROK_KNOWN_TOOLS_MAX, GROK_KNOWN_TOOLS_SECTION, knownGrokTools, knownGrokToolsSection,
  recordGrokToolUse, resetGrokToolUsageCache, useToolName,
} from "./grok-tool-usage.ts";
import { grokStallRetryMs } from "./grok.ts";

describe("grok tool usage", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "grok-tools-"));
    resetGrokToolUsageCache();
  });
  afterEach(() => removeTempDir(dir));

  it("reads the use_tool target and nothing else", () => {
    expect(useToolName({ tool_name: "agents__act", tool_input: { secret: "x" } })).toBe("agents__act");
    expect(useToolName({ query: "date" })).toBeNull();
    expect(useToolName({ tool_name: "no-separator" })).toBeNull();
    expect(useToolName({ tool_name: "a__b; rm -rf /" })).toBeNull();
    expect(useToolName(null)).toBeNull();
  });

  it("names the bot's most-used tools of mounted servers, alphabetically, and persists them", () => {
    for (let i = 0; i < 3; i++) recordGrokToolUse("bot-1", "sagax-environment__run_command", dir);
    recordGrokToolUse("bot-1", "agents__workspace_read", dir);
    recordGrokToolUse("bot-1", "cw_psa__query", dir);
    recordGrokToolUse("bot-2", "agents__act", dir);
    expect(knownGrokTools("bot-1", ["agents", "sagax-environment"], dir))
      .toEqual(["agents__workspace_read", "sagax-environment__run_command"]);
    resetGrokToolUsageCache();
    expect(knownGrokTools("bot-1", ["agents", "sagax-environment", "cw_psa"], dir))
      .toEqual(["agents__workspace_read", "cw_psa__query", "sagax-environment__run_command"]);
    expect(knownGrokTools("bot-2", ["agents"], dir)).toEqual(["agents__act"]);
    expect(knownGrokTools(undefined, ["agents"], dir)).toEqual([]);
    expect(readdirSync(join(dir, "grok-tool-usage"))).toHaveLength(2);
  });

  it("caps the list and keeps the most used", () => {
    for (let i = 0; i < GROK_KNOWN_TOOLS_MAX + 5; i++) {
      for (let n = 0; n <= i; n++) recordGrokToolUse("bot", `agents__tool_${String(i).padStart(2, "0")}`, dir);
    }
    const tools = knownGrokTools("bot", ["agents"], dir);
    expect(tools).toHaveLength(GROK_KNOWN_TOOLS_MAX);
    expect(tools).not.toContain("agents__tool_00");
    expect(tools).toContain(`agents__tool_${GROK_KNOWN_TOOLS_MAX + 4}`);
  });

  it("builds one context section, or none", () => {
    expect(knownGrokToolsSection([])).toBeNull();
    const section = knownGrokToolsSection(["agents__act", "cw_psa__query"]);
    expect(section?.id).toBe(GROK_KNOWN_TOOLS_SECTION);
    expect(section?.text).toContain("agents__act, cw_psa__query");
    expect(section?.text).toContain("without search_tool");
  });

  it("reads the stall retry setting", () => {
    expect(grokStallRetryMs({})).toBe(20_000);
    expect(grokStallRetryMs({ SAGAX_GROK_STALL_RETRY_MS: "0" })).toBe(0);
    expect(grokStallRetryMs({ SAGAX_GROK_STALL_RETRY_MS: "30000" })).toBe(30_000);
    expect(grokStallRetryMs({ SAGAX_GROK_STALL_RETRY_MS: "nope" })).toBe(20_000);
  });
});
