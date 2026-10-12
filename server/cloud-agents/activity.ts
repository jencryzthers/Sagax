import type { BotActivityItem, BotActivityStatus } from "../../shared/bot-activity.ts";
import { cloudAgentStatusActive, type CloudAgentRecord } from "../../shared/cloud-agents.ts";

function mapStatus(status: CloudAgentRecord["status"]): BotActivityStatus {
  if (status === "creating") return "queued";
  if (status === "running") return "running";
  if (status === "idle") return "waiting";
  if (status === "finished") return "finished";
  if (status === "failed") return "failed";
  if (status === "cancelled") return "stopped";
  return "stopped";
}

export function cloudAgentActivityItem(botName: string, record: CloudAgentRecord): BotActivityItem {
  const active = cloudAgentStatusActive(record.status);
  return {
    id: `cloud:${record.id}`,
    kind: "session",
    botId: record.botId,
    botName,
    title: record.name,
    status: mapStatus(record.status),
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    ...(active ? {} : { endedAt: record.endedAt ?? record.updatedAt }),
    coding: true,
    threadId: record.threadId,
    ...(record.url ? { currentStep: record.url } : active ? { currentStep: record.provider } : {}),
    ...(active ? { canStop: true } : {}),
    code: record.gitBranches.length || record.repos.length
      ? {
        pullRequests: record.gitBranches.filter((b) => b.prUrl).map((b) => ({
          repo: b.repoUrl,
          url: b.prUrl,
          action: "opened" as const,
          at: record.updatedAt,
        })),
        branches: record.gitBranches.filter((b) => b.branch).map((b) => ({
          name: b.branch!,
          repo: b.repoUrl,
          pushed: true,
          at: record.updatedAt,
        })),
        commits: [],
      }
      : undefined,
  };
}
