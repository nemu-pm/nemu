/**
 * Nemu Chat Tool Context Helpers
 */

import type { ReaderPluginContext } from '../../../types'
import type { OcrPageCacheKeyV3 } from '../ocr-page-cache'

export interface ChatToolContext {
  chapterId?: string
  resolvePageIndex?: (pageNumber: number, chapterId?: string) => number | null
  getPageImageBlob?: (pageIndex: number) => Promise<Blob | null>
  getPageKey?: (pageIndex: number) => string | undefined
  getCacheKey?: (pageIndex: number) => OcrPageCacheKeyV3 | undefined
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

  const getPageKey = (pageIndex: number): string | undefined => {
    const meta = ctx.getPageMeta(pageIndex)
    if (!meta || meta.kind !== 'page') return undefined
    if (!meta.chapterId || typeof meta.localIndex !== 'number') return undefined
    return meta.key ?? `${meta.chapterId}:${meta.localIndex}`
  }

  const getCacheKey = (pageIndex: number): OcrPageCacheKeyV3 | undefined => {
    const meta = ctx.getPageMeta(pageIndex)
    if (!meta || meta.kind !== 'page') return undefined
    if (!meta.chapterId || typeof meta.localIndex !== 'number') return undefined
    return {
      registryId: ctx.registryId,
      sourceId: ctx.sourceId,
      mangaId: ctx.mangaId,
      chapterId: meta.chapterId,
      localIndex: meta.localIndex,
    }
  }

  return {
    chapterId: ctx.chapterId,
    resolvePageIndex: ctx.resolvePageIndex,
    getPageImageBlob,
    getPageKey,
    getCacheKey,
  }
}

