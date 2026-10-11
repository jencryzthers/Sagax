// When a streaming STT partial is stable enough to start the LLM before
// the person has stopped talking (issue #292). Pure. The in-flight send is
// discarded if the next partial says something else.

import { materiallyDifferent } from "./latency";
import { incompleteClause } from "./turns";

const MIN_WORDS = 4;

function wordCount(text: string): number {
  return (text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) ?? []).length;
}

/** Four or more words that are not an unfinished clause: start the LLM now. */
export function maySpeculate(text: string): boolean {
  return wordCount(text) >= MIN_WORDS && !incompleteClause(text);
}

/** The person kept talking and the question changed: cancel that send. */
export function discardSpeculation(sent: string, nextPartial: string): boolean {
  return materiallyDifferent(sent, nextPartial);
}
