#!/usr/bin/env node
// Tiny MCP server for the live duplex acceptance call: one `wait` tool so
// topic A stays botBusy long enough for B/C to fork (issue #292 / Review 3).
import { createInterface } from "node:readline";

const lines = createInterface({ input: process.stdin });
lines.on("line", async (line) => {
  let request;
  try { request = JSON.parse(line); } catch { return; }
  if (request.id === undefined) return;
  let result;
  if (request.method === "initialize") {
    result = { protocolVersion: "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "wait", version: "1" } };
  } else if (request.method === "tools/list") {
    result = {
      tools: [{
        name: "wait",
        description: "Wait for N seconds before returning. Use this when the person asks you to wait, then answer.",
        inputSchema: {
          type: "object",
          properties: { seconds: { type: "number", description: "How many seconds to wait" } },
          required: ["seconds"],
          additionalProperties: false,
        },
      }],
    };
  } else if (request.method === "tools/call" && request.params?.name === "wait") {
    const raw = request.params.arguments;
    const args = typeof raw === "string" ? JSON.parse(raw) : (raw ?? {});
    const seconds = Math.min(60, Math.max(1, Number(args.seconds ?? args.duration) || 12));
    process.stderr.write(`[wait-mcp] sleep ${seconds}\n`);
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    result = { content: [{ type: "text", text: `waited ${seconds} seconds` }] };
  } else {
    process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, error: { code: -32601, message: "Method not found" } })}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", id: request.id, result })}\n`);
});
