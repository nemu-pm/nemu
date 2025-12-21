/**
 * Japanese Learning Plugin Types
 */

export interface TextDetection {
  /** Bounding box in original image coordinates */
  x1: number
  y1: number
  x2: number
  y2: number
  /** Confidence score 0-1 */
  confidence: number
  /** Detected class */
  class: number
  /** Label: 'eng', 'ja', or 'unknown' */
  label: 'eng' | 'ja' | 'unknown'
}

export interface GrammarBreakdown {
  /** Original text */
  original: string
  /** Reading (furigana) */
  reading?: string
  /** English translation */
  translation?: string
  /** Word-by-word breakdown */
  words: GrammarWord[]
}

export interface GrammarWord {
  /** Surface form */
  surface: string
  /** Dictionary form */
  base?: string
  /** Reading */
  reading?: string
  /** Part of speech */
  pos?: string
  /** English meaning */
  meaning?: string
  /** Grammar notes */
  notes?: string
}

export interface TextDetectorSettings {
  /** Auto-run detection when page changes (requires WebGPU) */
  autoDetect: boolean
  /** Enable plugin for non-Japanese manga */
  enableForAllLanguages: boolean
  /** Minimum confidence threshold */
  minConfidence: number
}

/** State for selected text block OCR */
export interface OcrSelection {
  /** The selected detection */
  detection: TextDetection
  /** Page index of the selected block */
  pageIndex: number
  /** Click position on screen for animation origin */
  clickPosition: { x: number; y: number }
  /** Cropped image data URL of the selected region */
  croppedImageUrl: string | null
  /** Cropped image dimensions */
  croppedDimensions: { width: number; height: number } | null
}

/** OCR result from AI */
export interface OcrResult {
  text: string
  loading: boolean
  error: string | null
}

export const DEFAULT_SETTINGS: TextDetectorSettings = {
  autoDetect: false,
  enableForAllLanguages: false,
  minConfidence: 0.25,
}
