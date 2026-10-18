import { useSyncExternalStore } from "react";
import { File, Paths } from "expo-file-system";
import {
  parseMobileCoverPreferenceStore,
  rememberMobileCoverPreference,
  serializeMobileCoverPreferenceStore,
  type MobileCoverPreferenceStore,
} from "@/lib/mobileCoverPreference";
import { mobileDesignExploreFlag } from "@/lib/mobileDesignExplore";
import { MOBILE_COVER_PERSIST_DELAY_MS } from "@/lib/mobileCoverTintStore";
import { createChangeListeners } from "@/lib/mobileChangeListeners";

/**
 * The remembered sharper cover per library title (`mobileCoverPreference`),
 * read synchronously on first use so the first frame after a cold start
 * already shows it, and written back debounced to one small cache file
 * (cover URLs and item ids only; best effort, like the tint file).
 */
const FILE_NAME = "nemu-cover-preference-v1.json";
let store: MobileCoverPreferenceStore | null = null;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
const changes = createChangeListeners();
/** Titles whose sources were already compared this session. */
const compared = new Set<string>();

function current(): MobileCoverPreferenceStore {
  if (store) return store;
  let text: string | null = null;
  try {
    const file = new File(Paths.cache, FILE_NAME);
    if (file.exists) text = file.textSync();
  } catch {
    text = null;
  }
  store = parseMobileCoverPreferenceStore(text);
  return store;
}

function getMobileExploreCoverPreference(libraryItemId: string | null | undefined): string | null {
  return libraryItemId ? (current().get(libraryItemId) ?? null) : null;
}

export function setMobileExploreCoverPreference(libraryItemId: string, url: string | null): void {
  compared.add(libraryItemId);
  if (!rememberMobileCoverPreference(current(), libraryItemId, url)) return;
  changes.notify();
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      new File(Paths.cache, FILE_NAME).writeSync(serializeMobileCoverPreferenceStore(current()));
    } catch {
      // Best effort.
    }
  }, MOBILE_COVER_PERSIST_DELAY_MS);
}

/** Whether this title's sources were compared this session (once is enough). */
export function wasMobileExploreCoverCompared(libraryItemId: string): boolean {
  return compared.has(libraryItemId);
}

export function markMobileExploreCoverCompared(libraryItemId: string): void {
  compared.add(libraryItemId);
}

function usePreferenceFromStore(libraryItemId: string | null | undefined): string | null {
  return useSyncExternalStore(
    changes.subscribe,
    () => getMobileExploreCoverPreference(libraryItemId),
    () => null,
  );
}

/**
 * The sharper cover remembered for a title, or null to show its own. Without
 * the design-explore flag this never reads the file and is always null.
 */
export const useMobileExploreCoverPreference: (libraryItemId: string | null | undefined) => string | null =
  mobileDesignExploreFlag ? usePreferenceFromStore : () => null;
