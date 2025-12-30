/**
 * Nemu Chat Tool Context Helpers
 */

import type { ReaderPluginContext } from '../../../types'
import type { OcrPageCacheKeyV2 } from '../ocr-page-cache'

export interface ChatToolContext {
  chapterId?: string
  resolvePageIndex?: (pageNumber: number, chapterId?: string) => number | null
  getPageImageBlob?: (pageIndex: number) => Promise<Blob | null>
  getCacheKey?: (pageIndex: number) => OcrPageCacheKeyV2 | undefined
}

export function createChatToolContext(ctx: ReaderPluginContext): ChatToolContext {
  const getPageImageBlob =
    ctx.getPageImageBlob ??
    (async (pageIndex: number) => {
      const url = ctx.getPageImageUrl(pageIndex)
      if (!url) return null
      try {
        const res = await fetch(url)
        if (!res.ok) return null
        return await res.blob()
      } catch {
        return null
      }
    })

  const getCacheKey = (pageIndex: number): OcrPageCacheKeyV2 | undefined => {
    const meta = ctx.getPageMeta(pageIndex)
    const chapterId = meta?.kind === 'page' ? meta.chapterId ?? ctx.chapterId : ctx.chapterId
    if (!chapterId) return undefined
    return {
      registryId: ctx.registryId,
      sourceId: ctx.sourceId,
      mangaId: ctx.mangaId,
      chapterId,
      pageIndex,
    }
  }

  return {
    chapterId: ctx.chapterId,
    resolvePageIndex: ctx.resolvePageIndex,
    getPageImageBlob,
    getCacheKey,
  }
}

