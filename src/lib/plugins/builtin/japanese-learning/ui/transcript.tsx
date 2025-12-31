import { useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useTextDetectorStore } from '../store'
import { usePluginCtx } from '../../../context'
import { cn } from '@/lib/utils'
import type { TextDetection, OcrTranscriptLine } from '../types'
import { createTtsId, useTtsStore } from '@/stores/tts'
import { AudioWaveform } from '@/components/tts/audio-waveform'
import { getOcrPageRef } from '../page-ref'

interface TranscriptColumnProps {
  pageKey: string
  lines: OcrTranscriptLine[]
  imageUrl: string | undefined
}

interface LineTiming {
  start: number
  end: number
}

const IGNORE_CHAR_REGEX = /[\s\p{P}\p{S}]/u

function normalizeChar(char: string): string {
  return char.normalize('NFKC').toLowerCase()
}

function isIgnorableChar(char: string): boolean {
  return IGNORE_CHAR_REGEX.test(char)
}

function buildAlignmentEntries(alignment: { characters: string[]; startTimes: number[]; endTimes: number[] }) {
  const entries: Array<{ char: string; start: number; end: number }> = []
  let inTag = false
  for (let i = 0; i < alignment.characters.length; i++) {
    const rawChar = alignment.characters[i] ?? ''
    if (rawChar === '[') {
      inTag = true
      continue
    }
    if (rawChar === ']') {
      inTag = false
      continue
    }
    if (inTag) continue
    const normalized = normalizeChar(rawChar)
    if (!normalized || isIgnorableChar(normalized)) continue
    entries.push({
      char: normalized,
      start: alignment.startTimes[i] ?? 0,
      end: alignment.endTimes[i] ?? alignment.startTimes[i] ?? 0,
    })
  }
  return entries
}

function extractLineChars(text: string): string[] {
  const chars: string[] = []
  for (const raw of Array.from(text)) {
    const normalized = normalizeChar(raw)
    if (!normalized || isIgnorableChar(normalized)) continue
    chars.push(normalized)
  }
  return chars
}

function findNextMatch(
  entries: Array<{ char: string }>,
  startIndex: number,
  target: string,
  lookahead: number
) {
  const limit = Math.min(entries.length, startIndex + lookahead)
  for (let i = startIndex; i < limit; i++) {
    if (entries[i]?.char === target) return i
  }
  return -1
}

function buildLineTimings(
  lines: OcrTranscriptLine[],
  alignment: { characters: string[]; startTimes: number[]; endTimes: number[]; isFinal?: boolean }
) {
  const entries = buildAlignmentEntries(alignment)
  if (entries.length === 0) return lines.map(() => null)

  const lineChars = lines.map((line) => extractLineChars(line.text))
  const totalChars = lineChars.reduce((sum, chars) => sum + chars.length, 0)
  const duration = alignment.endTimes[alignment.endTimes.length - 1] ?? 0
  const isFinal = alignment.isFinal ?? true
  let cursor = 0

  const timings: Array<LineTiming | null> = lineChars.map((chars) => {
    if (chars.length === 0) return null
    let startIndex = -1
    let endIndex = -1
    let matched = 0
    const lookahead = Math.max(40, chars.length * 3)

    for (const char of chars) {
      const found = findNextMatch(entries, cursor, char, lookahead)
      if (found === -1) continue
      if (startIndex === -1) startIndex = found
      endIndex = found
      matched += 1
      cursor = found + 1
    }

    const matchRatio = matched / chars.length
    if (startIndex === -1 || endIndex === -1 || matchRatio < 0.35) {
      return null
    }
    return { start: entries[startIndex].start, end: entries[endIndex].end }
  })

  if (isFinal && totalChars > 0 && duration > 0) {
    let running = 0
    for (let i = 0; i < lineChars.length; i++) {
      const chars = lineChars[i]
      if (timings[i] || chars.length === 0) {
        running += chars.length
        continue
      }
      const start = (running / totalChars) * duration
      const end = ((running + chars.length) / totalChars) * duration
      timings[i] = { start, end }
      running += chars.length
    }
  }

  return timings
}

