import type { EffortLevel } from "../../shared/wire";
import { t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";

const EFFORT_KEYS: Record<EffortLevel, LocaleKey> = {
  none: "model.effortLevel.none",
  low: "model.effortLevel.low",
  medium: "model.effortLevel.medium",
  high: "model.effortLevel.high",
  xhigh: "model.effortLevel.xhigh",
  max: "model.effortLevel.max",
};

/** A level as the person reads it, in their language ("xhigh" reads "X-High"). */
export function effortLabel(level: EffortLevel): string {
  return t(EFFORT_KEYS[level]);
}
