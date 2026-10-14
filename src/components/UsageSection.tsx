// App settings → Usage: what every bot has spent, so "which of my bots is
// costing me money" is answerable without a provider dashboard. Figures are
// banked per settled turn on each task (server/store.ts addTaskUsage).
// 2026-10-14: the per-bot card left this page. History grouped by bot (its
// default) shows the same figures for a period, and each bot's own usage is
// in its panel: one place per question, not three.
import { useStore } from "@/state/store";
import { UsageHistory } from "./UsageHistory";
import { PlanUsage } from "./PlanUsage";
import { canViewUsage } from "@/lib/viewer";

export function UsageSection() {
  const { state } = useStore();
  // Plan usage and history are admin reads. Mounting them as a member polls 403.
  if (!canViewUsage(state.config)) return null;
  return (
    <>
      <PlanUsage />
      <UsageHistory />
    </>
  );
}
