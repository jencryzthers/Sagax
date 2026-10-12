// When a streaming STT partial is stable enough to start the LLM before
// the person has stopped talking (issue #292). Pure. The in-flight send is
// discarded if the next partial says something else.

import { materiallyDifferent } from "./latency";
import { completeClause, incompleteClause } from "./turns";

const MIN_WORDS = 4;
const MIN_WORDS_SILENCE = 4;

function wordCount(text: string): number {
  return (text.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/[a-z0-9]+/g) ?? []).length;
}

/** A closed clause, or four stable words. Three words ("What is two",
 * "What is 2 +") is still an unfinished question: wait. */
export function maySpeculate(text: string, inSilence = false): boolean {
  if (completeClause(text)) return true;
  const min = inSilence ? MIN_WORDS_SILENCE : MIN_WORDS;
  return wordCount(text) >= min && !incompleteClause(text);
}

/** The person kept talking and the question changed: cancel that send. */
export function discardSpeculation(sent: string, nextPartial: string): boolean {
  return materiallyDifferent(sent, nextPartial);
}
