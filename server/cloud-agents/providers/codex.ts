import type { CloudAgentProviderAdapter } from "./types.ts";

/** Placeholder until OpenAI Codex cloud agent HTTP is wired. */
export function createCodexCloudProvider(): CloudAgentProviderAdapter {
  const refuse = () => {
    throw new Error("Codex cloud agents are not available on this server yet.");
  };
  return {
    id: "codex",
    label: "OpenAI Codex (cloud)",
    launch: refuse,
    refresh: refuse,
    followUp: refuse,
    cancel: refuse,
    archive: refuse,
    listArtifacts: refuse,
    transcript: refuse,
    findByPr: refuse,
  };
}
