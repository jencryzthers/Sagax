import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SPAWNED_PROXIES } from "../../proxy-paths.ts";
import { removeTempDir } from "../../testing/cleanup.ts";
import { gateReadOnlyTools, GROK_APPROVAL_GATE_FILE, grokApprovalGateEnabled } from "./grok-approval-gate.ts";

const bridge = { command: process.execPath, args: [SPAWNED_PROXIES.perspicax], env: { SAGAX_PERSPICAX_PROFILE: "pr_1" } };
const WRITES = [
  "cw_psa__write", "cw_psa__action", "memory_write", "memory_forget", "memory_promote", "memory_propose",
  "sagax_send", "sagax_approve", "sagax_nudge", "sagax_routine_run", "flow_action", "ask_person", "api_upload",
  "run_command", "write_file", "create_bot", "send_message", "workspace_write",
];

describe("grokApprovalGateEnabled", () => {
  it("is on only for listed bots or all, and off for anything else", () => {
    const dir = mkdtempSync(join(tmpdir(), "gate-flag-"));
    try {
      const write = (content: string) => writeFileSync(join(dir, GROK_APPROVAL_GATE_FILE), content);
      expect(grokApprovalGateEnabled("b1", dir)).toBe(false);
      write(JSON.stringify({ bots: ["b1"] }));
      expect(grokApprovalGateEnabled("b1", dir)).toBe(true);
      expect(grokApprovalGateEnabled("b2", dir)).toBe(false);
      expect(grokApprovalGateEnabled(undefined, dir)).toBe(false);
      write(JSON.stringify({ bots: "all" }));
      expect(grokApprovalGateEnabled("b2", dir)).toBe(true);
      for (const bad of ["", "nope", "[]", JSON.stringify({ bots: "b1" }), JSON.stringify({ bots: [1] }), JSON.stringify({})]) {
        write(bad);
        expect(grokApprovalGateEnabled("b1", dir)).toBe(false);
      }
    } finally {
      removeTempDir(dir);
    }
  });
});

describe("gateReadOnlyTools", () => {
  it("lets the reviewed reads through and never a write", () => {
    const agents = gateReadOnlyTools({ name: "agents", builtin: true });
    const perspicax = gateReadOnlyTools({ name: "perspicax_jc", builtin: false, spec: bridge });
    expect(agents).toContain("list_bots");
    expect(perspicax).toEqual(expect.arrayContaining(["api_search", "cw_psa__query", "memory_search", "flow"]));
    for (const tool of WRITES) {
      expect(agents).not.toContain(tool);
      expect(perspicax).not.toContain(tool);
    }
  });

  it("gives every other server nothing, whatever it is named", () => {
    expect(gateReadOnlyTools({ name: "agents", builtin: false, spec: bridge })).toEqual([]);
    expect(gateReadOnlyTools({ name: "perspicax_fake", builtin: false, spec: { command: "node", args: ["/tmp/x.mjs"], env: { SAGAX_PERSPICAX_PROFILE: "p" } } })).toEqual([]);
    for (const name of ["composio", "browser", "computer", "sagax-environment", "sagax-computer", "github"]) {
      expect(gateReadOnlyTools({ name, builtin: name !== "sagax-environment" && name !== "sagax-computer" && name !== "github" })).toEqual([]);
    }
  });
});
