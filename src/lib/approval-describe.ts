// The approval wording, in the person's language: the shared generator
// (shared/approval-describe.ts) with the app's catalog and locale. The
// server words the same card and its push with the generator's English.
import { activeLocale, t } from "@/lib/i18n";
import type { LocaleKey } from "@/locales";
import * as shared from "../../shared/approval-describe";
import type { ApprovalDescription, ApprovalPlain, ApprovalRisk, ApprovalWords, ToolHints } from "../../shared/approval-describe";

export type { ApprovalDescription, ApprovalPlain, ApprovalRisk, ParsedToolId, ToolHints } from "../../shared/approval-describe";
export { dateRange, isTechnicalText, mcpAllowKey, parseArgs, parseToolId, productFor, riskFor } from "../../shared/approval-describe";

/** The catalog words, read at call time (the language can change). */
export function appWords(): ApprovalWords {
  return { locale: activeLocale(), t: (key, vars) => t(key as LocaleKey, vars) };
}

export function describeApproval(tool: string | undefined, input: string | undefined, hints?: ToolHints, now = new Date()): ApprovalDescription {
  return shared.describeApproval(tool, input, hints, now, appWords());
}

export function summarizeArgs(args: Record<string, unknown> | undefined, text: string, now = new Date()): string | undefined {
  return shared.summarizeArgs(args, text, now, appWords());
}

export function formatDateRange(range: { from: Date; to: Date }, now = new Date()): string {
  return shared.formatDateRange(range, now, appWords());
}

export function approvalAction(tool: string | undefined, input: string | undefined, hints?: ToolHints): string {
  return shared.approvalAction(tool, input, hints, appWords());
}

export function approvalPlain(input: Parameters<typeof shared.approvalPlain>[0]): ApprovalPlain {
  return shared.approvalPlain(input, appWords());
}

export function describeAllowRule(key: string, nameOf?: (id: string) => string | undefined): string {
  return shared.describeAllowRule(key, appWords(), nameOf);
}

export const RISK_LABEL = shared.RISK_LABEL as Record<ApprovalRisk, LocaleKey>;
