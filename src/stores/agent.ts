/**
 * Agent State Store
 *
 * Tracks Nemu Agent connection status and provides reactive updates.
 */

import { create } from "zustand";
import { getAgentStatus, type AgentStatus } from "@/lib/agent";

interface AgentStore {
  /** Current agent status */
  status: AgentStatus;
  /** Whether a status check is in progress */
  checking: boolean;
  /** Timestamp of last status check */
  lastChecked: number | null;
  /** Check agent status (async) */
  checkStatus: () => Promise<void>;
}

export const useAgentStore = create<AgentStore>((set) => ({
  status: { available: false },
  checking: false,
  lastChecked: null,

  checkStatus: async () => {
    set({ checking: true });
    const status = await getAgentStatus(true);
    set({
      status,
      checking: false,
      lastChecked: Date.now(),
    });
  },
}));

// Auto-check on app start
if (typeof window !== "undefined") {
  // Initial check after short delay (let app hydrate first)
  setTimeout(() => {
    useAgentStore.getState().checkStatus();
  }, 500);

  // Re-check periodically (every 30s)
  setInterval(() => {
    useAgentStore.getState().checkStatus();
  }, 30000);
}

/**
 * Hook to get current agent availability
 * Re-renders when status changes
 */
export function useAgentAvailable(): boolean {
  return useAgentStore((s) => s.status.available);
}

/**
 * Hook to get full agent status
 */
export function useAgentStatus(): AgentStatus {
  return useAgentStore((s) => s.status);
}

