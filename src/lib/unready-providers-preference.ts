import { useSyncExternalStore } from "react";

export const SHOW_UNREADY_PROVIDERS_KEY = "omb-show-unready-providers";

// Renderer preference for the model picker rail: providers that need sign-in
// or have no access yet stay hidden unless this is on. Default off. Session
// choice survives storage that rejects writes.
let sessionChoice: boolean | undefined;
const listeners = new Set<() => void>();

function storage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function showUnreadyProviders(): boolean {
  if (sessionChoice !== undefined) return sessionChoice;
  try {
    return storage()?.getItem(SHOW_UNREADY_PROVIDERS_KEY) === "1";
  } catch {
    return false;
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function onStorage(event: StorageEvent) {
  if (event.key !== SHOW_UNREADY_PROVIDERS_KEY && event.key !== null) return;
  if (event.storageArea && event.storageArea !== storage()) return;
  sessionChoice = undefined;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

export function setShowUnreadyProviders(enabled: boolean): void {
  sessionChoice = enabled;
  try {
    storage()?.setItem(SHOW_UNREADY_PROVIDERS_KEY, enabled ? "1" : "0");
  } catch {
    // The visible setting still changes for this session when storage is full.
  }
  notify();
}

export function useShowUnreadyProviders(): boolean {
  return useSyncExternalStore(subscribe, showUnreadyProviders, () => false);
}
