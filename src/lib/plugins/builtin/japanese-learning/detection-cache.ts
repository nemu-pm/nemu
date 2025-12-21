/**
 * Detection cache using plugin async storage abstraction.
 */
import { createPluginAsyncStorage } from '../../types'
import type { TextDetection } from './types'

// Use plugin system's async storage API
const storage = createPluginAsyncStorage('japanese-learning')

export interface DetectionCacheKey {
  registryId: string
  sourceId: string
  mangaId: string
  chapterId: string
  pageIndex: number
}

function makeKey(k: DetectionCacheKey): string {
  return `det:${k.registryId}:${k.sourceId}:${k.mangaId}:${k.chapterId}:${k.pageIndex}`
}

export async function getCachedDetections(key: DetectionCacheKey): Promise<TextDetection[] | null> {
  return storage.get<TextDetection[]>(makeKey(key))
}

export async function setCachedDetections(key: DetectionCacheKey, detections: TextDetection[]): Promise<void> {
  await storage.set(makeKey(key), detections)
}

export async function clearDetectionCache(): Promise<void> {
  await storage.clear()
}

