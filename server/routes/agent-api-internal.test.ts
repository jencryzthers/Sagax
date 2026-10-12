import { describe, expect, it } from "vitest";

import { internalAgentApiTool } from "./agent-api-internal.ts";

describe("internalAgentApiTool", () => {
  it("names the tool of a POST to /api/internal/agent-api/<tool> only", () => {
    expect(internalAgentApiTool("POST", "/api/internal/agent-api/send_prompt")).toBe("send_prompt");
    expect(internalAgentApiTool("GET", "/api/internal/agent-api/send_prompt")).toBeNull();
    expect(internalAgentApiTool("POST", "/api/internal/agent-api/Send-Prompt")).toBeNull();
    expect(internalAgentApiTool("POST", "/api/internal/agent-api/send_prompt/x")).toBeNull();
    expect(internalAgentApiTool("POST", "/api/internal/act")).toBeNull();
  });
});
