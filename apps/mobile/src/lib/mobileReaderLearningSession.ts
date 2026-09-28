/**
 * Owner decision pending: does nemu chat start over on every page turn?
 *
 * Today (true) a page turn clears the conversation together with the page's
 * OCR, grammar and audio — the chat is about "this page". Flip this one flag
 * to keep the conversation for the whole chapter instead (OCR, grammar and
 * audio still follow the page; a new chapter or source always starts over).
 */
export const MOBILE_READER_RESET_CHAT_ON_PAGE_TURN = true;

/** Identity whose change clears nemu chat. */
export function mobileReaderLearningChatResetKey(input: {
  resetOnPageTurn?: boolean;
  registryId: string;
  sourceId: string;
  chapterId: string;
  pageKey: string;
}): string {
  const perPage = input.resetOnPageTurn ?? MOBILE_READER_RESET_CHAT_ON_PAGE_TURN;
  return JSON.stringify([
    input.registryId,
    input.sourceId,
    input.chapterId,
    perPage ? input.pageKey : null,
  ]);
}

/** Identity whose change clears the page-scoped tools (OCR, grammar, audio, selection). */
export function mobileReaderLearningPageResetKey(input: {
  registryId: string;
  sourceId: string;
  chapterId: string;
  pageKey: string;
}): string {
  return JSON.stringify([input.registryId, input.sourceId, input.chapterId, input.pageKey]);
}
