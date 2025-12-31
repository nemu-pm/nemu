import type { ReaderPluginContext } from '../../types'
import type { OcrPageCacheKeyV3 } from './ocr-page-cache'

export interface OcrPageRef {
  pageIndex: number
  pageKey: string
  chapterId: string
  localIndex: number
  cacheKey: OcrPageCacheKeyV3
}

export function getOcrPageRef(ctx: ReaderPluginContext, pageIndex: number): OcrPageRef | null {
  const meta = ctx.getPageMeta(pageIndex)
  if (!meta || meta.kind !== 'page') return null
  if (!meta.chapterId) return null
  if (typeof meta.localIndex !== 'number' || !Number.isFinite(meta.localIndex)) return null
  const pageKey = meta.key ?? `${meta.chapterId}:${meta.localIndex}`
  return {
    pageIndex,
    pageKey,
    chapterId: meta.chapterId,
    localIndex: meta.localIndex,
    cacheKey: {
      registryId: ctx.registryId,
      sourceId: ctx.sourceId,
      mangaId: ctx.mangaId,
      chapterId: meta.chapterId,
      localIndex: meta.localIndex,
    },
  }
}


