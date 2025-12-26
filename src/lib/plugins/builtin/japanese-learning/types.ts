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

export interface TextDetectorSettings {
  /** Auto-run detection when page changes */
  autoDetect: boolean
  /** Enable plugin for non-Japanese manga */
  enableForAllLanguages: boolean
  /** Minimum confidence threshold */
  minConfidence: number
}

/** OCR result from AI */
export interface OcrResult {
  text: string
  loading: boolean
  error: string | null
}

export interface OcrTranscriptLine {
  /** Reading order within the page (0..n-1). */
  order: number
  /** Bounding box in original image coordinates. */
  x1: number
  y1: number
  x2: number
  y2: number
  /** Detected class (language). */
  class: number
  /** Label: 'eng', 'ja', or 'unknown' */
  label: 'eng' | 'ja' | 'unknown'
  /** Confidence score 0-1 */
  confidence: number
  /** OCR text */
  text: string
}

export const DEFAULT_SETTINGS: TextDetectorSettings = {
  autoDetect: false,
  enableForAllLanguages: false,
  minConfidence: 0.25,
}
