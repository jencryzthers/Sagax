// Local spoken filler at tool start: words in the call language, never a
// tone. Played on the first tool of a thinking turn so there is no dead air
// while the harness works. The model's own chip is skipped once the filler
// has been said. Barge-in cancels it; the next user turn can play again.

export const TOOL_FILLER_COPY = {
  en: "Let me look.",
  fr: "Je regarde.",
  pt: "Deixa eu ver.",
} as const;

export interface ToolFillerState {
  played: boolean;
  cancelled: boolean;
}

export function createToolFillerState(): ToolFillerState {
  return { played: false, cancelled: false };
}

export function toolFillerLanguage(voiceLanguage?: string, uiLocale?: string): string {
  if (voiceLanguage && voiceLanguage !== "auto") return voiceLanguage;
  if (uiLocale && uiLocale !== "auto") return uiLocale;
  return "en";
}

export function toolFillerText(language: string | undefined): string {
  const key = (language ?? "en").toLowerCase();
  if (key.startsWith("fr")) return TOOL_FILLER_COPY.fr;
  if (key.startsWith("pt")) return TOOL_FILLER_COPY.pt;
  return TOOL_FILLER_COPY.en;
}

/** A filler is spoken words, never an empty string or a control beep. */
export function isSpokenFiller(text: string): boolean {
  return /[a-zà-ÿ]/i.test(text);
}

export function shouldPlayToolFiller(state: ToolFillerState, opts: { thinking: boolean; toolStarted: boolean }): boolean {
  return opts.thinking && opts.toolStarted && !state.played && !state.cancelled;
}

export function shouldSkipToolChip(state: ToolFillerState): boolean {
  return state.played;
}

export function noteToolFillerPlayed(state: ToolFillerState): ToolFillerState {
  return { played: true, cancelled: state.cancelled };
}

export function cancelToolFiller(state: ToolFillerState): ToolFillerState {
  return { played: state.played, cancelled: true };
}

export function resetToolFiller(_state?: ToolFillerState): ToolFillerState {
  return createToolFillerState();
}
