/**
 * Identity whose change clears the page-scoped Japanese Learning tools (OCR,
 * grammar, audio, selection). Nemu chat is not page-scoped: its thread lives
 * per reader session in `mobileJapaneseLearningChatSession`, as on web.
 */
export function mobileReaderLearningPageResetKey(input: {
  registryId: string;
  sourceId: string;
  chapterId: string;
  pageKey: string;
}): string {
  return JSON.stringify([input.registryId, input.sourceId, input.chapterId, input.pageKey]);
}
