/**
 * Page-level OCR cache (v2).
 *
 * We intentionally do NOT read any legacy detection-only cache keys.
 * Cache entries include both detections and OCR transcript for a page.
 */

import { createPluginAsyncStorage } from '../../types'
import type { OcrTranscriptLine, TextDetection } from './types'

const storage = createPluginAsyncStorage('japanese-learning')

export interface OcrPageCacheKeyV2 {
  registryId: string
  sourceId: string
  mangaId: string
  chapterId: string
  pageIndex: number
}

export interface OcrPageCacheValueV2 {
  version: 2
  detections: TextDetection[]
  transcript: OcrTranscriptLine[]
}

function makeKeyV2(k: OcrPageCacheKeyV2): string {
  return `ocr2:${k.registryId}:${k.sourceId}:${k.mangaId}:${k.chapterId}:${k.pageIndex}`
}

export async function getCachedOcrPageV2(key: OcrPageCacheKeyV2): Promise<OcrPageCacheValueV2 | null> {
  return storage.get<OcrPageCacheValueV2>(makeKeyV2(key))
}

export async function setCachedOcrPageV2(key: OcrPageCacheKeyV2, value: OcrPageCacheValueV2): Promise<void> {
  await storage.set(makeKeyV2(key), value)
}
