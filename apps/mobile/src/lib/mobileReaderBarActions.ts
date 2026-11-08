/**
 * What the bar's buttons light up for. Detect text is on once the page has a
 * detection (running, read or failed), Nemu Chat while it has a conversation.
 */
export function mobileReaderBarActionStates(input: {
  ocrStatus: "idle" | "loading" | "ready" | "error";
  chatMessageCount: number;
  chatStreaming: boolean;
  dualReadEnabled: boolean;
}): { detectTextActive: boolean; nemuChatActive: boolean; dualReadEnabled: boolean } {
  return {
    detectTextActive: input.ocrStatus !== "idle",
    nemuChatActive: input.chatMessageCount > 0 || input.chatStreaming,
    dualReadEnabled: input.dualReadEnabled,
  };
}
