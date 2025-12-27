/**
 * Global store for tracking source installation state.
 * Used to show a non-dismissible dialog when a source is being installed.
 */
import { create } from "zustand";

export interface InstallingSource {
  name: string;
  icon?: string;
}

interface SourceInstallState {
  /** Currently installing source, or null if none */
  installing: InstallingSource | null;
  /** Set the currently installing source (call with null when done) */
  setInstalling: (source: InstallingSource | null) => void;
}

export const useSourceInstallStore = create<SourceInstallState>((set) => ({
  installing: null,
  setInstalling: (source) => set({ installing: source }),
}));

/** Helper for non-React contexts */
export const sourceInstallStore = useSourceInstallStore;

