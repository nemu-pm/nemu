/**
 * Page-level OCR cache (v3).
 *
 * We intentionally do NOT read any legacy detection-only cache keys.
 * Cache entries include both detections and OCR transcript for a page.
 */

import { createPluginAsyncStorage } from '../../types'
import type { OcrTranscriptLine, TextDetection } from './types'

const storage = createPluginAsyncStorage('japanese-learning')

export interface OcrPageCacheKeyV3 {
  registryId: string
  sourceId: string
  mangaId: string
  chapterId: string
  localIndex: number
}

export interface OcrPageCacheValueV3 {
  version: 3
  detections: TextDetection[]
  transcript: OcrTranscriptLine[]
}

function makeKeyV3(k: OcrPageCacheKeyV3): string {
  return `ocr3:${k.registryId}:${k.sourceId}:${k.mangaId}:${k.chapterId}:${k.localIndex}`
}

export async function getCachedOcrPageV3(key: OcrPageCacheKeyV3): Promise<OcrPageCacheValueV3 | null> {
  return storage.get<OcrPageCacheValueV3>(makeKeyV3(key))
}

export async function setCachedOcrPageV3(key: OcrPageCacheKeyV3, value: OcrPageCacheValueV3): Promise<void> {
  await storage.set(makeKeyV3(key), value)
}
