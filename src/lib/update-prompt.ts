// The sidebar's update button reopens the update dialog after "Not now".
// UpdateBanner owns the dialog; this is the one signal between the two, a
// counter it watches so each click asks again even for the same version.
import { useSyncExternalStore } from "react";

let requests = 0;
const listeners = new Set<() => void>();

export function openUpdatePrompt(): void {
  requests += 1;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The number of times the update dialog was asked for; a change means
 * "show it again". */
export function useUpdatePromptRequests(): number {
  return useSyncExternalStore(subscribe, () => requests, () => requests);
}