function TranscriptColumn({ pageKey, lines, imageUrl }: TranscriptColumnProps) {
  const { t } = useTranslation()
  const openOcrSheetFromTranscript = useTextDetectorStore((s) => s.openOcrSheetFromTranscript)
  const setHoveredLine = useTextDetectorStore((s) => s.setHoveredLine)
  const setBoxPopout = useTextDetectorStore((s) => s.setBoxPopout)
  const setPlayingLine = useTextDetectorStore((s) => s.setPlayingLine)
  const hoveredLine = useTextDetectorStore((s) => s.hoveredLine)
  const currentAudioId = useTtsStore((s) => s.currentAudioId)
  const currentTime = useTtsStore((s) => s.currentTime)
  const ensureAlignment = useTtsStore((s) => s.ensureAlignment)

  const transcriptText = useMemo(
    () => lines.map((line) => line.text).filter(Boolean).join('\n'),
    [lines]
  )
  const ttsId = useMemo(
    () => (transcriptText ? createTtsId(`transcript-${pageKey}`, transcriptText) : null),
    [pageKey, transcriptText]
  )
  const hasPlayed = useTtsStore((s) => (ttsId ? s.playedIds.has(ttsId) : false))
  const markPlayed = useTtsStore((s) => s.markPlayed)
  const alignment = useTtsStore((s) => (ttsId ? s.alignments.get(ttsId) : null))
  const isCurrent = currentAudioId === ttsId

  useEffect(() => {
    if (!ttsId || !transcriptText) return
    if (transcriptText.length > 500) return
    if (!hasPlayed && !isCurrent) return
    if (alignment) return
    ensureAlignment(ttsId, transcriptText, { source: 'transcript' }).catch(() => undefined)
  }, [alignment, ensureAlignment, hasPlayed, isCurrent, transcriptText, ttsId])

  const lineTimings = useMemo(
    () => (alignment ? buildLineTimings(lines, alignment) : null),
    [alignment, lines]
  )
  const lastPlayingRef = useRef<string | null>(null)

  useEffect(() => {
    if (!isCurrent || !lineTimings) {
      if (lastPlayingRef.current) {
        lastPlayingRef.current = null
        setPlayingLine(null)
      }
      return
    }
    const activeIndex = lineTimings.findIndex(
      (timing) => timing && currentTime >= timing.start && currentTime <= timing.end
    )
    if (activeIndex === -1) {
      if (lastPlayingRef.current) {
        lastPlayingRef.current = null
        setPlayingLine(null)
      }
      return
    }
    const activeLine = lines[activeIndex]
    if (!activeLine) return
    const key = `${pageKey}:${activeLine.order}`
    if (lastPlayingRef.current === key) return
    lastPlayingRef.current = key
    setPlayingLine({
      pageKey,
      x1: activeLine.x1,
      y1: activeLine.y1,
      x2: activeLine.x2,
      y2: activeLine.y2,
    })
  }, [currentTime, isCurrent, lineTimings, lines, pageKey, setPlayingLine])

  if (lines.length === 0) {
    return (
      <div className="transcript-empty flex-1 min-w-0">
        No text detected
      </div>
    )
  }

  // Check if a line matches the current hover
  const isLineHovered = (line: OcrTranscriptLine) =>
    hoveredLine &&
    hoveredLine.pageKey === pageKey &&
    hoveredLine.x1 === line.x1 &&
    hoveredLine.y1 === line.y1 &&
    hoveredLine.x2 === line.x2 &&
    hoveredLine.y2 === line.y2

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full">
      {ttsId && transcriptText ? (
        <div className="pb-2 px-1">
          <AudioWaveform
            ttsId={ttsId}
            text={transcriptText}
            source="transcript"
            showWaveform={hasPlayed || isCurrent}
            className="w-full border-border/60 bg-transparent"
            waveformClassName="flex-1 min-w-0"
            onBeforePlay={() => {
              if (transcriptText.length > 500) {
                toast.error(
                  t('plugin.japaneseLearning.tts.tooLong', {
                    defaultValue: 'This page is too long for full-page TTS. Use sentence-by-sentence instead.',
                  })
                )
                return false
              }
              if (ttsId) {
                markPlayed(ttsId)
              }
              return true
            }}
          />
        </div>
      ) : null}
      <div className="flex-1 min-h-0">
        <div className="h-full overflow-y-auto space-y-0.5 px-1 py-1">
          {lines.map((line, index) => {
            const isHovered = isLineHovered(line)
            const timing = lineTimings?.[index]
            const isReading = Boolean(
              isCurrent &&
                timing &&
                currentTime >= timing.start &&
                currentTime <= timing.end
            )

            return (
              <button
                key={line.order}
                type="button"
                onClick={(e) => {
                  const clickPosition = { x: e.clientX, y: e.clientY }

                  if (imageUrl) {
                    // Set popout immediately (spinner), then fill with cropped image when ready.
                    const box: TextDetection = {
                      x1: line.x1,
                      y1: line.y1,
                      x2: line.x2,
                      y2: line.y2,
                      confidence: line.confidence,
                      class: line.class,
                      label: line.label,
                    }
                    setBoxPopout({
                      pageKey,
                      box,
                      clickPosition,
                      croppedImageUrl: null,
                      croppedDimensions: null,
                    })

                    ;(async () => {
                      try {
                        const res = await fetch(imageUrl)
                        if (!res.ok) throw new Error(`Failed to fetch image for popout: ${res.status} ${res.statusText}`)
                        const sourceBlob = await res.blob()
                        const bitmap = await createImageBitmap(sourceBlob)

                        const padding = 10
                        const cropX = Math.max(0, line.x1 - padding)
                        const cropY = Math.max(0, line.y1 - padding)
                        const cropWidth = Math.min(bitmap.width - cropX, line.x2 - line.x1 + padding * 2)
                        const cropHeight = Math.min(bitmap.height - cropY, line.y2 - line.y1 + padding * 2)
                        if (cropWidth <= 1 || cropHeight <= 1) return

                        const canvas = document.createElement('canvas')
                        canvas.width = cropWidth
                        canvas.height = cropHeight
                        const ctx2d = canvas.getContext('2d')
                        if (!ctx2d) return
                        ctx2d.drawImage(bitmap, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight)

                        const blob = await new Promise<Blob>((resolve, reject) => {
                          canvas.toBlob(
                            (b) => (b ? resolve(b) : reject(new Error('Failed to create blob'))),
                            'image/jpeg',
                            0.9
                          )
                        })

                        const blobUrl = URL.createObjectURL(blob)
                        setBoxPopout({
                          pageKey,
                          box,
                          clickPosition,
                          croppedImageUrl: blobUrl,
                          croppedDimensions: { width: cropWidth, height: cropHeight },
                        })
                        bitmap.close()
                      } catch (err) {
                        console.warn('[JapaneseLearning] Failed to crop transcript selection for popout:', err)
                      }
                    })()
                  }

                  openOcrSheetFromTranscript(pageKey, line, { preserveBoxPopout: true })
                }}
                onMouseEnter={() => setHoveredLine({ pageKey, x1: line.x1, y1: line.y1, x2: line.x2, y2: line.y2 })}
                onMouseLeave={() => setHoveredLine(null)}
                className={cn(
                  'transcript-line',
                  isHovered && 'transcript-line-hovered',
                  isReading && !isHovered && 'transcript-line-reading'
                )}
                lang="ja"
              >
                {line.text}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function OcrTranscriptPopoverContent() {
  const ctx = usePluginCtx()
  const settings = useTextDetectorStore((s) => s.settings)
  const transcripts = useTextDetectorStore((s) => s.transcripts)

  // In scrolling mode, only show the current (most prominent) page transcript
  const visiblePages = ctx.readingMode === 'scrolling'
    ? [ctx.currentPageIndex]
    : ctx.visiblePageIndices
  const isRTL = ctx.readingMode === 'rtl'
  const isTwoPage = visiblePages.length >= 2

  const pageRefs = useMemo(
    () => visiblePages.map((pageIndex) => getOcrPageRef(ctx, pageIndex)).filter(Boolean),
    [ctx, visiblePages]
  )

  // Get filtered transcripts for visible pages
  const pageTranscripts = pageRefs.map((ref) => {
    const raw = transcripts.get(ref!.pageKey) ?? []
    return raw.filter(
      (line) => line.label === 'ja' && line.confidence >= settings.minConfidence
    )
  })

  // For RTL, reverse the column order (right page first visually = left column)
  const orderedPages = isRTL ? [...pageRefs].reverse() : pageRefs
  const orderedTranscripts = isRTL ? [...pageTranscripts].reverse() : pageTranscripts

  return (
    <div
      className={cn(
        'transcript-popover-content relative h-[50vh] max-h-[50vh] overflow-hidden overscroll-contain',
        isTwoPage ? 'w-[480px] max-w-[85vw]' : 'w-[260px] max-w-[75vw]'
      )}
    >
      <div className={cn('h-full', isTwoPage && 'flex gap-0')}>
        {orderedPages.map((ref, i) => (
          <div key={ref!.pageKey} className="contents">
            {isTwoPage && i > 0 && <div className="transcript-column-divider mx-2 shrink-0" />}
            <div className="h-full min-w-0 flex-1">
              <TranscriptColumn
                pageKey={ref!.pageKey}
                lines={orderedTranscripts[i]}
                imageUrl={ctx.getPageImageUrl(ref!.pageIndex)}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
